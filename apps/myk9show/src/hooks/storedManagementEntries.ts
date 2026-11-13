import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/entriesRefresh';
import type { SecretaryEntry } from '@/services/database/entries';
import { readStoredSecretaryRows } from '@/services/database/entries/secretaryStoredRows';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { mapSecretaryEntryToEntryManagementEntry } from './useEntryManagementData';

/**
 * Entry Management's entries with the write columns of each stored row taken. The stored row is
 * mapped by the page's own mapper (`mapSecretaryEntryToEntryManagementEntry`), so every status
 * rule is the read's, not the desk's; only the entry's own status and its class's status and
 * check-in come across.
 */
export function mergeStoredManagementEntries(
  current: readonly EntryManagementEntry[],
  stored: readonly SecretaryEntry[]
): EntryManagementEntry[] {
  const byId = new Map(
    stored.map(row => [row.id, mapSecretaryEntryToEntryManagementEntry(row)] as const)
  );
  return current.map(entry => {
    const mapped = byId.get(entry.id);
    if (!mapped) return entry;
    const storedClass = mapped.classes[0];
    return {
      ...entry,
      entryStatus: mapped.entryStatus,
      rawEntryStatus: mapped.rawEntryStatus ?? null,
      ...(mapped.pullReason !== undefined && { pullReason: mapped.pullReason }),
      lastUpdated: mapped.lastUpdated,
      classes: storedClass
        ? entry.classes.map(cls => ({
            ...cls,
            status: storedClass.status,
            ...(storedClass.checkInStatus !== undefined && {
              checkInStatus: storedClass.checkInStatus,
            }),
            checkInPulledBy: storedClass.checkInPulledBy ?? null,
          }))
        : entry.classes,
    };
  });
}

/**
 * Entry Management's side of a desk write: the page's entries take the stored rows (read back from
 * the replica by id), then `load` re-reads. A row the replica cannot give back changes nothing.
 */
export function useManagementRefreshAfterWrite(
  setEntries: Dispatch<SetStateAction<EntryManagementEntry[]>>,
  load: () => Promise<void>
): EntriesRefresh {
  return useCallback(
    async storedIds => {
      if (storedIds && storedIds.length > 0) {
        try {
          const stored = await readStoredSecretaryRows(storedIds);
          if (stored.length > 0) {
            setEntries(current => mergeStoredManagementEntries(current, stored));
          }
        } catch {
          // The re-read below decides.
        }
      }
      await load();
    },
    [load, setEntries]
  );
}
