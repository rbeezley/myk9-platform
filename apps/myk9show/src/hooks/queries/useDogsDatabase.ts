// React Query hooks for database dog operations
// Phase 0: Performance Infrastructure - React Query Integration
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  getAllDogs,
  getDogById,
  getDogsByOwner,
  createDog,
  updateDog,
  deleteDog,
  searchDogs,
  getDogStatistics,
  getOwnedLiveDogsByPerson,
} from '@/services/database/dogs';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { mapDatabaseToDog } from '@/services/mappers/dogMappers';
import { useCurrentPersonId } from '@/hooks/useCurrentPersonId';
import { useAuthContext } from '@/hooks/useAuthContext';
import { rosterIsOwnDogsOnly } from '@/utils/dogRosterScope';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { logger } from '@/services/LoggingService';
import type { DbDogInsert, DbDogUpdate } from '@/types/database-mappings';

// Get all dogs visible to the current user.
// The canonical roster predicate controls both the replication and online paths.
// Role chrome (cards/table and management affordances) is a separate question.
export const useDogsQuery = () => {
  const personId = useCurrentPersonId();
  const { hasRole } = useAuthContext();
  const showAll = useMemo(() => !rosterIsOwnDogsOnly(hasRole), [hasRole]);

  return useQuery({
    queryKey: [...queryKeys.dogs, personId, showAll],
    queryFn: async () => {
      // `getAllDogs` already wraps `replicatedDogsTable.getAllDogs()` as its
      // primary path via `withReplicationFallback` (see
      // services/database/dogs/reads.ts:228-253). The previous hook-level
      // fallback to `replicatedDogsTable.getAllDogs()` was therefore
      // redundant — it re-fetched from the SAME source the inner function
      // had just tried. For admins / secretaries who legitimately see zero
      // dogs in the replicated store on first load, the double-fetch fired
      // on every render until the cache warmed. See harden-backlog memory.
      const { data, error } = await getAllDogs(personId!, showAll);
      if (error) throw error;
      return data ?? [];
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

// Live dogs a person primarily owns — drives the delete-person guard. Gated by
// `enabled` so it only fires when the delete dialog is open. Always refetched
// fresh (staleTime 0 + refetchOnMount): this gates a destructive decision, and a
// dog deleted between two opens of the dialog must not leave a stale block. Dog
// deletes don't invalidate personDogs, so we can't rely on the moderate cache.
export const useOwnedLiveDogsByPersonQuery = (personId: string, enabled = true) => {
  return useQuery({
    queryKey: [...queryKeys.personDogs(personId), 'owned-live'],
    queryFn: () => getOwnedLiveDogsByPerson(personId),
    enabled: !!personId && enabled,
    staleTime: 0,
    refetchOnMount: 'always',
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
      // Invalidate and refetch all dog list variants, including role-scoped keys.
      queryClient.invalidateQueries({ queryKey: queryKeys.dogs });

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
      queryClient.invalidateQueries({ queryKey: queryKeys.dogs });

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
      // The dogs list reads IndexedDB first (`getAllDogs` -> replication), and a
      // soft delete removes the row from RLS visibility so replication polling
      // never learns about it. Without this the invalidate below refetches the
      // still-present local row and the dog reappears until a full reload.
      // It belongs HERE rather than in a caller: `mutationFn` resolves before
      // `onSuccess` runs, so the refetch cannot race the cleanup, and every
      // caller of this mutation (bulk bar included) gets it.
      await replicatedDogsTable.delete(id).catch(err => {
        logger.warn(
          'Failed to remove soft-deleted dog from IndexedDB',
          'dogs',
          { dogId: id },
          err as Error
        );
      });
      return data;
    },
    onMutate: async ({ id: deletedId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.dogs });

      // Snapshot the previous value
      const previousDogs = queryClient.getQueriesData({ queryKey: queryKeys.dogs });

      // Optimistically update all role-scoped dog lists by removing the dog.
      queryClient.setQueriesData({ queryKey: queryKeys.dogs }, (old: unknown) => {
        if (Array.isArray(old)) {
          const dogs = old as Array<{ id: string }>;
          return dogs.filter(dog => dog.id !== deletedId);
        }
        return old;
      });

      return { previousDogs };
    },
    onError: (_err, _variables, context) => {
      // If the mutation fails, use the context to roll back
      context?.previousDogs?.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSuccess: (_data, { id: deletedId }) => {
      // Remove from cache completely
      queryClient.removeQueries({ queryKey: queryKeys.dog(deletedId) });

      // Invalidate dogs list
      queryClient.invalidateQueries({ queryKey: queryKeys.dogs });

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
