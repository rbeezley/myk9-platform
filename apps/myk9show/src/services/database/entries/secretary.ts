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
import type { CheckInStatus } from '@myk9/core';
import type { TablesUpdate } from '@/types/supabase';
import type { PendingEntry, SecretaryStatusEntrySeed } from './secretaryTypes';
import { postgrestGetSecretaryEntriesForShow } from './secretaryPostgrest';
import { logger } from '@/services/LoggingService';
import { AUTHENTICATED_ENTRY_READ_COLUMNS } from './entrySelects';
import { isRawEntryInEntryManagementPendingBucket } from '@/utils/entryCountSelectors';
import { SECRETARY_ENTRIES_READ_ERROR } from './secretaryReadErrors';
import { hydrateSecretaryEntriesForShow } from './secretaryReadHydration';
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
    .or('entry_status.is.null,entry_status.not.in.(confirmed,waitlisted,withdrawn)');

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
    if (!result.isColdStore) {
      logQuery('entries', 'get_entries_for_show', Date.now() - startTime);
      return { data: result.data, error: null };
    }
    // Hydrate directly; the app-wide sync provider has no show scope.
    logger.warn('Secretary entries replication cold; hydrating scoped replica', 'database', {
      showId,
      operation: 'get_entries_for_show',
    });
    const hydratedData = await hydrateSecretaryEntriesForShow(showId, startTime);
    if (hydratedData) return { data: hydratedData, error: null };
  } catch (error) {
    const replicationError = error instanceof Error ? error : new Error(String(error));
    logger.warn(
      'Secretary entries replication read failed; falling back to PostGREST',
      'database',
      { showId, operation: 'get_entries_for_show' },
      replicationError
    );
  }

  try {
    return await postgrestGetSecretaryEntriesForShow(
      showId,
      startTime,
      'get_entries_for_show_fallback'
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_entries_for_show');
    logQuery('entries', 'get_entries_for_show', duration, dbError.message);
    return { data: null, error: { ...dbError, message: SECRETARY_ENTRIES_READ_ERROR } };
  }
};

/**
 * Get entry counts by status for a show
 */
export const getEntryCountsByStatus = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get all entries for the show
    const { data: entries, error } = await supabase
      .from('entries')
      .select('entry_status, payment_status')
      .eq('show_id', showId)
      .is('deleted_at', null);

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_entry_counts', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_entry_counts');
    }

    const counts = {
      total: entries?.length || 0,
      submitted: entries?.filter(e => e.entry_status === 'submitted').length || 0,
      confirmed: entries?.filter(e => e.entry_status === 'confirmed').length || 0,
      pendingPayment: entries?.filter(e => e.entry_status === 'pending-payment').length || 0,
      paymentDue: entries?.filter(e => e.payment_status === 'pending').length || 0,
    };

    return { data: counts, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_entry_counts');
    logQuery('entries', 'get_entry_counts', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Update entry status (accept, reject, waitlist, withdraw, scratch)
 */
function buildReplicatedEntryStatusUpdate(
  status: EntryStatus,
  withdrawalReason?: string
): Partial<ReplicatedEntry> {
  const updateData: Partial<ReplicatedEntry> = {
    entryStatus: status,
    entry_status: status,
    status,
  };

  if (status === 'scratched') {
    updateData.checkInStatus = 'pulled';
    updateData.check_in_status = 'pulled';
  }

  if (withdrawalReason !== undefined) {
    updateData.withdrawalReason = withdrawalReason;
    updateData.withdrawal_reason = withdrawalReason;
  }

  return updateData;
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
  sourceEntry?: SecretaryStatusEntrySeed
) => {
  const startTime = Date.now();

  try {
    const mutationId = await replicatedEntriesTable.updateSecretaryLifecycleStatus(
      entryId,
      buildReplicatedEntryStatusUpdate(status, withdrawalReason),
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

/**
 * Bulk update entry status
 */
export const bulkUpdateEntryStatus = async (entryIds: string[], status: EntryStatus) => {
  const startTime = Date.now();

  try {
    const updateData = buildReplicatedEntryStatusUpdate(status);
    const data = await Promise.all(
      entryIds.map(async entryId => {
        const mutationId = await replicatedEntriesTable.updateSecretaryLifecycleStatus(
          entryId,
          updateData
        );
        const entry = await replicatedEntriesTable.getEntryById(entryId);
        return toEntryMutationResult(entryId, mutationId, entry);
      })
    );

    const duration = Date.now() - startTime;
    logQuery('entries', 'bulk_update_status', duration);

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'bulk_update_status');
    logQuery('entries', 'bulk_update_status', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Update entry check-in status (mark as in ring)
 */
export const updateCheckInStatus = async (
  entryId: string,
  status: CheckInStatus,
  notes?: string
) => {
  const startTime = Date.now();

  try {
    const isInRing = status === 'checked-in' || status === 'at-gate';
    const updateData: TablesUpdate<'entries'> = {
      check_in_status: status,
      is_in_ring: isInRing,
      updated_at: new Date().toISOString(),
    };

    if (isInRing) {
      updateData.ring_entry_time = new Date().toISOString();
    }

    if (notes !== undefined) {
      updateData.judge_notes = notes;
    }

    const { data, error } = await supabase
      .from('entries')
      .update(updateData)
      .eq('id', entryId)
      .select(AUTHENTICATED_ENTRY_READ_COLUMNS)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_check_in', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update_check_in');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_check_in');
    logQuery('entries', 'update_check_in', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Bulk check-in entries
 */
export const bulkCheckIn = async (entryIds: string[]) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        is_in_ring: true,
        ring_entry_time: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', entryIds)
      .select(AUTHENTICATED_ENTRY_READ_COLUMNS);

    const duration = Date.now() - startTime;
    logQuery('entries', 'bulk_check_in', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'bulk_check_in');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'bulk_check_in');
    logQuery('entries', 'bulk_check_in', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Check for armband conflicts in a show
 */
export const checkArmbandConflicts = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { data: entries, error } = await supabase
      .from('entries')
      .select('id, armband, dog:dog_id(name, call_name)')
      .eq('show_id', showId)
      .is('deleted_at', null)
      .not('armband', 'is', null);

    const duration = Date.now() - startTime;
    logQuery('entries', 'check_armband_conflicts', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'check_armband_conflicts');
    }

    // Find duplicates
    const armbandMap = new Map<string, Array<{ id: string; dogName: string }>>();
    for (const entry of entries || []) {
      const armband = entry.armband;
      if (armband) {
        const existing = armbandMap.get(armband) || [];
        existing.push({
          id: entry.id,
          dogName:
            (entry.dog as { name: string | null; call_name: string | null } | null)?.call_name ||
            (entry.dog as { name: string | null } | null)?.name ||
            'Unknown',
        });
        armbandMap.set(armband, existing);
      }
    }

    const conflicts: Array<{
      armband: string;
      entries: Array<{ id: string; dogName: string }>;
    }> = [];

    armbandMap.forEach((entryList, armband) => {
      if (entryList.length > 1) {
        conflicts.push({ armband, entries: entryList });
      }
    });

    return { data: { conflicts, hasConflicts: conflicts.length > 0 }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'check_armband_conflicts');
    logQuery('entries', 'check_armband_conflicts', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Update run order for entries in a class
 */
export const updateRunOrder = async (entryId: string, runOrder: number) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        run_order: runOrder,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select(AUTHENTICATED_ENTRY_READ_COLUMNS)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_run_order', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update_run_order');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_run_order');
    logQuery('entries', 'update_run_order', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
