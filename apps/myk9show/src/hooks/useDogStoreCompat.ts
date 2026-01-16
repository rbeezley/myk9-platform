// Compatibility layer between dogStore and React Query
// Phase 2.1: Dog Store Integration

import { useMemo } from 'react';
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
  mapDogInputToUpdate,
  mapDatabaseToDog,
  mapDatabaseDogsArray,
} from '@/services/mappers/dogMappers';

/**
 * Compatibility hook that provides dogStore-like API using React Query
 * This allows existing components to work unchanged while using the database
 */
export const useDogStoreCompat = () => {
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

  // Aggregate loading states
  const isLoading = dogsQuery.isLoading || 
    createMutation.isPending || 
    updateMutation.isPending || 
    deleteMutation.isPending;

  // Aggregate error states (prioritize by recency)
  const error = useMemo(() => {
    const errors = [
      dogsQuery.error,
      createMutation.error,
      updateMutation.error,
      deleteMutation.error,
    ].filter(Boolean);
    
    if (errors.length === 0) return null;
    return errors[0]?.message || 'An error occurred';
  }, [dogsQuery.error, createMutation.error, updateMutation.error, deleteMutation.error]);

  // dogStore-compatible API
  const addDog = async (dogData: DogInput): Promise<Dog> => {
    const dbData = mapDogInputToInsert(dogData);
    const result = await createMutation.mutateAsync(dbData);
    return mapDatabaseToDog(result);
  };

  const updateDog = async (id: string, updates: Partial<DogInput>): Promise<Dog | null> => {
    const dbUpdates = mapDogInputToUpdate(updates);
    const result = await updateMutation.mutateAsync({ id, updates: dbUpdates });
    return result ? mapDatabaseToDog(result) : null;
  };

  const deleteDog = async (id: string, deletedBy?: string): Promise<void> => {
    await deleteMutation.mutateAsync({ id, deletedBy });
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