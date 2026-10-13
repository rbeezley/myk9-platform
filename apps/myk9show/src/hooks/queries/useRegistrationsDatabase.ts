// React Query hooks for database registration operations
// Phase 4.3: Registration System Integration
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAllRegistrations,
  getRegistrationById,
  getRegistrationsByOrganization,
  getRegistrationsByOwner,
  createRegistration,
  updateRegistration,
  deleteRegistration,
  searchRegistrations,
  getRegistrationStatistics,
  validateRegistrationNumber,
} from '@/services/database/registrations';
import {
  readRegistrationsForDog,
  type RegistrationsForDog,
} from '@/services/database/registrations/replicaReads';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import type { DbDogRegistrationInsert, DbDogRegistrationUpdate } from '@/types/database-mappings';

// Get all registrations with dog information
export const useRegistrationsQuery = () => {
  return useQuery({
    queryKey: queryKeys.registrations,
    queryFn: async () => {
      const { data, error } = await getAllRegistrations();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.moderate, // 5 minutes stale, 10 minutes cache
  });
};

// Get registration by ID with full details
export const useRegistrationQuery = (id: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.registration(id),
    queryFn: async () => {
      const { data, error } = await getRegistrationById(id);
      if (error) throw error;
      return data;
    },
    enabled: !!id && enabled,
    ...cacheStrategies.moderate,
  });
};

// One dog's registrations: server first, the labelled device copy when the
// server cannot be read (readRegistrationsForDog). `networkMode: 'always'` so
// offline the read runs and falls back instead of sitting `paused`, which
// renders as an empty list. The refresh listener in ReplicationSyncProvider
// (useRegistrationsReplicaCacheSync) invalidates this key on every replica
// change, so the mutations below need not.
const registrationsByDogOptions = (dogId: string, enabled: boolean) => ({
  queryKey: queryKeys.registrationsByDog(dogId),
  queryFn: () => readRegistrationsForDog(dogId),
  enabled: !!dogId && enabled,
  networkMode: 'always' as const,
  ...cacheStrategies.moderate,
});

export const useRegistrationsByDogQuery = (dogId: string, enabled = true) => {
  return useQuery({
    ...registrationsByDogOptions(dogId, enabled),
    select: (result: RegistrationsForDog) => result.rows,
  });
};

/**
 * What the dog page's identity rail shows from one dog's registrations read
 * (MYK9-1090). Any offline device copy is labelled (`offline`), as in the
 * Registrations section. An EMPTY one is unknown, not "none": the rail then
 * falls back to the registrations the dog record carries and, failing those,
 * a quiet offline status instead of "No registrations yet".
 */
export function railRegistrations(result: RegistrationsForDog | undefined): {
  registrations: RegistrationsForDog['rows'] | undefined;
  offline: boolean;
} {
  if (!result) return { registrations: undefined, offline: false };
  const offline = result.source === 'device';
  if (offline && result.rows.length === 0) return { registrations: undefined, offline };
  return { registrations: result.rows, offline };
}

/** One dog's registrations read for the identity rail; shares the query cache. */
export const useRailRegistrationsQuery = (dogId: string, enabled = true) => {
  return useQuery({
    ...registrationsByDogOptions(dogId, enabled),
    select: railRegistrations,
  });
};

// Get registrations by organization
export const useRegistrationsByOrganizationQuery = (organization: string, enabled = true) => {
  return useQuery({
    queryKey: ['registrations', 'organization', organization],
    queryFn: async () => {
      const { data, error } = await getRegistrationsByOrganization(organization);
      if (error) throw error;
      return data;
    },
    enabled: !!organization && enabled,
    ...cacheStrategies.moderate,
  });
};

// Get registrations by owner ID
export const useRegistrationsByOwnerQuery = (ownerId: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.registrationsByOwner(ownerId),
    queryFn: async () => {
      const { data, error } = await getRegistrationsByOwner(ownerId);
      if (error) throw error;
      return data;
    },
    enabled: !!ownerId && enabled,
    ...cacheStrategies.moderate,
  });
};

// Search registrations by registration number or dog name
export const useRegistrationsSearchQuery = (searchTerm: string, enabled = true) => {
  return useQuery({
    queryKey: ['registrations', 'search', searchTerm],
    queryFn: async () => {
      const { data, error } = await searchRegistrations(searchTerm);
      if (error) throw error;
      return data;
    },
    enabled: !!searchTerm && searchTerm.length >= 2 && enabled,
    ...cacheStrategies.dynamic, // 1 minute stale for search results
  });
};

// Get registration statistics
export const useRegistrationStatisticsQuery = () => {
  return useQuery({
    queryKey: ['registrations', 'statistics'],
    queryFn: async () => {
      const { data, error } = await getRegistrationStatistics();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.static, // 30 minutes stale for statistics
  });
};

// Validate registration number
export const useValidateRegistrationNumber = (
  organization: string,
  registrationNumber: string,
  enabled = true
) => {
  return useQuery({
    queryKey: ['registrations', 'validate', organization, registrationNumber],
    queryFn: async () => {
      const { data, error } = await validateRegistrationNumber(organization, registrationNumber);
      if (error) throw error;
      return data;
    },
    enabled: !!organization && !!registrationNumber && registrationNumber.length >= 3 && enabled,
    ...cacheStrategies.dynamic,
  });
};

// Create registration mutation
export const useCreateRegistrationMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Online-only write awaited by an edit panel: fail fast offline instead of
    // pausing, or the panel's Save never settles (MYK9-1125).
    networkMode: 'always',
    mutationFn: async (registrationData: DbDogRegistrationInsert) => {
      const { data, error } = await createRegistration(registrationData);
      if (error) throw error;
      return data;
    },
    onMutate: async newRegistration => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.registrations });

      // Snapshot the previous value
      const previousRegistrations = queryClient.getQueryData(queryKeys.registrations);

      // Optimistically update to the new value
      if (previousRegistrations) {
        queryClient.setQueryData(queryKeys.registrations, (old: unknown) => {
          const registrations = old as Array<{ id: string; registration_number: string }>;
          return [...registrations, { ...newRegistration, id: 'temp-' + Date.now() }];
        });
      }

      // Return a context object with the snapshotted value
      return { previousRegistrations };
    },
    onError: (_err, _newRegistration, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousRegistrations) {
        queryClient.setQueryData(queryKeys.registrations, context.previousRegistrations);
      }
    },
    onSuccess: (_data, variables) => {
      // The dog's registrations and the dog reads refresh through the replica
      // listener: createRegistration mirrors the new row into the replica.
      // Invalidate organization specific queries
      if (variables.organization) {
        queryClient.invalidateQueries({
          queryKey: ['registrations', 'organization', variables.organization],
        });
      }

      // Invalidate statistics
      queryClient.invalidateQueries({ queryKey: ['dog_registrations', 'statistics'] });
    },
  });
};

// Update registration mutation
export const useUpdateRegistrationMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    // Online-only write awaited by an edit panel: fail fast offline instead of
    // pausing, or the panel's Save never settles (MYK9-1125).
    networkMode: 'always',
    mutationFn: async ({ id, updates }: { id: string; updates: DbDogRegistrationUpdate }) => {
      const { data, error } = await updateRegistration(id, updates);
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.registration(id) });

      // Snapshot the previous value
      const previousRegistration = queryClient.getQueryData(queryKeys.registration(id));

      // Optimistically update to the new value
      if (previousRegistration) {
        queryClient.setQueryData(queryKeys.registration(id), (old: unknown) => {
          return { ...(old as Record<string, unknown>), ...updates };
        });
      }

      return { previousRegistration };
    },
    onError: (_err, { id }, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousRegistration) {
        queryClient.setQueryData(queryKeys.registration(id), context.previousRegistration);
      }
    },
    onSuccess: (data, { id, updates }) => {
      // Update specific registration cache
      queryClient.setQueryData(queryKeys.registration(id), data);

      // The dog's registrations and the dog reads refresh through the replica
      // listener: updateRegistration mirrors the saved row into the replica.

      // If organization changed, invalidate organization queries
      if (data?.organization || updates.organization) {
        const org = data?.organization || updates.organization;
        if (org) {
          queryClient.invalidateQueries({
            queryKey: ['registrations', 'organization', org],
          });
        }
      }

      // Invalidate statistics
      queryClient.invalidateQueries({ queryKey: ['dog_registrations', 'statistics'] });
    },
  });
};

// Delete registration mutation
export const useDeleteRegistrationMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await deleteRegistration(id);
      if (error) throw error;
      return data;
    },
    onMutate: async deletedId => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.registrations });

      // Snapshot the previous value
      const previousRegistrations = queryClient.getQueryData(queryKeys.registrations);
      const previousRegistration = queryClient.getQueryData(queryKeys.registration(deletedId));

      // Optimistically update by removing the registration
      if (previousRegistrations) {
        queryClient.setQueryData(queryKeys.registrations, (old: unknown) => {
          const registrations = old as Array<{ id: string }>;
          return registrations.filter(reg => reg.id !== deletedId);
        });
      }

      return { previousRegistrations, previousRegistration };
    },
    onError: (_err, deletedId, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousRegistrations) {
        queryClient.setQueryData(queryKeys.registrations, context.previousRegistrations);
      }
      if (context?.previousRegistration) {
        queryClient.setQueryData(queryKeys.registration(deletedId), context.previousRegistration);
      }
    },
    onSuccess: (_data, deletedId) => {
      // Remove from cache completely
      queryClient.removeQueries({ queryKey: queryKeys.registration(deletedId) });

      // Invalidate statistics since count changed. The dog's registrations and
      // the dog reads refresh through the replica listener: deleteRegistration
      // removes the row from the replica.
      queryClient.invalidateQueries({ queryKey: ['dog_registrations', 'statistics'] });
    },
  });
};

// Prefetch registration details for performance
export const usePrefetchRegistration = () => {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.registration(id),
      queryFn: async () => {
        const { data, error } = await getRegistrationById(id);
        if (error) throw error;
        return data;
      },
      staleTime: cacheStrategies.moderate.staleTime,
    });
  };
};

// Custom hook for registration management with all operations
export const useRegistrationManagement = () => {
  const registrationsQuery = useRegistrationsQuery();
  const createMutation = useCreateRegistrationMutation();
  const updateMutation = useUpdateRegistrationMutation();
  const deleteMutation = useDeleteRegistrationMutation();
  const prefetchRegistration = usePrefetchRegistration();

  return {
    // Queries
    registrations: registrationsQuery.data,
    isLoading: registrationsQuery.isLoading,
    error: registrationsQuery.error,

    // Mutations
    createRegistration: createMutation.mutate,
    isCreating: createMutation.isPending,

    updateRegistration: updateMutation.mutate,
    isUpdating: updateMutation.isPending,

    deleteRegistration: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,

    // Utilities
    prefetchRegistration,
    refetch: registrationsQuery.refetch,
  };
};

// Custom hook for dog-specific registration management
export const useDogRegistrationManagement = (dogId: string) => {
  const dogRegistrationsQuery = useQuery(registrationsByDogOptions(dogId, true));
  const createMutation = useCreateRegistrationMutation();
  const updateMutation = useUpdateRegistrationMutation();
  const deleteMutation = useDeleteRegistrationMutation();

  return {
    // Queries
    registrations: dogRegistrationsQuery.data?.rows,
    /** `device`: the server could not be read; the list is the offline copy. */
    registrationsSource: dogRegistrationsQuery.data?.source,
    isLoading: dogRegistrationsQuery.isLoading,
    error: dogRegistrationsQuery.error,

    // Mutations (pre-filled with dogId)
    createRegistration: (
      registrationData: Omit<DbDogRegistrationInsert, 'dog_id'>,
      options?: Parameters<typeof createMutation.mutate>[1]
    ) => createMutation.mutate({ ...registrationData, dog_id: dogId }, options),
    isCreating: createMutation.isPending,

    updateRegistration: updateMutation.mutate,
    isUpdating: updateMutation.isPending,

    deleteRegistration: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,

    // Utilities
    refetch: dogRegistrationsQuery.refetch,
  };
};
