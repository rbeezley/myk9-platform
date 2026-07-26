// Compatibility layer between dogStore and React Query
// Phase 2.1: Dog Store Integration

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@/lib/notifications';
import type { Dog } from '@/types/dog-types';
import type { DogInput } from '@/store/dogStore';
import {
  useDogsQuery,
  useDogQuery,
  useDogsByOwnerQuery,
  useCreateDogMutation,
  useUpdateDogMutation,
  useDeleteDogMutation,
  useDogStatisticsQuery,
} from '@/hooks/queries/useDogsDatabase';
import {
  mapDogInputToInsert,
  mapDogInputToReplicated,
  mapDogInputToUpdate,
  mapDatabaseToDog,
  mapDatabaseDogsArray,
  mapReplicatedDogToDbRow,
  mapPartialDogInputToReplicated,
} from '@/services/mappers/dogMappers';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { logger } from '@/services/LoggingService';
import { queryKeys } from '@/lib/queryClient';
import { aggregateQueryErrors, aggregateLoadingStates } from '@/hooks/storeCompatUtils';
import { syncDogRegistrations } from '@/hooks/dogStoreCompatHelpers';
import { translateDogDbError } from '@/hooks/translateDogDbError';
import { supabase } from '@/lib/supabase';
import { selectOwnedDogs } from '@/utils/dogOwnership';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { loadDogRegistrations } from '@/services/database/dogs/reads';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';

/**
 * Map a replicated dog to a `Dog`, hydrating its registrations first.
 *
 * MYK9-90: breed is resolved from `dog_registrations`, so mapping a dog with no
 * registrations attached yields "Breed not set". `updateDog` fed the mapper a
 * bare row and handed the result straight to `DogDialogs`, which flipped a
 * registered dog's breed label to "Breed not set" until the next refetch.
 *
 * Reads through `loadDogRegistrations`, the MERGED server+replica path. Round 2
 * used `replicatedDogRegistrationsTable` alone, which was inert in production:
 * that table's `sync()` is a no-op and server reads are never written into it,
 * so it only ever holds registrations created locally. For the common dog —
 * whose registrations came from PostgREST — it returned nothing and the label
 * still flipped to "Breed not set". The merged read answers from the server when
 * online and from the replica when not.
 *
 * ONLY use this off the latency-critical path. `updateDog` is local-first and
 * must not await a network read — see `cachedRegistrationRowsForDog`.
 *
 * NOTE on the alternative: making the mapper treat "registrations key absent"
 * as "not loaded" and fall back to `dbDog.breed` was rejected. That fallback is
 * a read of `dogs.breed`, the exact column this change exists to stop reading,
 * and section 6 drops it — so the branch would silently become a blank anyway.
 * Hydrating at the caller keeps one meaning for an empty registration list:
 * the dog genuinely has none.
 */
async function mapReplicatedDogWithRegistrations(dog: ReplicatedDog): Promise<Dog> {
  const registrations = await loadDogRegistrations([dog.id])
    .then(result => result.byDog.get(dog.id) ?? [])
    .catch(() => [] as Record<string, unknown>[]);
  return mapDatabaseToDog(mapReplicatedDogToDbRow(dog, { registrations }));
}

/**
 * Registrations for a dog from data ALREADY in memory — no network, no await.
 *
 * `updateDog` is local-first: a call-name-only edit at a venue must not wait on
 * PostgREST to fail or time out before the UI updates. Round 3 solved the
 * "Breed not set" flash by awaiting the merged read here, which fixed
 * correctness by moving a request onto the latency-critical path. Both
 * constraints are real, so they are satisfied separately: this synchronous
 * lookup serves the immediate return, and the existing query invalidation
 * refreshes from the server asynchronously.
 *
 * `alreadyLoadedDogs` comes from the hook's own dogs query. BOTH of that query's
 * paths embed registrations — the replication path via `loadRegistrationsMap`,
 * the PostgREST fallback via `registrations:dog_registrations(*)` — so a dog
 * PRESENT in the list carries an authoritative registration array, including
 * when that array is empty.
 *
 * Presence is therefore the test, not length (MYK9-90 review round 5). Falling
 * through an authoritative empty list to `registrationsByDog` resurrected
 * deleted registrations: an invalidated-but-inactive query keeps serving its old
 * data, so after deleting a registration, editing an UNRELATED field brought the
 * old breed back until the next refetch.
 *
 * This is the same "absent vs. present-and-empty" distinction settled in round
 * 1, when hydrate-at-the-callers was chosen so an empty registration list would
 * have exactly one meaning: the dog genuinely has none. The cache fallback had
 * reintroduced the ambiguity one layer up.
 */
function cachedRegistrationRowsForDog(
  dogId: string,
  alreadyLoadedDogs: Dog[],
  queryClient: ReturnType<typeof useQueryClient>
): Record<string, unknown>[] {
  const loadedDog = alreadyLoadedDogs.find(d => d.id === dogId);
  if (loadedDog) {
    return (loadedDog.registrations ?? []) as unknown as Record<string, unknown>[];
  }

  // Only when the dog is not in the loaded list at all is the per-dog query
  // cache the best available answer.
  const cached = queryClient.getQueryData(queryKeys.registrationsByDog(dogId));
  return Array.isArray(cached) ? (cached as Record<string, unknown>[]) : [];
}

/**
 * Compatibility hook that provides dogStore-like API using React Query
 * This allows existing components to work unchanged while using the database
 */
export const useDogStoreCompat = () => {
  const queryClient = useQueryClient();
  const dogsQuery = useDogsQuery();
  const createMutation = useCreateDogMutation();
  const updateMutation = useUpdateDogMutation();
  const deleteMutation = useDeleteDogMutation();
  const statisticsQuery = useDogStatisticsQuery();

  // Convert database results to Dog format for backward compatibility
  const dogs = useMemo(() => {
    if (!dogsQuery.data) return [];
    return mapDatabaseDogsArray(dogsQuery.data);
  }, [dogsQuery.data]);

  // Aggregate loading and error states
  const isLoading = aggregateLoadingStates(
    dogsQuery.isLoading,
    createMutation.isPending,
    updateMutation.isPending,
    deleteMutation.isPending
  );

  const error = useMemo(
    () =>
      aggregateQueryErrors(
        dogsQuery.error,
        createMutation.error,
        updateMutation.error,
        deleteMutation.error
      ),
    [dogsQuery.error, createMutation.error, updateMutation.error, deleteMutation.error]
  );

  const runDogMutation = async <T>(op: () => Promise<T>): Promise<T> => {
    try {
      return await op();
    } catch (err) {
      throw translateDogDbError(err);
    }
  };

  // dogStore-compatible API.
  // Local-first create: write to IndexedDB before the network call so the next
  // dogsQuery refetch finds the new dog in the replication read path alongside
  // any pre-existing dogs. Roll back on failure so the list never shows a dog
  // that didn't reach Supabase.
  //
  // When registrations are provided the create_dog_with_registrations RPC is
  // used so both the dog row and its registrations land in a single PL/pgSQL
  // transaction — a partial failure (dog inserted, registrations failed) is
  // impossible. Without registrations the existing createMutation path handles
  // the write (it carries React Query optimistic-update machinery we don't
  // need to replicate for the simple case).
  const addDog = async (dogData: DogInput): Promise<Dog> => {
    const dogId = crypto.randomUUID();

    const replicatedDog = mapDogInputToReplicated(dogData, dogId);
    await replicatedDogsTable.set(dogId, replicatedDog, false);

    const dbData = { ...mapDogInputToInsert(dogData), id: dogId };

    try {
      if (dogData.registrations && dogData.registrations.length > 0) {
        const registrationsPayload = dogData.registrations
          .filter(r => r.registeredName)
          .map(r => ({
            organization: r.organization || 'AKC',
            registered_name: r.registeredName,
            registration_number: r.number || '',
            breed: r.type || null,
            status: r.status || 'pending',
          }));

        const { data: rpcDogId, error: rpcError } = await supabase.rpc(
          'create_dog_with_registrations',
          {
            p_dog: dbData,
            p_registrations: registrationsPayload,
          }
        );
        if (rpcError) throw translateDogDbError(rpcError);

        const savedDogId = typeof rpcDogId === 'string' ? rpcDogId : dogId;
        if (savedDogId !== dogId) {
          await replicatedDogsTable.delete(dogId);
          await queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
          if (dbData.owner_id) {
            queryClient.invalidateQueries({ queryKey: queryKeys.personDogs(dbData.owner_id) });
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.registrationsByDog(savedDogId) });

          const existingLocalDog = await replicatedDogsTable.getDogById(savedDogId);
          const existingLoadedDog = dogs.find(dog => dog.id === savedDogId);

          if (existingLocalDog) {
            return await mapReplicatedDogWithRegistrations(existingLocalDog);
          }

          if (existingLoadedDog) {
            return existingLoadedDog;
          }

          notifications.info('That registration is already on an existing dog.', {
            description: 'Using the existing dog record instead of creating a duplicate.',
          });

          return {
            ...(await mapReplicatedDogWithRegistrations(replicatedDog)),
            id: savedDogId,
          };
        }

        await queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
        if (dbData.owner_id) {
          queryClient.invalidateQueries({ queryKey: queryKeys.personDogs(dbData.owner_id) });
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.registrationsByDog(dogId) });
        return await mapReplicatedDogWithRegistrations(replicatedDog);
      }

      const result = await runDogMutation(() => createMutation.mutateAsync(dbData));
      return mapDatabaseToDog(result);
    } catch (err) {
      // Don't mask the original error with an IndexedDB cleanup failure.
      await replicatedDogsTable.delete(dogId).catch(cleanupErr => {
        logger.warn(
          'Failed to roll back IndexedDB after dog creation failure',
          'dogs',
          { dogId },
          cleanupErr as Error
        );
      });
      throw err;
    }
  };

  const addDogOfflineFirst = async (
    dogData: DogInput,
    options: { dependsOn?: string[] } = {}
  ): Promise<Dog> => {
    const dogId = crypto.randomUUID();
    const replicatedDog = mapDogInputToReplicated(dogData, dogId);

    let registrations: Record<string, unknown>[] = [];
    if (dogData.registrations && dogData.registrations.length > 0) {
      // Create the local mirror FIRST so the RPC payload can carry the same
      // ordered creation timestamps. Without them every registration in the
      // RPC's transaction gets an identical server `created_at` and the primary
      // is decided by a random UUID (MYK9-90 review round 4).
      const savedRegistrations =
        await replicatedDogRegistrationsTable.createLocalRegistrationsForDog(
          dogId,
          dogData.registrations
        );
      const registrationRows = dogData.registrations.map((registration, index) => ({
        organization: registration.organization || 'AKC',
        registered_name: registration.registeredName || null,
        registration_number: registration.number || '',
        breed: registration.type || null,
        status: registration.status || 'pending',
        created_at: savedRegistrations[index]?.createdAt ?? null,
      }));
      const savedDog = await replicatedDogsTable.createDogWithRegistrationsRpc(
        replicatedDog,
        registrationRows,
        options.dependsOn ? { dependsOn: options.dependsOn } : {}
      );
      registrations = savedRegistrations.map(registration =>
        replicatedDogRegistrationsTable.toSupabaseRow(registration)
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.registrationsByDog(savedDog.id) });

      await queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
      if (savedDog.ownerId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.personDogs(savedDog.ownerId) });
      }

      return mapDatabaseToDog(mapReplicatedDogToDbRow(savedDog, { registrations }));
    }

    const savedDog = await replicatedDogsTable.createDogWithId(
      replicatedDog,
      options.dependsOn ? { dependsOn: options.dependsOn } : {}
    );

    await queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
    if (savedDog.ownerId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.personDogs(savedDog.ownerId) });
    }

    return await mapReplicatedDogWithRegistrations(savedDog);
  };

  const updateDog = async (id: string, updates: Partial<DogInput>): Promise<Dog | null> => {
    logger.debug('updateDog called', 'dogs', {
      dogId: id,
      hasRegistrations: !!updates.registrations,
      registrationsCount: updates.registrations?.length || 0,
    });

    // Write to IndexedDB first so getAllDogs() reads fresh data on the next React Query refetch.
    const current = await replicatedDogsTable.getDogById(id);
    let localDog: Dog | null = null;
    if (current) {
      const updated = { ...current, ...mapPartialDogInputToReplicated(updates) };
      await replicatedDogsTable.set(id, updated, false);
      // Local-first: resolve the breed from data already in memory rather than
      // awaiting a PostgREST round-trip on the save path.
      localDog = mapDatabaseToDog(
        mapReplicatedDogToDbRow(updated, {
          registrations: cachedRegistrationRowsForDog(id, dogs, queryClient),
        })
      );
    }

    // Background Supabase sync — onSuccess invalidates the list query, which refetches from
    // the now-fresh IndexedDB instead of returning stale data.
    const dbUpdates = mapDogInputToUpdate(updates);
    runDogMutation(() => updateMutation.mutateAsync({ id, updates: dbUpdates })).catch(err => {
      logger.error(
        'Background Supabase sync failed for dog update',
        'dogs',
        { dogId: id },
        err as Error
      );
      notifications.warning(
        'Changes saved locally but could not sync. Please check your connection.'
      );
    });

    if (updates.registrations && updates.registrations.length > 0) {
      try {
        const changed = await syncDogRegistrations(id, updates.registrations);
        if (changed) {
          queryClient.invalidateQueries({ queryKey: queryKeys.registrationsByDog(id) });
        }
      } catch (err) {
        logger.error('Failed to update/create registrations', 'dogs', { dogId: id }, err as Error);
        notifications.warning(
          'Dog details saved, but registration changes could not be synced. Please try editing registrations again.'
        );
      }
    }

    return localDog;
  };

  const deleteDog = async (id: string, deletedBy?: string): Promise<void> => {
    await runDogMutation(() =>
      deleteMutation.mutateAsync({ id, ...(deletedBy !== undefined && { deletedBy }) })
    );
    // Soft-delete removes the row from RLS visibility, so replication polling never
    // sees the change. Remove locally so the dog doesn't reappear after reload.
    await replicatedDogsTable.delete(id).catch(err => {
      logger.warn(
        'Failed to remove soft-deleted dog from IndexedDB',
        'dogs',
        { dogId: id },
        err as Error
      );
    });
    // exhibitor-ux-remediation: the dogs list query (`getAllDogs`) falls back
    // to this same IndexedDB table (offline-first), so the mutation's own
    // onSuccess invalidate/refetch can race this cleanup — a refetch that
    // lands before the line above finishes re-reads the still-present local
    // row and resurrects the just-deleted dog in the list until a full reload.
    // A second invalidation, now that the local row is definitely gone,
    // closes that race regardless of how the first one landed.
    await queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
  };

  const getDogById = (id: string): Dog | null => {
    return dogs.find(dog => dog.id === id) || null;
  };

  const getDogsByOwner = (ownerId: string): Dog[] => {
    return selectOwnedDogs(dogs, ownerId);
  };

  const getSyncStatus = (): 'synced' | 'pending' | 'error' | 'conflict' => {
    if (isLoading) return 'pending';
    if (error) return 'error';
    return 'synced';
  };

  const refetch = () => {
    dogsQuery.refetch();
  };

  return {
    // Data
    dogs,
    isLoading,
    error,

    // Operations (compatible with dogStore API)
    addDog,
    addDogOfflineFirst,
    updateDog,
    deleteDog,
    getDogById,
    getDogsByOwner,
    getSyncStatus,

    // Additional React Query benefits
    refetch,
    isStale: dogsQuery.isStale,
    isFetching: dogsQuery.isFetching,

    // Statistics
    statistics: statisticsQuery.data,
    isLoadingStatistics: statisticsQuery.isLoading,

    // Individual mutation states for fine-grained control
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Legacy compatibility flags
    _usingDatabase: true,
    _reactQueryIntegrated: true,
  };
};

/**
 * Hook for getting a single dog with React Query benefits
 */
export const useDogWithQuery = (id: string, enabled = true) => {
  const dogQuery = useDogQuery(id, enabled);

  const dog = useMemo(() => {
    if (!dogQuery.data) return null;
    return mapDatabaseToDog(dogQuery.data);
  }, [dogQuery.data]);

  return {
    dog,
    isLoading: dogQuery.isLoading,
    error: dogQuery.error?.message || null,
    refetch: dogQuery.refetch,
    isStale: dogQuery.isStale,
  };
};

/**
 * Hook for getting dogs by owner with React Query benefits
 */
export const useOwnerDogsWithQuery = (ownerId: string, enabled = true) => {
  const ownerDogsQuery = useDogsByOwnerQuery(ownerId, enabled);

  const dogs = useMemo(() => {
    if (!ownerDogsQuery.data) return [];
    return mapDatabaseDogsArray(ownerDogsQuery.data);
  }, [ownerDogsQuery.data]);

  return {
    dogs,
    isLoading: ownerDogsQuery.isLoading,
    error: ownerDogsQuery.error?.message || null,
    refetch: ownerDogsQuery.refetch,
    isStale: ownerDogsQuery.isStale,
  };
};
