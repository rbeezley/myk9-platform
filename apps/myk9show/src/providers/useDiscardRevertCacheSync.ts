import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { patchCachedDogRows } from '@/hooks/patchCachedDogRows';
import { queryKeys } from '@/lib/queryClient';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';

/**
 * After a Discard puts a dog's row back to the server's state (MYK9-1076), show
 * that in the cached dog reads.
 *
 * The dog queries are `networkMode: 'online'`, so an invalidation alone pauses
 * offline and the screens keep the refused value; patch them from the replica
 * first (the same patch a local save uses), then invalidate for the online
 * refetch. The owner's dogs live under `['users', ownerId, 'dogs']`, outside
 * `['dogs']`, so they are patched and invalidated by name.
 */
export async function refreshDogCachesFromReplica(
  queryClient: QueryClient,
  dogId: string
): Promise<void> {
  const dog = await replicatedDogsTable.getDogById(dogId);
  if (dog) {
    patchCachedDogRows(queryClient, dogId, dog.ownerId, replicatedDogsTable.cachedRowFields(dog));
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
  if (dog?.ownerId) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.personDogs(dog.ownerId) });
  }
}

/** Listens for `replication:discard-row-replaced` from `@myk9/replication`. */
export function useDiscardRevertCacheSync(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const handle = (event: Event) => {
      const { tableName, rowId } = (event as CustomEvent<{ tableName: string; rowId: string }>)
        .detail;
      if (tableName === 'dogs') void refreshDogCachesFromReplica(queryClient, rowId);
    };
    window.addEventListener('replication:discard-row-replaced', handle);
    return () => window.removeEventListener('replication:discard-row-replaced', handle);
  }, [queryClient]);
}
