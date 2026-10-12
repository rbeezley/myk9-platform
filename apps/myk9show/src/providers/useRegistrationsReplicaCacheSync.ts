import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';

/** Prefix of every `queryKeys.registrationsByDog(dogId)` key. */
const REGISTRATIONS_BY_DOG_PREFIX = ['registrations', 'dog'] as const;

/**
 * Refetch every read built on the registrations replica: each dog's
 * registrations, the dog reads under `['dogs']` (their registrations come from
 * `loadDogRegistrations`), and every owner's dogs under `['users', id, 'dogs']`.
 */
export function refreshRegistrationReads(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: REGISTRATIONS_BY_DOG_PREFIX });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
  void queryClient.invalidateQueries({
    predicate: query => query.queryKey[0] === 'users' && query.queryKey[2] === 'dogs',
  });
}

/**
 * The one refresh rule for registrations (MYK9-1090, plan §2). Every change to
 * a registration reaches the device through the replica: a sync, a direct
 * write mirrored into it, upload, Take theirs, Keep mine, Discard. So one
 * subscription refreshes the screens, and no path patches a cache by hand.
 */
export function useRegistrationsReplicaCacheSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const unsubscribe = replicatedDogRegistrationsTable.subscribe(
      () => {
        refreshRegistrationReads(queryClient);
      },
      { emitCurrent: false }
    );
    return unsubscribe;
  }, [queryClient]);
}
