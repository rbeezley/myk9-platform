import type { SecretaryEntry } from '@/services/database/entries';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { mapClassEntryStatus, mapEntryStatus } from '@/utils/entryManagementUtils';

/**
 * What a desk write just stored for one entry, so the page that owns the entries can take it at
 * once. The write is in the replica; a re-read of the page's entries can fail (a cold replica) or
 * pause offline, and the row must not keep showing the old value meanwhile.
 */
export interface StoredEntryPatch {
  entryId: string;
  /** The check-in status now stored. */
  checkInStatus?: string;
  /** The raw entry status now stored ('scratched' after a Pull). */
  entryStatus?: string;
}

/** The desk's re-read of the page's entries; it is handed what the write stored, when it knows. */
export type EntriesRefresh = (stored?: readonly StoredEntryPatch[]) => void | Promise<void>;

/** The secretary show entries (React Query cache rows) with one stored write taken. */
export function patchSecretaryEntries(
  entries: readonly SecretaryEntry[],
  patches: readonly StoredEntryPatch[]
): SecretaryEntry[] {
  return entries.map(entry => {
    const stored = patches.filter(patch => patch.entryId === entry.id).at(-1);
    return !stored
      ? entry
      : {
          ...entry,
          ...(stored.checkInStatus !== undefined && {
            check_in_status: stored.checkInStatus,
            check_in_pulled_by: null,
          }),
          ...(stored.entryStatus !== undefined && { entry_status: stored.entryStatus }),
        };
  });
}

/** Entry Management's entries with one stored write taken. */
export function patchManagementEntries(
  entries: readonly EntryManagementEntry[],
  patches: readonly StoredEntryPatch[]
): EntryManagementEntry[] {
  return entries.map(entry => {
    const stored = patches.filter(patch => patch.entryId === entry.id).at(-1);
    if (!stored) return entry;
    const { checkInStatus, entryStatus } = stored;
    return {
      ...entry,
      ...(entryStatus !== undefined && {
        entryStatus: mapEntryStatus(entryStatus),
        rawEntryStatus: entryStatus,
      }),
      classes: entry.classes.map(cls => ({
        ...cls,
        ...(entryStatus !== undefined && { status: mapClassEntryStatus(entryStatus) }),
        ...(checkInStatus !== undefined && {
          checkInStatus: checkInStatus as NonNullable<typeof cls.checkInStatus>,
          checkInPulledBy: null,
          ...(checkInStatus === 'checked-in' && { checkInTime: new Date() }),
        }),
      })),
    };
  });
}
