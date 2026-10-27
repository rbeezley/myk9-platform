import { logger } from '@/services/LoggingService';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryStatus as CanonicalEntryStatus } from '@/types/entry-lifecycle';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type {
  ChangeSecretaryEntryStatusParams,
  ChangeSecretaryEntryStatusResult,
} from '@/services/secretary/entry-workflow';
import { mapStatusToDb } from '@/utils/entryManagementUtils';
import type { CheckInStatus } from '@myk9/core';
import { resolveCheckInStatusForTransition } from './statusCheckIn';

// ─── Adapter interfaces ────────────────────────────────────────────────────

export interface StatusChangeAdapters {
  changeSecretaryStatus: (
    params: ChangeSecretaryEntryStatusParams
  ) => Promise<ChangeSecretaryEntryStatusResult>;
  patchEntries: (updater: (prev: EntryManagementEntry[]) => EntryManagementEntry[]) => void;
}

export interface BulkStatusChangeAdapters {
  bulkUpdateStatus: (ids: string[], status: CanonicalEntryStatus) => Promise<{ error: unknown }>;
  reloadEntries: (showId: string) => Promise<void>;
  patchEntries: (updater: (prev: EntryManagementEntry[]) => EntryManagementEntry[]) => void;
  setError: (err: string | null) => void;
}

type EntryClass = EntryManagementEntry['classes'][number];

/**
 * The class with its check-in set, or with the key removed when it had none.
 * MYK9-1396: also mirrors the server trigger's stamp into `checkInStatusBeforePull`
 * (Pull remembers the old check-in, leaving `pulled` forgets it), so a quick
 * Pull then Accept from this same loaded state restores the right value.
 */
function withCheckIn(c: EntryClass, checkInStatus: EntryClass['checkInStatus']): EntryClass {
  const next = { ...c };
  if (checkInStatus === undefined) delete next.checkInStatus;
  else next.checkInStatus = checkInStatus;
  if (checkInStatus === 'pulled' && c.checkInStatus !== 'pulled') {
    next.checkInStatusBeforePull = c.checkInStatus ?? null;
  } else if (c.checkInStatus === 'pulled' && checkInStatus !== 'pulled') {
    next.checkInStatusBeforePull = null;
  }
  return next;
}

// ─── executeStatusChange ──────────────────────────────────────────────────

export interface StatusChangeParams {
  entryId: string;
  newStatus: EntryStatus;
  withdrawalReason?: string | undefined;
  entry: EntryManagementEntry;
  userId?: string | undefined;
  /** MYK9-1384: check-in value to restore when this change un-pulls the entry (Undo of a Pull). */
  priorCheckInStatus?: CheckInStatus | undefined;
}

/**
 * Orchestrates a secretary entry-status change:
 *   1. Optimistic update in local state
 *   2. Persist via changeSecretaryStatus
 *   3a. On success — apply any armbandPatch to all entries for that dog/show
 *   3b. On failure — roll back to the prior status
 */
export async function executeStatusChange(
  params: StatusChangeParams,
  adapters: StatusChangeAdapters
): Promise<boolean> {
  const { entryId, newStatus, withdrawalReason, entry, userId, priorCheckInStatus } = params;
  const { changeSecretaryStatus, patchEntries } = adapters;
  const oldStatus = entry.entryStatus;
  const oldWithdrawalReason = entry.withdrawalReason;
  const oldCheckInByClassId = new Map(entry.classes.map(c => [c.id, c.checkInStatus]));
  // MYK9-1384: keep the optimistic row in step with what the write will store.
  const nextCheckInStatus = resolveCheckInStatusForTransition(mapStatusToDb(newStatus), {
    previousEntryStatus: mapStatusToDb(oldStatus),
    priorCheckInStatus,
    storedCheckInStatusBeforePull: entry.classes[0]?.checkInStatusBeforePull,
  });

  // Optimistic update
  patchEntries(prev =>
    prev.map(e =>
      e.id === entryId
        ? {
            ...e,
            entryStatus: newStatus,
            ...(nextCheckInStatus !== undefined
              ? { classes: e.classes.map(c => withCheckIn(c, nextCheckInStatus)) }
              : {}),
            lastUpdated: new Date(),
            ...(withdrawalReason !== undefined ? { withdrawalReason } : {}),
          }
        : e
    )
  );

  try {
    const result = await changeSecretaryStatus({
      entry,
      newStatus,
      ...(userId ? { secretaryId: userId } : {}),
      ...(withdrawalReason !== undefined ? { withdrawalReason } : {}),
      ...(priorCheckInStatus !== undefined ? { priorCheckInStatus } : {}),
    });

    if (result.armbandPatch) {
      const { armband, dogId, showId } = result.armbandPatch;
      patchEntries(prev =>
        prev.map(e =>
          e.dogId === dogId && e.showId === showId
            ? { ...e, armbandNumber: armband, entryNumber: armband }
            : e
        )
      );
    }
    return true;
  } catch (error) {
    logger.error('Failed to update entry status:', 'pages', {}, error as Error);
    patchEntries(prev =>
      prev.map(e =>
        e.id === entryId
          ? {
              ...e,
              entryStatus: oldStatus,
              // Put back only the check-in we changed, by class id, so a concurrent
              // change to any other class field is not clobbered.
              ...(nextCheckInStatus !== undefined
                ? {
                    classes: e.classes.map(c =>
                      oldCheckInByClassId.has(c.id)
                        ? withCheckIn(c, oldCheckInByClassId.get(c.id))
                        : c
                    ),
                  }
                : {}),
              ...(oldWithdrawalReason !== undefined
                ? { withdrawalReason: oldWithdrawalReason }
                : {}),
            }
          : e
      )
    );
    return false;
  }
}

// ─── executeBulkStatusChange ──────────────────────────────────────────────

export interface BulkStatusChangeParams {
  entryIds: string[];
  status: EntryStatus;
  selectedShowId?: string;
}

export interface BulkStatusChangeResult {
  updated: boolean;
}

/**
 * Orchestrates a bulk entry-status change:
 *   1. Persist via bulkUpdateStatus
 *   2. On success — optimistic update in local state
 *   On DB error — set error message; do not touch local state.
 */
export async function executeBulkStatusChange(
  params: BulkStatusChangeParams,
  adapters: BulkStatusChangeAdapters
): Promise<BulkStatusChangeResult> {
  const { entryIds, status } = params;
  const { bulkUpdateStatus, patchEntries, setError } = adapters;
  if (entryIds.length === 0) return { updated: false };

  const { error: dbError } = await bulkUpdateStatus(entryIds, mapStatusToDb(status));
  if (dbError) {
    setError('Failed to update entry statuses');
    return { updated: false };
  }

  patchEntries(prev =>
    prev.map(e =>
      entryIds.includes(e.id) ? { ...e, entryStatus: status, lastUpdated: new Date() } : e
    )
  );

  return { updated: true };
}
