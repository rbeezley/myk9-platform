// React Query hooks for database dog operations
// Phase 0: Performance Infrastructure - React Query Integration
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAllDogs,
  getDogById,
  getDogsByOwner,
  createDog,
  updateDog,
  deleteDog,
  searchDogs,
  getDogStatistics,
} from '@/services/database/queries/dogQueries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { invalidateQueries } from '@/services/database/queryClient';
import { mapDatabaseToDog } from '@/services/mappers/dogMappers';
import { useCurrentPersonId } from '@/hooks/useCurrentPersonId';
import { replicatedDogsTable } from '@/services/replication';
import type { DbDogInsert, DbDogUpdate } from '@/types/database-mappings';

// Get all dogs owned/co-owned by the current user
export const useDogsQuery = () => {
  const personId = useCurrentPersonId();

  return useQuery({
    queryKey: [...queryKeys.dogs, personId],
    queryFn: async () => {
      // Try PostgREST first (rich data with owner join + registrations)
      const { data, error } = await getAllDogs(personId!);
      if (!error && data && data.length > 0) return data;

      // Fallback to replication layer (offline-first, service-role synced)
      // Adapt ReplicatedDog (camelCase) to snake_case shape expected by mapDatabaseDogsArray
      const replicatedDogs = await replicatedDogsTable.getAllDogs();
      return replicatedDogs
        .filter(d => d.ownerId === personId)
        .map(d => ({
          id: d.id,
          name: d.name,
          call_name: d.callName ?? null,
          breed: d.breed,
          sex: d.sex ?? null,
          date_of_birth: d.dateOfBirth ?? null,
          owner_id: d.ownerId ?? null,
          co_owner_id: null,
          height: d.height ?? null,
          weight: d.weight ?? null,
          color: d.color ?? null,
          microchip_number: d.microchipNumber ?? null,
          spayed_neutered: d.isSpayedNeutered ?? null,
          image_url: d.imageUrl ?? null,
          deleted_at: null,
          owner: null,
          registrations: [],
        }));
    },
    enabled: !!personId,
    ...cacheStrategies.moderate, // 5 minutes stale, 10 minutes cache
  });
};

// Get dog by ID with full details
export const useDogQuery = (id: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.dog(id),
    queryFn: async () => {
      const { data, error } = await getDogById(id);
      if (error) throw error;
      return data;
    },
    enabled: !!id && enabled,
    ...cacheStrategies.moderate,
  });
};

// Get dogs by owner ID
export const useDogsByOwnerQuery = (ownerId: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.personDogs(ownerId),
    queryFn: async () => {
      const { data, error } = await getDogsByOwner(ownerId);
      if (error) throw error;
      return data;
    },
    enabled: !!ownerId && enabled,
    ...cacheStrategies.moderate,
  });
};

// Search dogs by name or breed, scoped to current user
export const useDogsSearchQuery = (searchTerm: string, enabled = true) => {
  const personId = useCurrentPersonId();

  return useQuery({
    queryKey: [...queryKeys.peopleSearch(searchTerm), personId], // Reusing search pattern
    queryFn: async () => {
      const { data, error } = await searchDogs(searchTerm, personId!);
      if (error) throw error;
      return data;
    },
    enabled: !!searchTerm && searchTerm.length >= 2 && !!personId && enabled,
    ...cacheStrategies.dynamic, // 1 minute stale for search results
  });
};

// Get dog statistics for the current user
export const useDogStatisticsQuery = () => {
  const personId = useCurrentPersonId();

  return useQuery({
    queryKey: ['dogs', 'statistics', personId],
    queryFn: async () => {
      const { data, error } = await getDogStatistics(personId!);
      if (error) throw error;
      return data;
    },
    enabled: !!personId,
    ...cacheStrategies.static, // 30 minutes stale for statistics
  });
};

// Create dog mutation
export const useCreateDogMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dogData: DbDogInsert) => {
      const { data, error } = await createDog(dogData);
      if (error) throw error;
      return data;
    },
    onMutate: async newDog => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.dogs });

      // Snapshot the previous value
      const previousDogs = queryClient.getQueryData(queryKeys.dogs);

      // Optimistically update to the new value with temporary ID for UI only
      if (previousDogs) {
        queryClient.setQueryData(queryKeys.dogs, (old: unknown) => {
          const dogs = old as Array<{ id: string; name: string }>;
          // Use a temporary ID for optimistic updates only - this won't be sent to database
          return [...dogs, { ...newDog, id: 'temp-optimistic-' + Date.now() }];
        });
      }

      // Return a context object with the snapshotted value
      return { previousDogs };
    },
    onError: (_err, _newDog, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousDogs) {
        queryClient.setQueryData(queryKeys.dogs, context.previousDogs);
      }
    },
    onSuccess: (_data, variables) => {
      // Invalidate and refetch
      invalidateQueries.all('dogs');

      // If dog has owner, invalidate owner's dogs
      if (variables.owner_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.personDogs(variables.owner_id),
        });
      }
    },
  });
};

// Update dog mutation
export const useUpdateDogMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DbDogUpdate }) => {
      const { data, error } = await updateDog(id, updates);
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.dog(id) });

      // Snapshot the previous value
      const previousDog = queryClient.getQueryData(queryKeys.dog(id));

      // Optimistically update to the new value
      if (previousDog) {
        queryClient.setQueryData(queryKeys.dog(id), (old: unknown) => {
          // Create a temporary updated object and map it properly
          const tempUpdate = { ...(old as Record<string, unknown>), ...updates };
          return mapDatabaseToDog(tempUpdate);
        });
      }

      return { previousDog };
    },
    onError: (_err, { id }, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousDog) {
        queryClient.setQueryData(queryKeys.dog(id), context.previousDog);
      }
    },
    onSuccess: (data, { id }) => {
      // Update specific dog cache with mapped data
      if (data) {
        const mappedDog = mapDatabaseToDog(data);
        queryClient.setQueryData(queryKeys.dog(id), mappedDog);

        // Also update the dog in the main dogs list cache
        queryClient.setQueryData(queryKeys.dogs, (oldData: unknown) => {
          if (Array.isArray(oldData)) {
            return oldData.map((dog: Record<string, unknown>) => (dog.id === id ? mappedDog : dog));
          }
          return oldData;
        });
      }

      // Invalidate dogs list to ensure consistency
      invalidateQueries.all('dogs');

      // If owner changed, invalidate both old and new owner dogs
      if (data?.owner_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.personDogs(data.owner_id),
        });
      }
    },
  });
};

// Delete dog mutation
export const useDeleteDogMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, deletedBy }: { id: string; deletedBy?: string }) => {
      const { data, error } = await deleteDog(id, deletedBy);
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id: deletedId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.dogs });

      // Snapshot the previous value
      const previousDogs = queryClient.getQueryData(queryKeys.dogs);

      // Optimistically update by removing the dog
      if (previousDogs) {
        queryClient.setQueryData(queryKeys.dogs, (old: unknown) => {
          const dogs = old as Array<{ id: string }>;
          return dogs.filter(dog => dog.id !== deletedId);
        });
      }

      return { previousDogs };
    },
    onError: (_err, _variables, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousDogs) {
        queryClient.setQueryData(queryKeys.dogs, context.previousDogs);
      }
    },
    onSuccess: (_data, { id: deletedId }) => {
      // Remove from cache completely
      queryClient.removeQueries({ queryKey: queryKeys.dog(deletedId) });

      // Invalidate dogs list
      invalidateQueries.all('dogs');

      // Invalidate statistics since count changed
      queryClient.invalidateQueries({ queryKey: ['dogs', 'statistics'] });
    },
  });
};

// Prefetch dog details for performance
export const usePrefetchDog = () => {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.dog(id),
      queryFn: async () => {
        const { data, error } = await getDogById(id);
        if (error) throw error;
        return data;
      },
      staleTime: cacheStrategies.moderate.staleTime,
    });
  };
};

// Custom hook for dog management with all operations
export const useDogManagement = () => {
  const dogsQuery = useDogsQuery();
  const createMutation = useCreateDogMutation();
  const updateMutation = useUpdateDogMutation();
  const deleteMutation = useDeleteDogMutation();
  const prefetchDog = usePrefetchDog();

  return {
    // Queries
    dogs: dogsQuery.data,
    isLoading: dogsQuery.isLoading,
    error: dogsQuery.error,

    // Mutations
    createDog: createMutation.mutate,
    isCreating: createMutation.isPending,

    updateDog: updateMutation.mutate,
    isUpdating: updateMutation.isPending,

    deleteDog: (id: string, deletedBy?: string) =>
      deleteMutation.mutate({ id, ...(deletedBy !== undefined && { deletedBy }) }),
    isDeleting: deleteMutation.isPending,

    // Utilities
    prefetchDog,
    refetch: dogsQuery.refetch,
  };
};
