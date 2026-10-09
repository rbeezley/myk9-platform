// React Query hooks for Class database operations - Phase 2.5: Class Store Integration
// Provides type-safe, cached database operations for classes and entries

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  getAllClasses,
  getClassById,
  getClassesByTrialId,
  createClass,
  updateClass,
  hardDeleteClass,
  restoreClass,
  getDeletedClasses,
  searchClasses,
  getClassStatistics,
} from '@/services/database/classes';
import {
  getAllEntries,
  getEntriesByClassId,
  updateEntry,
  hardDeleteEntry,
  restoreEntry,
  getDeletedEntries,
  entryInvalidationKeys,
} from '@/services/database/entries';
import type { DbClassInsert, DbClassUpdate, DbEntryUpdate } from '@/types/database-mappings';

// ===== QUERY KEYS =====

export const classKeys = {
  all: ['classes'] as const,
  lists: () => [...classKeys.all, 'list'] as const,
  list: (filters: string) => [...classKeys.lists(), { filters }] as const,
  details: () => [...classKeys.all, 'detail'] as const,
  detail: (id: string) => [...classKeys.details(), id] as const,
  byTrial: (trialId: string) => [...classKeys.all, 'trial', trialId] as const,
  search: (term: string) => [...classKeys.all, 'search', term] as const,
  statistics: () => [...classKeys.all, 'statistics'] as const,
  deleted: () => [...classKeys.all, 'deleted'] as const,
};

/**
 * Mark the class caches stale after classes are created, so every page that reads them
 * refetches instead of waiting out `staleTime`. The one definition of "what a class create
 * invalidates": `useCreateClassMutation` and the show wizard's class writes both call it.
 * `trialIds` are the trials that gained classes.
 */
export function invalidateClassCaches(
  queryClient: QueryClient,
  trialIds: readonly string[] = []
): void {
  queryClient.invalidateQueries({ queryKey: classKeys.lists() });
  for (const trialId of new Set(trialIds)) {
    queryClient.invalidateQueries({ queryKey: classKeys.byTrial(trialId) });
  }
  queryClient.invalidateQueries({ queryKey: classKeys.statistics() });
}

export const entryKeys = {
  all: ['entries'] as const,
  lists: () => [...entryKeys.all, 'list'] as const,
  list: (filters: string) => [...entryKeys.lists(), { filters }] as const,
  details: () => [...entryKeys.all, 'detail'] as const,
  detail: (id: string) => [...entryKeys.details(), id] as const,
  byClass: (classId: string) => [...entryKeys.all, 'class', classId] as const,
  deleted: () => [...entryKeys.all, 'deleted'] as const,
};

// ===== CLASS QUERIES =====

/**
 * Get all classes with caching
 */
export const useClassesQuery = () => {
  return useQuery({
    queryKey: classKeys.lists(),
    queryFn: async () => {
      const { data, error } = await getAllClasses();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Get a specific class by ID
 */
export const useClassQuery = (id: string, enabled = true) => {
  return useQuery({
    queryKey: classKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await getClassById(id);
      if (error) throw error;
      return data;
    },
    enabled: enabled && !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
};

/**
 * Get classes by trial ID
 */
export const classesByTrialQueryOptions = (trialId: string, enabled = true) => ({
  queryKey: classKeys.byTrial(trialId),
  queryFn: async () => {
    const { data, error } = await getClassesByTrialId(trialId);
    if (error) throw error;
    return data;
  },
  enabled: enabled && !!trialId,
  staleTime: 2 * 60 * 1000, // 2 minutes - trial data changes more frequently
  gcTime: 5 * 60 * 1000, // 5 minutes
});

export const useClassesByTrialQuery = (trialId: string, enabled = true) => {
  return useQuery(classesByTrialQueryOptions(trialId, enabled));
};

/**
 * Search classes
 */
export const useClassSearchQuery = (searchTerm: string, enabled = true) => {
  return useQuery({
    queryKey: classKeys.search(searchTerm),
    queryFn: async () => {
      const { data, error } = await searchClasses(searchTerm);
      if (error) throw error;
      return data;
    },
    enabled: enabled && !!searchTerm && searchTerm.length > 2,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Get class statistics
 */
export const useClassStatisticsQuery = () => {
  return useQuery({
    queryKey: classKeys.statistics(),
    queryFn: async () => {
      const { data, error } = await getClassStatistics();
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - statistics change less frequently
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
};

// ===== ENTRY QUERIES =====

/**
 * Get all entries with caching
 */
export const useEntriesQuery = () => {
  const { user, loading } = useAuthContext();

  return useQuery({
    queryKey: entryKeys.lists(),
    queryFn: async () => {
      const { data, error } = await getAllEntries();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(user && user.is_anonymous !== true) && !loading,
    staleTime: 2 * 60 * 1000, // 2 minutes - entry data changes frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Get entries by class ID
 */
export const useEntriesByClassQuery = (classId: string, enabled = true) => {
  const { user, loading } = useAuthContext();

  return useQuery({
    queryKey: entryKeys.byClass(classId),
    queryFn: async () => {
      const { data, error } = await getEntriesByClassId(classId);
      if (error) throw error;
      return data;
    },
    enabled: enabled && !!classId && Boolean(user && user.is_anonymous !== true) && !loading,
    staleTime: 1 * 60 * 1000, // 1 minute - entry data changes very frequently during events
    gcTime: 3 * 60 * 1000, // 3 minutes
  });
};

// ===== CLASS MUTATIONS =====

/**
 * Create a new class
 */
export const useCreateClassMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (classData: DbClassInsert) => {
      const { data, error } = await createClass(classData);
      if (error) throw error;
      return data;
    },
    onSuccess: newClass => {
      // Lists, the trial's cache and statistics (shared with the wizard's class writes)
      invalidateClassCaches(queryClient, newClass?.trial_id ? [newClass.trial_id] : []);

      // Set the new class in cache
      if (newClass?.id) {
        queryClient.setQueryData(classKeys.detail(newClass.id), newClass);
      }
    },
  });
};

/**
 * Update a class
 */
export const useUpdateClassMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DbClassUpdate }) => {
      const { data, error } = await updateClass(id, updates);
      if (error) throw error;
      return data;
    },
    onSuccess: (updatedClass, { id }) => {
      // Update the specific class in cache
      queryClient.setQueryData(classKeys.detail(id), updatedClass);

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });

      // Invalidate trial-specific cache if trial changed
      if (updatedClass?.trial_id) {
        queryClient.invalidateQueries({ queryKey: classKeys.byTrial(updatedClass.trial_id) });
      }
    },
  });
};

// ===== ENTRY MUTATIONS =====

/**
 * Update an entry
 */
export const useUpdateEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DbEntryUpdate }) => {
      const { data, error } = await updateEntry({ id, updates });
      if (error) throw error;
      return data;
    },
    onSuccess: updatedEntry => {
      if (updatedEntry?.class_id) {
        entryInvalidationKeys({
          classId: updatedEntry.class_id,
          ...(updatedEntry.show_id ? { showId: updatedEntry.show_id } : {}),
          ...(updatedEntry.dog_id ? { dogId: updatedEntry.dog_id } : {}),
        }).forEach(k => queryClient.invalidateQueries({ queryKey: k }));
        queryClient.invalidateQueries({ queryKey: classKeys.detail(updatedEntry.class_id) });
      } else {
        entryInvalidationKeys({}).forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      }
    },
  });
};

// ===== SOFT DELETE HOOKS =====

/**
 * Get deleted classes query
 */
export const useDeletedClassesQuery = () => {
  return useQuery({
    queryKey: classKeys.deleted(),
    queryFn: async () => {
      const { data, error } = await getDeletedClasses();
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Restore class mutation
 */
export const useRestoreClassMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, restoredBy }: { id: string; restoredBy?: string }) => {
      const { data, error } = await restoreClass(id, restoredBy);
      if (error) throw error;
      return data;
    },
    onSuccess: (restoredClass, { id }) => {
      // Add back to the main classes list
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });

      // Update the specific class cache
      if (restoredClass) {
        queryClient.setQueryData(classKeys.detail(id), restoredClass);
      }

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: classKeys.deleted() });
      queryClient.invalidateQueries({ queryKey: classKeys.statistics() });
    },
  });
};

/**
 * Hard delete class mutation (permanent removal)
 */
export const useHardDeleteClassMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await hardDeleteClass(id);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, id) => {
      // Remove from deleted classes cache
      queryClient.invalidateQueries({ queryKey: classKeys.deleted() });

      // Remove from all caches
      queryClient.removeQueries({ queryKey: classKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: classKeys.statistics() });
    },
  });
};

// ===== ENTRY SOFT DELETE HOOKS =====

/**
 * Get deleted entries query
 */
export const useDeletedEntriesQuery = () => {
  return useQuery({
    queryKey: entryKeys.deleted(),
    queryFn: async () => {
      const { data, error } = await getDeletedEntries();
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
};

/**
 * Restore entry mutation
 */
export const useRestoreEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, restoredBy }: { id: string; restoredBy?: string }) => {
      const { data, error } = await restoreEntry(id, restoredBy);
      if (error) throw error;
      return data;
    },
    onSuccess: restoredEntry => {
      if (restoredEntry?.class_id) {
        entryInvalidationKeys({
          classId: restoredEntry.class_id,
          ...(restoredEntry.show_id ? { showId: restoredEntry.show_id } : {}),
          ...(restoredEntry.dog_id ? { dogId: restoredEntry.dog_id } : {}),
        }).forEach(k => queryClient.invalidateQueries({ queryKey: k }));
        queryClient.invalidateQueries({ queryKey: classKeys.detail(restoredEntry.class_id) });
      } else {
        entryInvalidationKeys({}).forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      }
    },
  });
};

/**
 * Hard delete entry mutation (permanent removal)
 */
export const useHardDeleteEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await hardDeleteEntry(id);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, id) => {
      entryInvalidationKeys({}).forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      queryClient.removeQueries({ queryKey: entryKeys.detail(id) });
    },
  });
};
