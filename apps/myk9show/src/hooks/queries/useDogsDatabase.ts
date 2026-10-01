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
  searchDogs,
  getDogStatistics,
  getOwnedLiveDogsByPerson,
} from '@/services/database/dogs';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { mapDatabaseToDog } from '@/services/mappers/dogMappers';
import { useCurrentPersonId } from '@/hooks/useCurrentPersonId';
import { useAuthContext } from '@/hooks/useAuthContext';
import { deriveDogRosterScope } from '@/utils/dogRosterScope';
import type { DbDogInsert, DbDogUpdate } from '@/types/database-mappings';

// Get all dogs visible to the current user.
// The canonical roster predicate controls both the replication and online paths.
// Role chrome (cards/table and management affordances) is a separate question.
export const useDogsQuery = () => {
  const personId = useCurrentPersonId();
  const { hasRole, userWithRoles } = useAuthContext();
  // `userWithRoles` is null until identity/RBAC resolves (see AuthContext) —
  // the same signal `BrowseDogsPage` already gates its own loading state on.
  // While unresolved, `hasRole` reports false for every role, which is NOT
  // the same fact as "confirmed exhibitor with no full-roster role"; treating
  // it that way here previously let a full-roster request fire (or a
  // subsequently-resolved secretary reuse an empty roster cached under the
  // same key) before identity was known (MYK9-854 Codex follow-up).
  const identityResolved = Boolean(userWithRoles);
  const scope = useMemo(
    () => deriveDogRosterScope(identityResolved, hasRole),
    [identityResolved, hasRole]
  );

  const query = useQuery({
    queryKey: [...queryKeys.dogs, personId, scope],
    queryFn: async () => {
      // `getAllDogs` already wraps `replicatedDogsTable.getAllDogs()` as its
      // primary path via `withReplicationFallback` (see
      // services/database/dogs/reads.ts:228-253). The previous hook-level
      // fallback to `replicatedDogsTable.getAllDogs()` was therefore
      // redundant — it re-fetched from the SAME source the inner function
      // had just tried. For admins / secretaries who legitimately see zero
      // dogs in the replicated store on first load, the double-fetch fired
      // on every render until the cache warmed. See harden-backlog memory.
      // `enabled` keeps this query idle until identity resolves, but refetch()
      // bypasses `enabled` — without this guard a retry button could run the
      // roster read with an undefined person and report its result as fact.
      //
      // `personId` comes from `exhibitor_profiles`, which a secretary or site
      // admin may never have a row in — they are not exhibitors. A resolved
      // `'all'` scope never filters by owner (see below), so its read does not
      // need a person id at all; gating it on one anyway left a staff-only
      // account stuck at a permanent, false "0 dogs" (MYK9-854).
      const showAll = scope === 'all';
      if (!showAll && !personId) {
        throw new Error('Cannot load dogs before the signed-in person resolves');
      }
      const { data, error } = await getAllDogs(personId ?? '', showAll);
      if (error) throw error;
      return data ?? [];
    },
    enabled: scope === 'all' || (scope === 'own' && !!personId),
    ...cacheStrategies.moderate, // 5 minutes stale, 10 minutes cache
  });

  // React Query reports `isLoading: false` for a disabled query with no data
  // yet — indistinguishable from a confirmed empty roster. While the scope is
  // unresolved, override it so callers render a loading state, not an empty
  // one (MYK9-854 Codex follow-up).
  return { ...query, isLoading: query.isLoading || scope === 'unresolved' };
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

    // Utilities
    prefetchDog,
    refetch: dogsQuery.refetch,
  };
};
