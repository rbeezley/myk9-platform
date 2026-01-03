// React Query hooks for Trial database operations
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Trial, TrialInput } from '@/store/trialStore';
import {
  getAllTrials,
  getTrialById,
  getTrialsByShow,
  searchTrials,
  getTrialsByStatus,
  getUpcomingTrials,
  getTrialsByDateRange,
  createTrial,
  updateTrial,
  deleteTrial,
  hardDeleteTrial,
  restoreTrial,
  getDeletedTrials,
  getTrialStatistics,
} from '@/services/database/queries/trialQueries';
import {
  mapTrialInputToInsert,
  mapTrialInputToUpdate,
  mapDatabaseToTrial,
  mapDatabaseTrialsArray,
  type DbTrialWithShow,
} from '@/services/mappers/trialMappers';

// Query Keys
export const trialQueryKeys = {
  all: ['trials'] as const,
  lists: () => [...trialQueryKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...trialQueryKeys.lists(), filters] as const,
  details: () => [...trialQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...trialQueryKeys.details(), id] as const,
  search: (term: string) => [...trialQueryKeys.all, 'search', term] as const,
  byShow: (showId: string) => [...trialQueryKeys.all, 'show', showId] as const,
  byStatus: (status: string) => [...trialQueryKeys.all, 'status', status] as const,
  upcoming: () => [...trialQueryKeys.all, 'upcoming'] as const,
  byDateRange: (startDate: string, endDate: string) => [...trialQueryKeys.all, 'dateRange', startDate, endDate] as const,
  statistics: () => [...trialQueryKeys.all, 'statistics'] as const,
  deleted: () => [...trialQueryKeys.all, 'deleted'] as const,
};

// Cache strategies
const cacheStrategies = {
  // Fast cache for frequently accessed data
  fast: {
    gcTime: 1000 * 60 * 5, // 5 minutes
    staleTime: 1000 * 60 * 2, // 2 minutes
  },
  // Moderate cache for regularly accessed data
  moderate: {
    gcTime: 1000 * 60 * 30, // 30 minutes
    staleTime: 1000 * 60 * 5, // 5 minutes
  },
  // Long cache for rarely changing data
  long: {
    gcTime: 1000 * 60 * 60, // 1 hour
    staleTime: 1000 * 60 * 15, // 15 minutes
  },
};

// Query Hooks

/**
 * Get all trials with caching
 */
export const useTrialsQuery = () => {
  return useQuery({
    queryKey: trialQueryKeys.lists(),
    queryFn: async () => {
      const { data, error } = await getAllTrials();
      if (error) throw error;
      return mapDatabaseTrialsArray(data as Parameters<typeof mapDatabaseTrialsArray>[0]);
    },
    ...cacheStrategies.moderate,
  });
};

/**
 * Get a specific trial by ID
 */
export const useTrialQuery = (id: string) => {
  return useQuery({
    queryKey: trialQueryKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await getTrialById(id);
      if (error) throw error;
      return mapDatabaseToTrial(data as Parameters<typeof mapDatabaseToTrial>[0]);
    },
    enabled: !!id,
    ...cacheStrategies.fast,
  });
};

/**
 * Get trials by show ID
 */
export const useTrialsByShowQuery = (showId: string) => {
  return useQuery({
    queryKey: trialQueryKeys.byShow(showId),
    queryFn: async () => {
      const { data, error } = await getTrialsByShow(showId);
      if (error) throw error;
      return mapDatabaseTrialsArray(data as Parameters<typeof mapDatabaseTrialsArray>[0]);
    },
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
};

/**
 * Search trials with debounced caching
 */
export const useTrialsSearchQuery = (searchTerm: string) => {
  return useQuery({
    queryKey: trialQueryKeys.search(searchTerm),
    queryFn: async () => {
      if (!searchTerm.trim()) return [];
      const { data, error } = await searchTrials(searchTerm);
      if (error) throw error;
      return mapDatabaseTrialsArray(data as Parameters<typeof mapDatabaseTrialsArray>[0]);
    },
    enabled: searchTerm.length >= 2,
    ...cacheStrategies.fast,
  });
};

/**
 * Get trials by status
 */
export const useTrialsByStatusQuery = (status: string) => {
  return useQuery({
    queryKey: trialQueryKeys.byStatus(status),
    queryFn: async () => {
      const { data, error } = await getTrialsByStatus(status);
      if (error) throw error;
      return mapDatabaseTrialsArray(data as Parameters<typeof mapDatabaseTrialsArray>[0]);
    },
    enabled: !!status,
    ...cacheStrategies.moderate,
  });
};

/**
 * Get upcoming trials
 */
export const useUpcomingTrialsQuery = (limit?: number) => {
  return useQuery({
    queryKey: trialQueryKeys.upcoming(),
    queryFn: async () => {
      const { data, error } = await getUpcomingTrials(limit);
      if (error) throw error;
      return mapDatabaseTrialsArray(data as Parameters<typeof mapDatabaseTrialsArray>[0]);
    },
    ...cacheStrategies.fast,
  });
};

/**
 * Get trials by date range
 */
export const useTrialsByDateRangeQuery = (startDate: string, endDate: string) => {
  return useQuery({
    queryKey: trialQueryKeys.byDateRange(startDate, endDate),
    queryFn: async () => {
      const { data, error } = await getTrialsByDateRange(startDate, endDate);
      if (error) throw error;
      return mapDatabaseTrialsArray(data as Parameters<typeof mapDatabaseTrialsArray>[0]);
    },
    enabled: !!startDate && !!endDate,
    ...cacheStrategies.moderate,
  });
};

/**
 * Get trial statistics
 */
export const useTrialStatisticsQuery = () => {
  return useQuery({
    queryKey: trialQueryKeys.statistics(),
    queryFn: async () => {
      const { data, error } = await getTrialStatistics();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.long,
  });
};

/**
 * Get deleted trials query
 */
export const useDeletedTrialsQuery = () => {
  return useQuery({
    queryKey: trialQueryKeys.deleted(),
    queryFn: async () => {
      const { data, error } = await getDeletedTrials();
      if (error) throw error;
      return mapDatabaseTrialsArray(data as unknown as DbTrialWithShow[]);
    },
    ...cacheStrategies.fast,
  });
};

// Mutation Hooks

/**
 * Create a new trial with optimistic updates
 */
export const useCreateTrialMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (trialInput: TrialInput) => {
      const insertData = mapTrialInputToInsert(trialInput);
      const { data, error } = await createTrial(insertData);
      if (error) throw error;
      return mapDatabaseToTrial(data as Parameters<typeof mapDatabaseToTrial>[0]);
    },
    onSuccess: (newTrial) => {
      // Update the trials list cache
      queryClient.setQueryData<Trial[]>(trialQueryKeys.lists(), (old) => {
        if (!old) return [newTrial];
        return [newTrial, ...old];
      });

      // Update show-specific cache if available
      if (newTrial.showId) {
        queryClient.setQueryData<Trial[]>(trialQueryKeys.byShow(newTrial.showId), (old) => {
          if (!old) return [newTrial];
          return [newTrial, ...old];
        });
      }

      // Update status-specific cache if available
      queryClient.setQueryData<Trial[]>(trialQueryKeys.byStatus(newTrial.status), (old) => {
        if (!old) return [newTrial];
        return [newTrial, ...old];
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: trialQueryKeys.statistics() });
      queryClient.invalidateQueries({ queryKey: trialQueryKeys.upcoming() });
    },
  });
};

/**
 * Update an existing trial
 */
export const useUpdateTrialMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<TrialInput> }) => {
      const updateData = mapTrialInputToUpdate(updates);
      const { data, error } = await updateTrial(id, updateData);
      if (error) throw error;
      return mapDatabaseToTrial(data as Parameters<typeof mapDatabaseToTrial>[0]);
    },
    onSuccess: (updatedTrial) => {
      // Update the specific trial cache
      queryClient.setQueryData<Trial>(trialQueryKeys.detail(updatedTrial.id), updatedTrial);

      // Update the trials list cache
      queryClient.setQueryData<Trial[]>(trialQueryKeys.lists(), (old) => {
        if (!old) return [updatedTrial];
        return old.map(trial => trial.id === updatedTrial.id ? updatedTrial : trial);
      });

      // Update show-specific cache
      if (updatedTrial.showId) {
        queryClient.setQueryData<Trial[]>(trialQueryKeys.byShow(updatedTrial.showId), (old) => {
          if (!old) return [updatedTrial];
          return old.map(trial => trial.id === updatedTrial.id ? updatedTrial : trial);
        });
      }

      // Update status-specific cache
      queryClient.setQueryData<Trial[]>(trialQueryKeys.byStatus(updatedTrial.status), (old) => {
        if (!old) return [updatedTrial];
        return old.map(trial => trial.id === updatedTrial.id ? updatedTrial : trial);
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: trialQueryKeys.statistics() });
      queryClient.invalidateQueries({ queryKey: trialQueryKeys.upcoming() });
    },
  });
};

/**
 * Delete a trial (soft delete)
 */
export const useDeleteTrialMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, deletedBy }: { id: string; deletedBy?: string }) => {
      const { error } = await deleteTrial(id, deletedBy);
      if (error) throw error;
      return { id };
    },
    onMutate: async ({ id: deletedId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: trialQueryKeys.lists() });

      // Snapshot the previous value
      const previousTrials = queryClient.getQueryData(trialQueryKeys.lists());

      // Optimistically update by removing the trial
      if (previousTrials) {
        queryClient.setQueryData<Trial[]>(trialQueryKeys.lists(), (old) => {
          if (!old) return [];
          return old.filter(trial => trial.id !== deletedId);
        });
      }

      return { previousTrials };
    },
    onError: (_err, _variables, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousTrials) {
        queryClient.setQueryData(trialQueryKeys.lists(), context.previousTrials);
      }
    },
    onSuccess: ({ id }) => {
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: trialQueryKeys.detail(id) });

      // Invalidate all related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: trialQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: trialQueryKeys.statistics() });
    },
  });
};

/**
 * Restore trial mutation
 */
export const useRestoreTrialMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, restoredBy }: { id: string; restoredBy?: string }) => {
      const { data, error } = await restoreTrial(id, restoredBy);
      if (error) throw error;
      return mapDatabaseToTrial(data as Parameters<typeof mapDatabaseToTrial>[0]);
    },
    onSuccess: (restoredTrial, { id }) => {
      // Add back to the main trials list
      queryClient.setQueryData<Trial[]>(trialQueryKeys.lists(), (old) => {
        if (!old) return [restoredTrial];
        return [restoredTrial, ...old];
      });

      // Update the specific trial cache
      queryClient.setQueryData<Trial>(trialQueryKeys.detail(id), restoredTrial);

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: trialQueryKeys.deleted() });
      queryClient.invalidateQueries({ queryKey: trialQueryKeys.statistics() });
    },
  });
};

/**
 * Hard delete trial mutation (permanent removal)
 */
export const useHardDeleteTrialMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await hardDeleteTrial(id);
      if (error) throw error;
      return data;
    },
    onSuccess: (data, id) => {
      // Remove from deleted trials cache
      queryClient.setQueryData<Trial[]>(trialQueryKeys.deleted(), (old) => {
        if (!old) return [];
        return old.filter(trial => trial.id !== id);
      });

      // Remove from all caches
      queryClient.removeQueries({ queryKey: trialQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: trialQueryKeys.statistics() });
    },
  });
};

/**
 * Composite hook for common trial management operations
 */
export const useTrialManagement = () => {
  const queryClient = useQueryClient();
  const createMutation = useCreateTrialMutation();
  const updateMutation = useUpdateTrialMutation();
  const deleteMutation = useDeleteTrialMutation();

  const prefetchTrial = (id: string) => {
    return queryClient.prefetchQuery({
      queryKey: trialQueryKeys.detail(id),
      queryFn: async () => {
        const { data, error } = await getTrialById(id);
        if (error) throw error;
        return mapDatabaseToTrial(data as Parameters<typeof mapDatabaseToTrial>[0]);
      },
      ...cacheStrategies.fast,
    });
  };

  const invalidateTrialCaches = () => {
    return queryClient.invalidateQueries({ queryKey: trialQueryKeys.all });
  };

  return {
    // Mutations
    createTrial: createMutation.mutateAsync,
    updateTrial: updateMutation.mutateAsync,
    deleteTrial: deleteMutation.mutateAsync,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Cache management
    prefetchTrial,
    invalidateTrialCaches,

    // Error states
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
  };
};