/**
 * The rail's cached "does this person have entries" server answer.
 *
 * Checkout success knows the paid entry exists before this device has replicated it, so it writes
 * the answer straight into the query the rail reads. React Query notifies the rail at once, and the
 * entry is marked stale so the next server read confirms it.
 */

import type { QueryClient } from '@tanstack/react-query';

export const ownEntriesServerKey = (personId: string | null) =>
  ['own-entries', 'server-has-any', personId] as const;

export function markOwnEntriesKnownYes(queryClient: QueryClient, personId: string): void {
  const queryKey = ownEntriesServerKey(personId);
  queryClient.setQueryData(queryKey, true);
  void queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
}
