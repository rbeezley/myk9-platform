/**
 * Secretary Entry Management Queries
 *
 * Database queries for trial secretaries to manage show entries.
 * Note: Each row in the entries table represents one dog's entry into one class.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import {
  replicatedEntriesTable,
  type ReplicatedEntry,
} from '@/services/replication/ReplicatedEntriesTable';
import { getReplicatedSecretaryEntriesForShow } from './secretaryReadReplication';
import type { EntryStatus } from '@/types/entry-lifecycle';
import type { PendingEntry, SecretaryStatusEntrySeed } from './secretaryTypes';
import { postgrestGetSecretaryEntriesForShow } from './secretaryPostgrest';
import type { EntryStatusCheckInContext } from './statusCheckIn';
import { buildReplicatedEntryStatusUpdate } from './entryStatusUpdate';

export { buildReplicatedEntryStatusUpdate };
import { logger } from '@/services/LoggingService';
import { isRawEntryInEntryManagementPendingBucket } from '@/utils/entryCountSelectors';
import { SECRETARY_ENTRIES_READ_ERROR } from './secretaryReadErrors';
import { hydrateSecretaryEntriesForShow } from './secretaryReadHydration';
import { hasUnsavedLocalEntryWrites } from '@/services/replication/entriesShowSyncState';
import { verifySecretaryEmptyShow } from './secretaryEmptyProof';
export type { PendingEntry, SecretaryEntry, SecretaryStatusEntrySeed } from './secretaryTypes';

function toPendingEntry(row: Record<string, unknown>): PendingEntry {
  const person = row.people as { first_name: string; last_name: string } | null;
  const dog = row.dogs as { call_name: string } | null;
  const cls = row.classes as { name: string } | null;
  const show = row.shows as { name: string } | null;

  return {
    id: row.id as string,
    showId: row.show_id as string,
    showName: show?.name ?? '',
    className: cls?.name ?? '',
    handlerName: person ? `${person.first_name} ${person.last_name}` : '',
    dogName: dog?.call_name ?? '',
    submittedAt: (row.submitted_at ?? row.created_at) as string,
    entry_status: (row.entry_status as string | null) ?? null,
    check_in_status: (row.check_in_status as string | null) ?? null,
  };
}

export const getPendingEntries = async (showIdFilter?: string): Promise<PendingEntry[]> => {
  let query = supabase
    .from('entries')
    .select(
      'id, show_id, submitted_at, entry_status, check_in_status, dogs(call_name), people(first_name, last_name), classes(name), shows(name)'
    )
    .or('entry_status.is.null,entry_status.not.in.(confirmed,waitlisted,withdrawn)')
    // MYK9-1408: soft_delete_entry leaves entry_status untouched, so a removed
    // entry still matches the status filter; drop tombstones here like every
    // sibling read.
    .is('deleted_at', null);

  if (showIdFilter && showIdFilter !== 'all') {
    query = query.eq('show_id', showIdFilter);
  }

  const { data, error } = await query.order('submitted_at', {
    ascending: true,
    nullsFirst: false,
  });

  if (error) {
    throw createDatabaseError(error, 'entries', 'get_pending_entries');
  }

  return (data ?? []).map(toPendingEntry).filter(isRawEntryInEntryManagementPendingBucket);
};

export const getEntriesForShow = async (showId: string) => {
  const startTime = Date.now();

  try {
    const result = await getReplicatedSecretaryEntriesForShow(showId);
    if (
      result.data.length === 0 &&
      !(await unsavedWritesOrUnknown(showId)) &&
      (await verifySecretaryEmptyShow(showId))
    ) {
      logQuery('entries', 'get_entries_for_show', Date.now() - startTime);
      return { data: result.data, error: null };
    }
    if (!result.isColdStore && result.data.length > 0) {
      logQuery('entries', 'get_entries_for_show', Date.now() - startTime);
      return { data: result.data, error: null };
    }
    // Hydrate directly; the app-wide sync provider has no show scope.
    logger.warn('Secretary entries replication cold; hydrating scoped replica', 'database', {
      showId,
      operation: 'get_entries_for_show',
    });
    const hydratedData = await hydrateSecretaryEntriesForShow(showId, startTime);
    if (hydratedData?.length) {
      return { data: hydratedData, error: null };
    }
    // MYK9-746: the show never completed a sync here. While this device holds
    // a write the server has not seen (a check-in, an edit, a queued delete),
    // a server list would show it undone, so wait for the sync instead of
    // merging. Re-read after the hydration attempt, which may have uploaded some.
    if (await unsavedWritesOrUnknown(showId)) {
      logger.warn(
        'Secretary entries not synced; unsaved local writes, waiting for sync',
        'database',
        {
          showId,
          operation: 'get_entries_for_show',
        }
      );
      return secretaryEntriesReadFailure(new Error('Show entries not synced'), startTime);
    }
  } catch (error) {
    const replicationError = error instanceof Error ? error : new Error(String(error));
    // MYK9-774: a failed device read lands here too. The server list must not
    // be served over a write this device has not uploaded, or the secretary
    // sees it undone; when that cannot be ruled out, wait for the sync.
    if (await unsavedWritesOrUnknown(showId)) {
      logger.warn(
        'Secretary entries replication read failed with unsaved local writes; waiting for sync',
        'database',
        { showId, operation: 'get_entries_for_show' },
        replicationError
      );
      return secretaryEntriesReadFailure(replicationError, startTime);
    }
    logger.warn(
      'Secretary entries replication read failed; falling back to PostGREST',
      'database',
      { showId, operation: 'get_entries_for_show' },
      replicationError
    );
  }

  try {
    const fallback = await postgrestGetSecretaryEntriesForShow(
      showId,
      startTime,
      'get_entries_for_show_fallback'
    );
    if (
      !fallback.error &&
      fallback.data?.length === 0 &&
      ((await unsavedWritesOrUnknown(showId)) || !(await verifySecretaryEmptyShow(showId)))
    ) {
      return secretaryEntriesReadFailure(
        new Error('Show entry count could not be verified'),
        startTime
      );
    }
    return fallback;
  } catch (error) {
    return secretaryEntriesReadFailure(error, startTime);
  }
};

/** An unreadable row state cannot prove the writes uploaded; treat it as unsaved. */
async function unsavedWritesOrUnknown(showId: string): Promise<boolean> {
  try {
    return await hasUnsavedLocalEntryWrites(showId);
  } catch {
    return true;
  }
}

/** The Entry Management retry state: no rows, plain-English retry copy. */
function secretaryEntriesReadFailure(error: unknown, startTime: number) {
  const dbError = createDatabaseError(error, 'entries', 'get_entries_for_show');
  logQuery('entries', 'get_entries_for_show', Date.now() - startTime, dbError.message);
  return { data: null, error: { ...dbError, message: SECRETARY_ENTRIES_READ_ERROR } };
}

function toEntryMutationResult(
  entryId: string,
  mutationId: string | null,
  entry: ReplicatedEntry | null
) {
  return {
    id: entryId,
    show_id: entry?.showId ?? null,
    class_id: entry?.classId ?? null,
    mutationId,
  };
}

export const updateEntryStatus = async (
  entryId: string,
  status: EntryStatus,
  withdrawalReason?: string,
  sourceEntry?: SecretaryStatusEntrySeed,
  /** MYK9-632: 'in_season' | 'judge_change' on a Withdraw, explicit null on a Pull. */
  withdrawalReasonCode?: string | null,
  checkInContext?: EntryStatusCheckInContext
) => {
  const startTime = Date.now();

  try {
    const mutationId = await replicatedEntriesTable.updateSecretaryLifecycleStatus(
      entryId,
      buildReplicatedEntryStatusUpdate(
        status,
        withdrawalReason,
        withdrawalReasonCode,
        checkInContext
      ),
      sourceEntry
    );
    const entry = await replicatedEntriesTable.getEntryById(entryId);

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_entry_status', duration);

    return { data: toEntryMutationResult(entryId, mutationId, entry), error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_entry_status');
    logQuery('entries', 'update_entry_status', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
