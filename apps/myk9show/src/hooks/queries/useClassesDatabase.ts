// React Query hooks for Class database operations - Phase 2.5: Class Store Integration
// Provides type-safe, cached database operations for classes and entries

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// TODO: migrate to @/services/database/entries once getEntriesByClassId and
// 2-arg mutation signatures are reconciled with the canonical entry functions.
import {
  getAllClasses,
  getClassById,
  getClassesByTrialId,
  createClass,
  updateClass,
  deleteClass,
  hardDeleteClass,
  restoreClass,
  getDeletedClasses,
  searchClasses,
  getClassStatistics,
} from '@/services/database/classes';
// TODO: migrate to @/services/database/entries once getEntriesByClassId and
// 2-arg mutation signatures are reconciled with the canonical entry functions.
import {
  getAllEntries,
  getEntriesByClassId,
  createEntry,
  updateEntry,
  deleteEntry,
  hardDeleteEntry,
  restoreEntry,
  getDeletedEntries,
} from '@/services/database/queries/classQueries';
import type { DbClassInsert, DbClassUpdate, DbEntryInsert, DbEntryUpdate } from '@/types/database-mappings';

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
export const useClassesByTrialQuery = (trialId: string, enabled = true) => {
  return useQuery({
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
  return useQuery({
    queryKey: entryKeys.lists(),
    queryFn: async () => {
      const { data, error } = await getAllEntries();
      if (error) throw error;
      return data;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes - entry data changes frequently
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
};

/**
 * Get entries by class ID
 */
export const useEntriesByClassQuery = (classId: string, enabled = true) => {
  return useQuery({
    queryKey: entryKeys.byClass(classId),
    queryFn: async () => {
      const { data, error } = await getEntriesByClassId(classId);
      if (error) throw error;
      return data;
    },
    enabled: enabled && !!classId,
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
    onSuccess: (newClass) => {
      // Invalidate and refetch class lists
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      
      // Add the new class to trial-specific cache if trial_id exists
      if (newClass?.trial_id) {
        queryClient.invalidateQueries({ queryKey: classKeys.byTrial(newClass.trial_id) });
      }
      
      // Update statistics
      queryClient.invalidateQueries({ queryKey: classKeys.statistics() });
      
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

/**
 * Delete a class (soft delete)
 */
export const useDeleteClassMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, deletedBy }: { id: string; deletedBy?: string }) => {
      const { data, error } = await deleteClass(id, deletedBy);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, { id }) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: classKeys.detail(id) });
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      queryClient.invalidateQueries({ queryKey: classKeys.statistics() });
      
      // Invalidate trial-specific caches (we don't know which trial, so invalidate all)
      queryClient.invalidateQueries({ queryKey: [...classKeys.all, 'trial'] });
      
      // Invalidate entries for this class
      queryClient.invalidateQueries({ queryKey: entryKeys.byClass(id) });
    },
  });
};

// ===== ENTRY MUTATIONS =====

/**
 * Create a new entry
 */
export const useCreateEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryData: DbEntryInsert) => {
      const { data, error } = await createEntry(entryData);
      if (error) throw error;
      return data;
    },
    onSuccess: (newEntry) => {
      // Invalidate entry lists
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
      
      // Invalidate class-specific entries
      if (newEntry?.class_id) {
        queryClient.invalidateQueries({ queryKey: entryKeys.byClass(newEntry.class_id) });
        
        // Also invalidate the class details to update entry count
        queryClient.invalidateQueries({ queryKey: classKeys.detail(newEntry.class_id) });
      }
    },
  });
};

/**
 * Update an entry
 */
export const useUpdateEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DbEntryUpdate }) => {
      const { data, error } = await updateEntry(id, updates);
      if (error) throw error;
      return data;
    },
    onSuccess: (updatedEntry) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
      
      // Invalidate class-specific entries if class changed
      if (updatedEntry?.class_id) {
        queryClient.invalidateQueries({ queryKey: entryKeys.byClass(updatedEntry.class_id) });
        
        // Update class details to reflect entry changes
        queryClient.invalidateQueries({ queryKey: classKeys.detail(updatedEntry.class_id) });
      }
    },
  });
};

/**
 * Delete an entry
 */
export const useDeleteEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, deletedBy }: { id: string; deletedBy?: string }) => {
      // Get the entry first to know which class to update
      const entryData = queryClient.getQueriesData({ queryKey: entryKeys.all });
      let classId: string | null = null;
      
      // Find the class_id from cached data
      for (const [, data] of entryData) {
        if (Array.isArray(data)) {
          const entry = data.find((e: unknown) => (e as { id: string }).id === id);
          if ((entry as { id: string; class_id?: string }).class_id) {
            classId = entry.class_id;
            break;
          }
        }
      }
      
      const { data, error } = await deleteEntry(id, deletedBy);
      if (error) throw error;
      return { data, classId };
    },
    onSuccess: ({ classId }) => {
      // Invalidate entry lists
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
      
      // Invalidate class-specific entries if we know the class
      if (classId) {
        queryClient.invalidateQueries({ queryKey: entryKeys.byClass(classId) });
        
        // Update class details to reflect entry count change
        queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });
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
    onSuccess: (restoredEntry) => {
      // Add back to the main entries list
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });

      // Update any class-specific caches if we know the class
      if (restoredEntry?.class_id) {
        queryClient.invalidateQueries({ queryKey: entryKeys.byClass(restoredEntry.class_id) });
        queryClient.invalidateQueries({ queryKey: classKeys.detail(restoredEntry.class_id) });
      }

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: entryKeys.deleted() });
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
      // Remove from deleted entries cache
      queryClient.invalidateQueries({ queryKey: entryKeys.deleted() });

      // Remove from all caches
      queryClient.removeQueries({ queryKey: entryKeys.detail(id) });
    },
  });
};