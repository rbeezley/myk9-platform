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
  // Local-first create: write to IndexedDB before PostgREST so the next
  // dogsQuery refetch (triggered by createMutation.onSuccess) finds the new
  // dog in the replication read path alongside any pre-existing dogs.
  // Rollback on PostgREST failure so the list doesn't show a dog that never
  // reached Supabase.
  const addDog = async (dogData: DogInput): Promise<Dog> => {
    const dogId = crypto.randomUUID();

    const replicatedDog = mapDogInputToReplicated(dogData, dogId);
    await replicatedDogsTable.set(dogId, replicatedDog, false);

    const dbData = { ...mapDogInputToInsert(dogData), id: dogId };

    try {
      const result = await runDogMutation(() => createMutation.mutateAsync(dbData));
      const newDog = mapDatabaseToDog(result);

      // Registrations live in a separate table, written in a second call.
      // TODO: replace with a single create_dog_with_children RPC for atomicity
      // (see migration 145's create_show_with_children pattern).
      if (dogData.registrations && dogData.registrations.length > 0) {
        try {
          const changed = await syncDogRegistrations(newDog.id, dogData.registrations);
          if (changed) {
            queryClient.invalidateQueries({ queryKey: queryKeys.registrationsByDog(newDog.id) });
          }
        } catch (err) {
          logger.error(
            'Failed to create registrations for new dog',
            'dogs',
            { dogId: newDog.id },
            err as Error
          );
          throw err instanceof Error
            ? err
            : new Error('Failed to save dog registrations. Please try again.');
        }
      }

      return newDog;
    } catch (err) {
      // Don't mask the original PostgREST error with an IndexedDB cleanup failure.
      await replicatedDogsTable.delete(dogId).catch(cleanupErr => {
        logger.warn(
          'Failed to roll back IndexedDB after PostgREST insert failure',
          'dogs',
          { dogId },
          cleanupErr as Error
        );
      });
      throw err;
    }
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
      localDog = mapDatabaseToDog(mapReplicatedDogToDbRow(updated));
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
  };

  const getDogById = (id: string): Dog | null => {
    return dogs.find(dog => dog.id === id) || null;
  };

  const getDogsByOwner = (ownerId: string): Dog[] => {
    return dogs.filter(dog => dog.ownerId === ownerId);
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
