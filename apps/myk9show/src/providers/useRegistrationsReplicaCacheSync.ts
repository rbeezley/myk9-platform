import { useEffect } from 'react';
import {
  useQueryClient,
  type Query,
  type QueryClient,
  type QueryFilters,
} from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';

/**
 * Refetch every read built on the registrations replica: each dog's
 * registrations, the dog reads under `['dogs']` (their registrations come from
 * `loadDogRegistrations`), and every owner's dogs under `['users', id, 'dogs']`.
 */
export function refreshRegistrationReads(queryClient: QueryClient): void {
  const filters: QueryFilters[] = [
    { queryKey: queryKeys.registrationsByDogAll },
    { queryKey: queryKeys.dogs },
    { predicate: (query: Query) => query.queryKey[0] === 'users' && query.queryKey[2] === 'dogs' },
  ];
  // Cancel first: invalidating dedupes onto a read already in flight, and a
  // cold PostgREST read that started before this change can land after it
  // and put the older answer back (refetchShowEntriesAfterScopedSync).
  for (const filter of filters) {
    void queryClient
      .cancelQueries(filter)
      .then(() => queryClient.invalidateQueries(filter))
      .catch(() => undefined);
  }
}

/**
 * The one refresh rule for registrations (MYK9-1090, plan §2). Every change to
 * a registration reaches the device through the replica: a sync, a direct
 * write mirrored into it, upload, Take theirs, Keep mine, Discard. So one
 * subscription refreshes the screens, and no path patches a cache by hand,
 * with one owner-approved exception: a delete hides its row optimistically
 * (useDeleteRegistrationMutation, MYK9-1143), and this listener's refetch then
 * reconciles it, so a discarded refusal brings the row back.
 */
export function useRegistrationsReplicaCacheSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unsubscribe = replicatedDogRegistrationsTable.subscribe(
      () => {
        refreshRegistrationReads(queryClient);
      },
      {
        emitCurrent: false,
        // A change the device then cannot read back (IndexedDB gone after a
        // failed mirror) still means the reads are stale: refetch them, and
        // the readers fall back to the server.
        onError: () => {
          refreshRegistrationReads(queryClient);
        },
      }
    );
    return unsubscribe;
  }, [queryClient]);
}
