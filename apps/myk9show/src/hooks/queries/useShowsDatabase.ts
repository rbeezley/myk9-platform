// React Query hooks for Show database operations
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Show, ShowInput } from '@/types/show-types';
import {
  getAllShows,
  getShowById,
  createShow,
  updateShow,
  deleteShow,
  hardDeleteShow,
  restoreShow,
  getDeletedShows,
  searchShows,
  getShowsByClub,
  getShowsByStatus,
  getUpcomingShows,
  getShowStatistics,
  getShowsWithEntryCounts,
  getShowsByDateRange
} from '@/services/database/queries/showQueries';
import {
  mapShowInputToInsert,
  mapShowInputToUpdate,
  mapDatabaseToShow,
  mapDatabaseShowsArray
} from '@/services/mappers/showMappers';

// Query Keys
export const showQueryKeys = {
  all: ['shows'] as const,
  lists: () => [...showQueryKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...showQueryKeys.lists(), filters] as const,
  details: () => [...showQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...showQueryKeys.details(), id] as const,
  search: (term: string) => [...showQueryKeys.all, 'search', term] as const,
  byClub: (clubId: string) => [...showQueryKeys.all, 'club', clubId] as const,
  byStatus: (status: string) => [...showQueryKeys.all, 'status', status] as const,
  upcoming: () => [...showQueryKeys.all, 'upcoming'] as const,
  statistics: () => [...showQueryKeys.all, 'statistics'] as const,
  withEntryCounts: () => [...showQueryKeys.all, 'withEntryCounts'] as const,
  byDateRange: (startDate: string, endDate: string) => [...showQueryKeys.all, 'dateRange', startDate, endDate] as const,
  deleted: () => [...showQueryKeys.all, 'deleted'] as const,
};

// Cache strategies
const cacheStrategies = {
  // Fast cache for frequently accessed data
  fast: {
    gcTime: 1000 * 60 * 5, // 5 minutes (renamed from cacheTime)
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
 * Get all shows with caching
 */
export const useShowsQuery = () => {
  return useQuery({
    queryKey: showQueryKeys.lists(),
    queryFn: async () => {
      const { data, error } = await getAllShows();
      if (error) throw error;
      return mapDatabaseShowsArray(data as Parameters<typeof mapDatabaseShowsArray>[0]);
    },
    ...cacheStrategies.moderate,
  });
};

/**
 * Get a specific show by ID
 */
export const useShowQuery = (id: string) => {
  return useQuery({
    queryKey: showQueryKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await getShowById(id);
      if (error) throw error;
      return mapDatabaseToShow(data as Parameters<typeof mapDatabaseToShow>[0]);
    },
    enabled: !!id,
    ...cacheStrategies.fast,
  });
};

/**
 * Search shows with debounced caching
 */
export const useShowsSearchQuery = (searchTerm: string) => {
  return useQuery({
    queryKey: showQueryKeys.search(searchTerm),
    queryFn: async () => {
      if (!searchTerm.trim()) return [];
      const { data, error } = await searchShows(searchTerm);
      if (error) throw error;
      return mapDatabaseShowsArray(data as Parameters<typeof mapDatabaseShowsArray>[0]);
    },
    enabled: searchTerm.length >= 2,
    ...cacheStrategies.fast,
  });
};

/**
 * Get shows by club
 */
export const useShowsByClubQuery = (clubId: string) => {
  return useQuery({
    queryKey: showQueryKeys.byClub(clubId),
    queryFn: async () => {
      const { data, error } = await getShowsByClub(clubId);
      if (error) throw error;
      return mapDatabaseShowsArray(data as Parameters<typeof mapDatabaseShowsArray>[0]);
    },
    enabled: !!clubId,
    ...cacheStrategies.moderate,
  });
};

/**
 * Get shows by status
 */
export const useShowsByStatusQuery = (status: string) => {
  return useQuery({
    queryKey: showQueryKeys.byStatus(status),
    queryFn: async () => {
      const { data, error } = await getShowsByStatus(status);
      if (error) throw error;
      return mapDatabaseShowsArray(data as Parameters<typeof mapDatabaseShowsArray>[0]);
    },
    enabled: !!status,
    ...cacheStrategies.moderate,
  });
};

/**
 * Get upcoming shows
 */
export const useUpcomingShowsQuery = (limit?: number) => {
  return useQuery({
    queryKey: showQueryKeys.upcoming(),
    queryFn: async () => {
      const { data, error } = await getUpcomingShows(limit);
      if (error) throw error;
      return mapDatabaseShowsArray(data as Parameters<typeof mapDatabaseShowsArray>[0]);
    },
    ...cacheStrategies.fast,
  });
};

/**
 * Get shows by date range
 */
export const useShowsByDateRangeQuery = (startDate: string, endDate: string) => {
  return useQuery({
    queryKey: showQueryKeys.byDateRange(startDate, endDate),
    queryFn: async () => {
      const { data, error } = await getShowsByDateRange(startDate, endDate);
      if (error) throw error;
      return mapDatabaseShowsArray(data as Parameters<typeof mapDatabaseShowsArray>[0]);
    },
    enabled: !!startDate && !!endDate,
    ...cacheStrategies.moderate,
  });
};

/**
 * Get show statistics
 */
export const useShowStatisticsQuery = () => {
  return useQuery({
    queryKey: showQueryKeys.statistics(),
    queryFn: async () => {
      const { data, error } = await getShowStatistics();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.long,
  });
};

/**
 * Get shows with entry counts
 */
export const useShowsWithEntryCountsQuery = () => {
  return useQuery({
    queryKey: showQueryKeys.withEntryCounts(),
    queryFn: async () => {
      const { data, error } = await getShowsWithEntryCounts();
      if (error) throw error;
      return data.map(show => ({
        ...mapDatabaseToShow(show),
        entryCount: show.entry_count || 0
      }));
    },
    ...cacheStrategies.moderate,
  });
};

// Mutation Hooks

/**
 * Create a new show with optimistic updates
 */
export const useCreateShowMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (showInput: ShowInput) => {
      const insertData = mapShowInputToInsert(showInput);
      const { data, error } = await createShow(insertData);
      if (error) throw error;
      return mapDatabaseToShow(data as Parameters<typeof mapDatabaseToShow>[0]);
    },
    onSuccess: (newShow) => {
      // Update the shows list cache
      queryClient.setQueryData<Show[]>(showQueryKeys.lists(), (old) => {
        if (!old) return [newShow];
        return [newShow, ...old];
      });

      // Update club-specific cache if available
      if (newShow.clubId) {
        queryClient.setQueryData<Show[]>(showQueryKeys.byClub(newShow.clubId), (old) => {
          if (!old) return [newShow];
          return [newShow, ...old];
        });
      }

      // Update status-specific cache if available
      queryClient.setQueryData<Show[]>(showQueryKeys.byStatus(newShow.status), (old) => {
        if (!old) return [newShow];
        return [newShow, ...old];
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: showQueryKeys.statistics() });
      queryClient.invalidateQueries({ queryKey: showQueryKeys.upcoming() });
      queryClient.invalidateQueries({ queryKey: showQueryKeys.withEntryCounts() });
    },
  });
};

/**
 * Update an existing show
 */
export const useUpdateShowMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ShowInput> }) => {
      const updateData = mapShowInputToUpdate(updates);
      const { data, error } = await updateShow(id, updateData);
      if (error) throw error;
      return mapDatabaseToShow(data as Parameters<typeof mapDatabaseToShow>[0]);
    },
    onSuccess: (updatedShow) => {
      // Update the specific show cache
      queryClient.setQueryData<Show>(showQueryKeys.detail(updatedShow.id), updatedShow);

      // Update the shows list cache
      queryClient.setQueryData<Show[]>(showQueryKeys.lists(), (old) => {
        if (!old) return [updatedShow];
        return old.map(show => show.id === updatedShow.id ? updatedShow : show);
      });

      // Update club-specific cache
      if (updatedShow.clubId) {
        queryClient.setQueryData<Show[]>(showQueryKeys.byClub(updatedShow.clubId), (old) => {
          if (!old) return [updatedShow];
          return old.map(show => show.id === updatedShow.id ? updatedShow : show);
        });
      }

      // Update status-specific cache
      queryClient.setQueryData<Show[]>(showQueryKeys.byStatus(updatedShow.status), (old) => {
        if (!old) return [updatedShow];
        return old.map(show => show.id === updatedShow.id ? updatedShow : show);
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: showQueryKeys.statistics() });
      queryClient.invalidateQueries({ queryKey: showQueryKeys.upcoming() });
      queryClient.invalidateQueries({ queryKey: showQueryKeys.withEntryCounts() });
    },
  });
};

/**
 * Delete a show (soft delete)
 */
export const useDeleteShowMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, deletedBy }: { id: string; deletedBy?: string }) => {
      const { error } = await deleteShow(id, deletedBy);
      if (error) throw error;
      return { id };
    },
    onMutate: async ({ id: deletedId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: showQueryKeys.lists() });

      // Snapshot the previous value
      const previousShows = queryClient.getQueryData(showQueryKeys.lists());

      // Optimistically update by removing the show
      if (previousShows) {
        queryClient.setQueryData<Show[]>(showQueryKeys.lists(), (old) => {
          if (!old) return [];
          return old.filter(show => show.id !== deletedId);
        });
      }

      return { previousShows };
    },
    onError: (_err, _variables, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousShows) {
        queryClient.setQueryData(showQueryKeys.lists(), context.previousShows);
      }
    },
    onSuccess: ({ id }) => {
      // Remove from detail cache
      queryClient.removeQueries({ queryKey: showQueryKeys.detail(id) });

      // Invalidate all related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: showQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: showQueryKeys.statistics() });
      queryClient.invalidateQueries({ queryKey: showQueryKeys.withEntryCounts() });
    },
  });
};

/**
 * Get deleted shows query
 */
export const useDeletedShowsQuery = () => {
  return useQuery({
    queryKey: showQueryKeys.deleted(),
    queryFn: async () => {
      const { data, error } = await getDeletedShows();
      if (error) throw error;
      return mapDatabaseShowsArray(data as Parameters<typeof mapDatabaseShowsArray>[0]);
    },
    ...cacheStrategies.fast,
  });
};

/**
 * Restore show mutation
 */
export const useRestoreShowMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, restoredBy }: { id: string; restoredBy?: string }) => {
      const { data, error } = await restoreShow(id, restoredBy);
      if (error) throw error;
      return mapDatabaseToShow(data as Parameters<typeof mapDatabaseToShow>[0]);
    },
    onSuccess: (restoredShow, { id }) => {
      // Add back to the main shows list
      queryClient.setQueryData<Show[]>(showQueryKeys.lists(), (old) => {
        if (!old) return [restoredShow];
        return [restoredShow, ...old];
      });

      // Update the specific show cache
      queryClient.setQueryData<Show>(showQueryKeys.detail(id), restoredShow);

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: showQueryKeys.deleted() });
      queryClient.invalidateQueries({ queryKey: showQueryKeys.statistics() });
      queryClient.invalidateQueries({ queryKey: showQueryKeys.withEntryCounts() });
    },
  });
};

/**
 * Hard delete show mutation (permanent removal)
 */
export const useHardDeleteShowMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await hardDeleteShow(id);
      if (error) throw error;
      return data;
    },
    onSuccess: (data, id) => {
      // Remove from deleted shows cache
      queryClient.setQueryData<Show[]>(showQueryKeys.deleted(), (old) => {
        if (!old) return [];
        return old.filter(show => show.id !== id);
      });

      // Remove from all caches
      queryClient.removeQueries({ queryKey: showQueryKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: showQueryKeys.statistics() });
    },
  });
};

/**
 * Composite hook for common show management operations
 */
export const useShowManagement = () => {
  const queryClient = useQueryClient();
  const createMutation = useCreateShowMutation();
  const updateMutation = useUpdateShowMutation();
  const deleteMutation = useDeleteShowMutation();

  const prefetchShow = (id: string) => {
    return queryClient.prefetchQuery({
      queryKey: showQueryKeys.detail(id),
      queryFn: async () => {
        const { data, error } = await getShowById(id);
        if (error) throw error;
        return mapDatabaseToShow(data as Parameters<typeof mapDatabaseToShow>[0]);
      },
      ...cacheStrategies.fast,
    });
  };

  const invalidateShowCaches = () => {
    return queryClient.invalidateQueries({ queryKey: showQueryKeys.all });
  };

  return {
    // Mutations
    createShow: createMutation.mutateAsync,
    updateShow: updateMutation.mutateAsync,
    deleteShow: deleteMutation.mutateAsync,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Cache management
    prefetchShow,
    invalidateShowCaches,

    // Error states
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
  };
};