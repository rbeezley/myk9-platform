import { logger } from '@/services/LoggingService';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryStatus as CanonicalEntryStatus } from '@/types/entry-lifecycle';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import type {
  ChangeSecretaryEntryStatusParams,
  ChangeSecretaryEntryStatusResult,
} from '@/services/secretary/entry-workflow';
import { mapStatusToDb } from '@/utils/entryManagementUtils';

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

export interface RemoveEntryAdapters {
  deleteEntry: (entryId: string, userId?: string) => Promise<{ error: unknown }>;
  patchEntries: (
    updaterOrSnapshot:
      | ((prev: EntryManagementEntry[]) => EntryManagementEntry[])
      | EntryManagementEntry[]
  ) => void;
  setError: (err: string | null) => void;
}

// ─── executeStatusChange ──────────────────────────────────────────────────

export interface StatusChangeParams {
  entryId: string;
  newStatus: EntryStatus;
  withdrawalReason?: string | undefined;
  entry: EntryManagementEntry;
  userId?: string | undefined;
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
): Promise<void> {
  const { entryId, newStatus, withdrawalReason, entry, userId } = params;
  const { changeSecretaryStatus, patchEntries } = adapters;
  const oldStatus = entry.entryStatus;
  const oldWithdrawalReason = entry.withdrawalReason;

  // Optimistic update
  patchEntries(prev =>
    prev.map(e =>
      e.id === entryId
        ? {
            ...e,
            entryStatus: newStatus,
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
  } catch (error) {
    logger.error('Failed to update entry status:', 'pages', {}, error as Error);
    patchEntries(prev =>
      prev.map(e =>
        e.id === entryId
          ? {
              ...e,
              entryStatus: oldStatus,
              ...(oldWithdrawalReason !== undefined
                ? { withdrawalReason: oldWithdrawalReason }
                : {}),
            }
          : e
      )
    );
  }
}

// ─── executeBulkStatusChange ──────────────────────────────────────────────

export interface BulkStatusChangeParams {
  entryIds: string[];
  status: EntryStatus;
  selectedShowId?: string;
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
): Promise<void> {
  const { entryIds, status } = params;
  const { bulkUpdateStatus, patchEntries, setError } = adapters;
  if (entryIds.length === 0) return;

  const { error: dbError } = await bulkUpdateStatus(entryIds, mapStatusToDb(status));
  if (dbError) {
    setError('Failed to update entry statuses');
    return;
  }

  patchEntries(prev =>
    prev.map(e =>
      entryIds.includes(e.id) ? { ...e, entryStatus: status, lastUpdated: new Date() } : e
    )
  );
}

// ─── executeRemoveEntry ───────────────────────────────────────────────────

export interface RemoveEntryParams {
  entryId: string;
  userId?: string | undefined;
  currentEntries: EntryManagementEntry[];
}

/**
 * Orchestrates an entry soft-delete:
 *   1. Snapshot current entries
 *   2. Optimistic remove from local state
 *   3. Persist via deleteEntry
 *   4a. On success — clear error, return { removed: true }
 *   4b. On failure — restore snapshot, return { removed: false }
 */
export async function executeRemoveEntry(
  params: RemoveEntryParams,
  adapters: RemoveEntryAdapters
): Promise<{ removed: boolean }> {
  const { entryId, userId, currentEntries } = params;
  const { deleteEntry, patchEntries, setError } = adapters;

  const entry = currentEntries.find(e => e.id === entryId);
  if (!entry) return { removed: false };

  const snapshot = currentEntries;
  patchEntries(prev => prev.filter(e => e.id !== entryId));

  try {
    const { error: dbError } = await deleteEntry(entryId, userId);
    if (dbError) {
      patchEntries(snapshot);
      setError((dbError as { message?: string } | null)?.message ?? 'Failed to remove entry');
      return { removed: false };
    }
    setError(null);
    return { removed: true };
  } catch (err) {
    patchEntries(snapshot);
    setError('Failed to remove entry');
    logger.error('Error removing entry:', 'secretary', {}, err as Error);
    return { removed: false };
  }
}
