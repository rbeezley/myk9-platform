import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { EntriesRefresh } from '@/components/entries/management/checkInDesk/entriesRefresh';
import { queryKeys } from '@/lib/queryClient';
import type { SecretaryEntry } from '@/services/database/entries';
import {
  mergeStoredSecretaryEntries,
  readStoredSecretaryRows,
} from '@/services/database/entries/secretaryStoredRows';

/**
 * The Show Desk's side of a desk write: the secretary show entries query cache takes the stored
 * rows (read back from the replica by id), then the query is re-read. A re-read that fails (a cold
 * replica) or pauses offline leaves the stored status on screen. A row the replica cannot give
 * back changes nothing, so the re-read alone decides.
 */
export function useShowEntriesRefreshAfterWrite(
  showId: string,
  refetch: (options: { throwOnError: true }) => Promise<unknown>
): EntriesRefresh {
  const queryClient = useQueryClient();
  return useCallback(
    async storedIds => {
      if (storedIds && storedIds.length > 0) {
        try {
          const stored = await readStoredSecretaryRows(storedIds);
          if (stored.length > 0) {
            queryClient.setQueryData<SecretaryEntry[]>(queryKeys.showEntries(showId), old =>
              old ? mergeStoredSecretaryEntries(old, stored) : old
            );
          }
        } catch {
          // The re-read below decides.
        }
      }
      await refetch({ throwOnError: true });
    },
    [queryClient, refetch, showId]
  );
}
