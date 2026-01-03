// React Query hooks for database registration operations
// Phase 4.3: Registration System Integration
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getAllRegistrations,
  getRegistrationById,
  getRegistrationsByDog,
  getRegistrationsByOrganization,
  getRegistrationsByStatus,
  getRegistrationsByOwner,
  createRegistration,
  updateRegistration,
  deleteRegistration,
  searchRegistrations,
  getRegistrationStatistics,
  validateRegistrationNumber
} from '@/services/database/queries/registrationQueries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { invalidateQueries } from '@/services/database/queryClient';
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

// Get registrations by dog ID
export const useRegistrationsByDogQuery = (dogId: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.registrationsByDog(dogId),
    queryFn: async () => {
      const { data, error } = await getRegistrationsByDog(dogId);
      if (error) throw error;
      return data;
    },
    enabled: !!dogId && enabled,
    ...cacheStrategies.moderate,
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

// Get registrations by status
export const useRegistrationsByStatusQuery = (status: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.registrationsByStatus(status),
    queryFn: async () => {
      const { data, error } = await getRegistrationsByStatus(status);
      if (error) throw error;
      return data;
    },
    enabled: !!status && enabled,
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
export const useValidateRegistrationNumber = (organization: string, registrationNumber: string, enabled = true) => {
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
    mutationFn: async (registrationData: DbDogRegistrationInsert) => {
      const { data, error } = await createRegistration(registrationData);
      if (error) throw error;
      return data;
    },
    onMutate: async (newRegistration) => {
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
    onError: (err, newRegistration, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousRegistrations) {
        queryClient.setQueryData(queryKeys.registrations, context.previousRegistrations);
      }
    },
    onSuccess: (data, variables) => {
      // Invalidate and refetch registration lists
      invalidateQueries.all('dogs');
      
      // If registration has dog, invalidate dog's registrations
      if (variables.dog_id) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.registrationsByDog(variables.dog_id) 
        });
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.dogRegistrations(variables.dog_id) 
        });
      }

      // Invalidate organization and status specific queries
      if (variables.organization) {
        queryClient.invalidateQueries({ 
          queryKey: ['registrations', 'organization', variables.organization] 
        });
      }

      if (variables.status) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.registrationsByStatus(variables.status) 
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
    onError: (err, { id }, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousRegistration) {
        queryClient.setQueryData(queryKeys.registration(id), context.previousRegistration);
      }
    },
    onSuccess: (data, { id, updates }) => {
      // Update specific registration cache
      queryClient.setQueryData(queryKeys.registration(id), data);
      
      // Invalidate registration lists to ensure consistency
      invalidateQueries.lists('dogs');
      
      // If dog changed, invalidate both old and new dog registrations
      if (data?.dog_id) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.registrationsByDog(data.dog_id) 
        });
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.dogRegistrations(data.dog_id) 
        });
      }

      // If organization changed, invalidate organization queries
      if (data?.organization || updates.organization) {
        const org = data?.organization || updates.organization;
        if (org) {
          queryClient.invalidateQueries({ 
            queryKey: ['registrations', 'organization', org] 
          });
        }
      }

      // If status changed, invalidate status queries
      if (data?.status || updates.status) {
        const status = data?.status || updates.status;
        if (status) {
          queryClient.invalidateQueries({ 
            queryKey: queryKeys.registrationsByStatus(status) 
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
    onMutate: async (deletedId) => {
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
    onError: (err, deletedId, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousRegistrations) {
        queryClient.setQueryData(queryKeys.registrations, context.previousRegistrations);
      }
      if (context?.previousRegistration) {
        queryClient.setQueryData(queryKeys.registration(deletedId), context.previousRegistration);
      }
    },
    onSuccess: (data, deletedId) => {
      // Remove from cache completely
      queryClient.removeQueries({ queryKey: queryKeys.registration(deletedId) });
      
      // Invalidate registration lists
      invalidateQueries.all('dogs');
      
      // Invalidate statistics since count changed
      queryClient.invalidateQueries({ queryKey: ['dog_registrations', 'statistics'] });

      // If we know the dog ID from the deleted registration, invalidate dog registrations
      if (data?.dog_id) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.registrationsByDog(data.dog_id) 
        });
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.dogRegistrations(data.dog_id) 
        });
      }
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
  const dogRegistrationsQuery = useRegistrationsByDogQuery(dogId);
  const createMutation = useCreateRegistrationMutation();
  const updateMutation = useUpdateRegistrationMutation();
  const deleteMutation = useDeleteRegistrationMutation();

  return {
    // Queries
    registrations: dogRegistrationsQuery.data,
    isLoading: dogRegistrationsQuery.isLoading,
    error: dogRegistrationsQuery.error,
    
    // Mutations (pre-filled with dogId)
    createRegistration: (registrationData: Omit<DbDogRegistrationInsert, 'dog_id'>) => 
      createMutation.mutate({ ...registrationData, dog_id: dogId }),
    isCreating: createMutation.isPending,
    
    updateRegistration: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    
    deleteRegistration: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    
    // Utilities
    refetch: dogRegistrationsQuery.refetch,
  };
};