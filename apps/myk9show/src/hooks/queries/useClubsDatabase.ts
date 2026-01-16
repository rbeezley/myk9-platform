// React Query hooks for Club database operations
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Club, ClubInput } from '@/types/club-types';
import {
  getAllClubs,
  getClubById,
  createClub,
  updateClub,
  deleteClub,
  searchClubs,
  searchClubsByLocation,
  getActiveClubs,
  getClubsWithShowCounts,
  getClubStatistics,
  checkClubNameExists
} from '@/services/database/queries/clubQueries';
import {
  mapClubInputToInsert,
  mapClubInputToUpdate,
  mapDatabaseToClub,
  mapDatabaseClubsArray
} from '@/services/mappers/clubMappers';

// Query Keys
export const clubQueryKeys = {
  all: ['clubs'] as const,
  lists: () => [...clubQueryKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...clubQueryKeys.lists(), filters] as const,
  details: () => [...clubQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...clubQueryKeys.details(), id] as const,
  search: (term: string) => [...clubQueryKeys.all, 'search', term] as const,
  searchLocation: (term: string) => [...clubQueryKeys.all, 'searchLocation', term] as const,
  active: () => [...clubQueryKeys.all, 'active'] as const,
  withShowCounts: () => [...clubQueryKeys.all, 'withShowCounts'] as const,
  statistics: () => [...clubQueryKeys.all, 'statistics'] as const,
  nameExists: (name: string, excludeId?: string) => [...clubQueryKeys.all, 'nameExists', name, excludeId] as const,
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
 * Get all clubs with caching
 */
export const useClubsQuery = () => {
  return useQuery({
    queryKey: clubQueryKeys.lists(),
    queryFn: async () => {
      const { data, error } = await getAllClubs();
      if (error) throw error;
      return mapDatabaseClubsArray(data as Parameters<typeof mapDatabaseClubsArray>[0]);
    },
    ...cacheStrategies.moderate,
  });
};

/**
 * Get a specific club by ID
 */
export const useClubQuery = (id: string) => {
  return useQuery({
    queryKey: clubQueryKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await getClubById(id);
      if (error) throw error;
      return mapDatabaseToClub(data as Parameters<typeof mapDatabaseToClub>[0]);
    },
    enabled: !!id,
    ...cacheStrategies.fast,
  });
};

/**
 * Search clubs with debounced caching
 */
export const useClubsSearchQuery = (searchTerm: string) => {
  return useQuery({
    queryKey: clubQueryKeys.search(searchTerm),
    queryFn: async () => {
      if (!searchTerm.trim()) return [];
      const { data, error } = await searchClubs(searchTerm);
      if (error) throw error;
      return mapDatabaseClubsArray(data as Parameters<typeof mapDatabaseClubsArray>[0]);
    },
    enabled: searchTerm.length >= 2,
    ...cacheStrategies.fast,
  });
};

/**
 * Search clubs by location
 */
export const useClubsByLocationQuery = (searchTerm: string) => {
  return useQuery({
    queryKey: clubQueryKeys.searchLocation(searchTerm),
    queryFn: async () => {
      if (!searchTerm.trim()) return [];
      const { data, error } = await searchClubsByLocation(searchTerm);
      if (error) throw error;
      return mapDatabaseClubsArray(data as Parameters<typeof mapDatabaseClubsArray>[0]);
    },
    enabled: searchTerm.length >= 2,
    ...cacheStrategies.fast,
  });
};

/**
 * Get active clubs
 */
export const useActiveClubsQuery = () => {
  return useQuery({
    queryKey: clubQueryKeys.active(),
    queryFn: async () => {
      const { data, error } = await getActiveClubs();
      if (error) throw error;
      return mapDatabaseClubsArray(data as Parameters<typeof mapDatabaseClubsArray>[0]);
    },
    ...cacheStrategies.moderate,
  });
};

/**
 * Get club statistics
 */
export const useClubStatisticsQuery = () => {
  return useQuery({
    queryKey: clubQueryKeys.statistics(),
    queryFn: async () => {
      const { data, error } = await getClubStatistics();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.long,
  });
};

/**
 * Get clubs with show counts
 */
export const useClubsWithShowCountsQuery = () => {
  return useQuery({
    queryKey: clubQueryKeys.withShowCounts(),
    queryFn: async () => {
      const { data, error } = await getClubsWithShowCounts();
      if (error) throw error;
      return data.map(club => ({
        ...mapDatabaseToClub(club),
        showCount: club.show_count || 0
      }));
    },
    ...cacheStrategies.moderate,
  });
};

/**
 * Check if club name exists
 */
export const useClubNameExistsQuery = (name: string, excludeId?: string) => {
  return useQuery({
    queryKey: clubQueryKeys.nameExists(name, excludeId),
    queryFn: async () => {
      const { exists, data, error } = await checkClubNameExists(name, excludeId);
      if (error) throw error;
      return { exists, data };
    },
    enabled: name.length >= 2,
    ...cacheStrategies.fast,
  });
};

// Mutation Hooks

/**
 * Create a new club with optimistic updates
 */
export const useCreateClubMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clubInput: ClubInput) => {
      const insertData = mapClubInputToInsert(clubInput);
      const { data, error } = await createClub(insertData);
      if (error) throw error;
      return mapDatabaseToClub(data as Parameters<typeof mapDatabaseToClub>[0]);
    },
    onSuccess: (newClub) => {
      // Update the clubs list cache
      queryClient.setQueryData<Club[]>(clubQueryKeys.lists(), (old) => {
        if (!old) return [newClub];
        return [newClub, ...old];
      });

      // Update active clubs cache
      queryClient.setQueryData<Club[]>(clubQueryKeys.active(), (old) => {
        if (!old) return [newClub];
        return [newClub, ...old];
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.statistics() });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.withShowCounts() });
    },
  });
};

/**
 * Update an existing club
 */
export const useUpdateClubMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<ClubInput> }) => {
      const updateData = mapClubInputToUpdate(updates);
      const { data, error } = await updateClub(id, updateData);
      if (error) throw error;
      return mapDatabaseToClub(data as Parameters<typeof mapDatabaseToClub>[0]);
    },
    onSuccess: (updatedClub) => {
      // Update the specific club cache
      queryClient.setQueryData<Club>(clubQueryKeys.detail(updatedClub.id), updatedClub);

      // Update the clubs list cache
      queryClient.setQueryData<Club[]>(clubQueryKeys.lists(), (old) => {
        if (!old) return [updatedClub];
        return old.map(club => club.id === updatedClub.id ? updatedClub : club);
      });

      // Update active clubs cache
      queryClient.setQueryData<Club[]>(clubQueryKeys.active(), (old) => {
        if (!old) return [updatedClub];
        return old.map(club => club.id === updatedClub.id ? updatedClub : club);
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.statistics() });
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.withShowCounts() });
    },
  });
};

/**
 * Delete a club
 */
export const useDeleteClubMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteClub(id);
      if (error) throw error;
      return { id };
    },
    onSuccess: ({ id }) => {
      // Remove from all caches
      queryClient.setQueryData<Club[]>(clubQueryKeys.lists(), (old) => {
        if (!old) return [];
        return old.filter(club => club.id !== id);
      });

      queryClient.setQueryData<Club[]>(clubQueryKeys.active(), (old) => {
        if (!old) return [];
        return old.filter(club => club.id !== id);
      });

      // Remove from detail cache
      queryClient.removeQueries({ queryKey: clubQueryKeys.detail(id) });

      // Invalidate all related queries to ensure consistency
      queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
    },
  });
};

/**
 * Composite hook for common club management operations
 */
export const useClubManagement = () => {
  const queryClient = useQueryClient();
  const createMutation = useCreateClubMutation();
  const updateMutation = useUpdateClubMutation();
  const deleteMutation = useDeleteClubMutation();

  const prefetchClub = (id: string) => {
    return queryClient.prefetchQuery({
      queryKey: clubQueryKeys.detail(id),
      queryFn: async () => {
        const { data, error } = await getClubById(id);
        if (error) throw error;
        return mapDatabaseToClub(data as Parameters<typeof mapDatabaseToClub>[0]);
      },
      ...cacheStrategies.fast,
    });
  };

  const invalidateClubCaches = () => {
    return queryClient.invalidateQueries({ queryKey: clubQueryKeys.all });
  };

  return {
    // Mutations
    createClub: createMutation.mutateAsync,
    updateClub: updateMutation.mutateAsync,
    deleteClub: deleteMutation.mutateAsync,

    // Mutation states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,

    // Cache management
    prefetchClub,
    invalidateClubCaches,

    // Error states
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,
  };
};