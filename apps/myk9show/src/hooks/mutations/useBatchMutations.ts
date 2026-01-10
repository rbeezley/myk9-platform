// Enhanced Batch Mutations - Phase 2.7: Production Enhancements
// React Query hooks for batch operations with optimistic updates

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  batchCreateDogs, 
  batchUpdateDogs, 
  batchDeleteDogs,
  batchCreateUsers,
  batchUpdateUsers,
  batchCreateShows,
  batchCreateClasses,
  batchCreateEntries,
  batchUpdateEntryStatuses,
  getBatchSummary,
  type BatchOperationOptions
} from '@/services/database/batchOperations';
import type { 
  DbDogInsert, DbDogUpdate,
  DbUserInsert, DbUserUpdate,
  DbShowInsert,
  DbClassInsert,
  DbEntryInsert
} from '@/types/database-mappings';

// Import query keys from queryClient
import { queryKeys } from '@/lib/queryClient';
import { classKeys, entryKeys } from '@/hooks/queries/useClassesDatabase';

// ===== DOG BATCH MUTATIONS =====

/**
 * Batch create multiple dogs with optimistic updates
 */
export const useBatchCreateDogsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      dogsData, 
      options 
    }: { 
      dogsData: DbDogInsert[]; 
      options?: BatchOperationOptions;
    }) => {
      const results = await batchCreateDogs(dogsData, options);
      return { results, summary: getBatchSummary(results) };
    },
    onSuccess: ({ results, summary }) => {
      // Invalidate dog lists to refresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
      
      // Add successful dogs to cache
      results.forEach((result) => {
        if (result.success && result.data) {
          const dogData = result.data as { id: string };
          if (dogData.id) {
            queryClient.setQueryData(queryKeys.dog(dogData.id), result.data);
          }
        }
      });

      void summary; // Summary available for future logging/metrics
    },
    onError: () => {
      // Error handled by React Query
    }
  });
};

/**
 * Batch update multiple dogs with optimistic updates
 */
export const useBatchUpdateDogsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      updates, 
      options 
    }: { 
      updates: Array<{ id: string; updates: DbDogUpdate }>; 
      options?: BatchOperationOptions;
    }) => {
      const results = await batchUpdateDogs(updates, options);
      return { results, summary: getBatchSummary(results) };
    },
    onMutate: async ({ updates }) => {
      // Optimistic updates
      const previousData: Record<string, unknown> = {};
      
      updates.forEach(({ id, updates: updateData }) => {
        const queryKey = queryKeys.dog(id);
        const previousDog = queryClient.getQueryData(queryKey);
        
        if (previousDog) {
          previousData[id] = previousDog;
          queryClient.setQueryData(queryKey, {
            ...(previousDog as Record<string, unknown>),
            ...updateData,
            updated_at: new Date().toISOString()
          });
        }
      });

      return { previousData };
    },
    onSuccess: ({ results, summary }) => {
      // Update cache with actual results
      results.forEach((result) => {
        if (result.success && result.data) {
          const dogData = result.data as { id: string };
          if (dogData.id) {
            queryClient.setQueryData(queryKeys.dog(dogData.id), result.data);
          }
        }
      });

      // Invalidate lists to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.dogs });

      void summary; // Summary available for future logging/metrics
    },
    onError: (_error, { updates }, context) => {
      // Rollback optimistic updates on error
      if (context?.previousData) {
        updates.forEach(({ id }) => {
          if (context.previousData[id]) {
            queryClient.setQueryData(queryKeys.dog(id), context.previousData[id]);
          }
        });
      }
      // Error handled by React Query
    }
  });
};

/**
 * Batch delete multiple dogs with optimistic updates
 */
export const useBatchDeleteDogsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      ids, 
      options 
    }: { 
      ids: string[]; 
      options?: BatchOperationOptions;
    }) => {
      const results = await batchDeleteDogs(ids, options);
      return { results, summary: getBatchSummary(results) };
    },
    onMutate: async ({ ids }) => {
      // Optimistic removal from cache
      const previousData: Record<string, unknown> = {};
      
      ids.forEach(id => {
        const queryKey = queryKeys.dog(id);
        const previousDog = queryClient.getQueryData(queryKey);
        
        if (previousDog) {
          previousData[id] = previousDog;
          queryClient.removeQueries({ queryKey });
        }
      });

      return { previousData };
    },
    onSuccess: ({ summary }) => {
      // Invalidate lists to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.dogs });

      void summary; // Summary available for future logging/metrics
    },
    onError: (_error, { ids }, context) => {
      // Restore optimistically deleted dogs on error
      if (context?.previousData) {
        ids.forEach(id => {
          if (context.previousData[id]) {
            queryClient.setQueryData(queryKeys.dog(id), context.previousData[id]);
          }
        });
      }
      // Error handled by React Query
    }
  });
};

// ===== USER BATCH MUTATIONS =====

/**
 * Batch create multiple users
 */
export const useBatchCreateUsersMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      usersData, 
      options 
    }: { 
      usersData: DbUserInsert[]; 
      options?: BatchOperationOptions;
    }) => {
      const results = await batchCreateUsers(usersData, options);
      return { results, summary: getBatchSummary(results) };
    },
    onSuccess: ({ results, summary }) => {
      // Invalidate user lists
      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() });
      
      // Add successful users to cache
      results.forEach((result) => {
        if (result.success && result.data) {
          const userData = result.data as { id: string };
          if (userData.id) {
            queryClient.setQueryData(queryKeys.users.detail(userData.id), result.data);
          }
        }
      });

      void summary; // Summary available for future logging/metrics
    }
  });
};

/**
 * Batch update multiple users
 */
export const useBatchUpdateUsersMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      updates, 
      options 
    }: { 
      updates: Array<{ id: string; updates: DbUserUpdate }>; 
      options?: BatchOperationOptions;
    }) => {
      const results = await batchUpdateUsers(updates, options);
      return { results, summary: getBatchSummary(results) };
    },
    onSuccess: ({ results, summary }) => {
      // Update cache and invalidate lists
      results.forEach((result) => {
        if (result.success && result.data) {
          const userData = result.data as { id: string };
          if (userData.id) {
            queryClient.setQueryData(queryKeys.users.detail(userData.id), result.data);
          }
        }
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.users.lists() });

      void summary; // Summary available for future logging/metrics
    }
  });
};

// ===== SHOW BATCH MUTATIONS =====

/**
 * Batch create multiple shows
 */
export const useBatchCreateShowsMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      showsData, 
      options 
    }: { 
      showsData: DbShowInsert[]; 
      options?: BatchOperationOptions;
    }) => {
      const results = await batchCreateShows(showsData, options);
      return { results, summary: getBatchSummary(results) };
    },
    onSuccess: ({ results, summary }) => {
      // Invalidate show lists
      queryClient.invalidateQueries({ queryKey: queryKeys.shows });
      
      // Also invalidate club-specific show lists
      results.forEach((result) => {
        if (result.success && result.data) {
          const showData = result.data as { id: string; club_id?: string };
          if (showData.id) {
            queryClient.setQueryData(queryKeys.show(showData.id), result.data);
            
            if (showData.club_id) {
              queryClient.invalidateQueries({ queryKey: queryKeys.showsByClub(showData.club_id) });
            }
          }
        }
      });

      void summary; // Summary available for future logging/metrics
    }
  });
};

// ===== CLASS BATCH MUTATIONS =====

/**
 * Batch create multiple classes (useful for show setup)
 */
export const useBatchCreateClassesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      classesData, 
      options 
    }: { 
      classesData: DbClassInsert[]; 
      options?: BatchOperationOptions;
    }) => {
      const results = await batchCreateClasses(classesData, options);
      return { results, summary: getBatchSummary(results) };
    },
    onSuccess: ({ results, summary }) => {
      // Invalidate class lists
      queryClient.invalidateQueries({ queryKey: classKeys.lists() });
      queryClient.invalidateQueries({ queryKey: classKeys.statistics() });
      
      // Invalidate trial-specific caches
      results.forEach((result) => {
        if (result.success && result.data) {
          const classData = result.data as { id: string; trial_id?: string };
          if (classData.id) {
            queryClient.setQueryData(classKeys.detail(classData.id), result.data);
            
            if (classData.trial_id) {
              queryClient.invalidateQueries({ queryKey: classKeys.byTrial(classData.trial_id) });
            }
          }
        }
      });

      void summary; // Summary available for future logging/metrics
    }
  });
};

// ===== ENTRY BATCH MUTATIONS =====

/**
 * Batch create multiple entries (useful for registration)
 */
export const useBatchCreateEntriesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      entriesData, 
      options 
    }: { 
      entriesData: DbEntryInsert[]; 
      options?: BatchOperationOptions;
    }) => {
      const results = await batchCreateEntries(entriesData, options);
      return { results, summary: getBatchSummary(results) };
    },
    onSuccess: ({ results, summary }) => {
      // Invalidate entry lists
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
      
      // Invalidate class-specific entries
      results.forEach((result) => {
        if (result.success && result.data) {
          const entryData = result.data as { class_id?: string };
          if (entryData.class_id) {
            queryClient.invalidateQueries({ queryKey: entryKeys.byClass(entryData.class_id) });
            queryClient.invalidateQueries({ queryKey: classKeys.detail(entryData.class_id) });
          }
        }
      });

      void summary; // Summary available for future logging/metrics
    }
  });
};

/**
 * Batch update entry statuses (common during show day)
 */
export const useBatchUpdateEntryStatusesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      updates, 
      options 
    }: { 
      updates: Array<{ id: string; status: string; score?: string; time?: number; placement?: string }>; 
      options?: BatchOperationOptions;
    }) => {
      const results = await batchUpdateEntryStatuses(updates, options);
      return { results, summary: getBatchSummary(results) };
    },
    onSuccess: ({ results, summary }) => {
      // Invalidate entry lists and affected classes
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() });
      
      // Get affected class IDs and invalidate their caches
      const affectedClassIds = new Set<string>();
      results.forEach((result) => {
        if (result.success && result.data) {
          const entryData = result.data as { class_id?: string };
          if (entryData.class_id) {
            affectedClassIds.add(entryData.class_id);
          }
        }
      });
      
      affectedClassIds.forEach(classId => {
        queryClient.invalidateQueries({ queryKey: entryKeys.byClass(classId) });
        queryClient.invalidateQueries({ queryKey: classKeys.detail(classId) });
      });

      void summary; // Summary available for future logging/metrics
    }
  });
};

// ===== UTILITY HOOK =====

/**
 * Hook to get batch operation utilities
 */
export const useBatchOperations = () => {
  return {
    // Dog operations
    batchCreateDogs: useBatchCreateDogsMutation(),
    batchUpdateDogs: useBatchUpdateDogsMutation(),
    batchDeleteDogs: useBatchDeleteDogsMutation(),
    
    // User operations
    batchCreateUsers: useBatchCreateUsersMutation(),
    batchUpdateUsers: useBatchUpdateUsersMutation(),
    
    // Show operations
    batchCreateShows: useBatchCreateShowsMutation(),
    
    // Class operations
    batchCreateClasses: useBatchCreateClassesMutation(),
    
    // Entry operations
    batchCreateEntries: useBatchCreateEntriesMutation(),
    batchUpdateEntryStatuses: useBatchUpdateEntryStatusesMutation(),
  };
};