// React Query hooks for database entry operations
// Entry Store Integration - React Query Implementation
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { EntryStatus } from '@/types/entry-lifecycle';
import {
  getAllEntries,
  getEntryById,
  getEntriesByShow,
  getEntriesByClass,
  getEntriesByDog,
  getEntriesByStatus,
  createEntry,
  updateEntry,
  deleteEntry,
  updateEntryStatus,
  createMultipleEntries,
  getEntryStatistics,
  searchEntries,
} from '@/services/database/queries/entryQueries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { invalidateQueries } from '@/services/database/queryClient';
import type { DbEntryInsert, DbEntryUpdate } from '@/types/database-mappings';

// Get all entries with related data
export const useEntriesQuery = () => {
  return useQuery({
    queryKey: queryKeys.entries,
    queryFn: async () => {
      const { data, error } = await getAllEntries();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.moderate, // 5 minutes stale, 10 minutes cache
  });
};

// Get entry by ID with full details
export const useEntryQuery = (id: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.entry(id),
    queryFn: async () => {
      const { data, error } = await getEntryById(id);
      if (error) throw error;
      return data;
    },
    enabled: !!id && enabled,
    ...cacheStrategies.moderate,
  });
};

// Get entries by show ID
export const useEntriesByShowQuery = (showId: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.showEntries(showId),
    queryFn: async () => {
      const { data, error } = await getEntriesByShow(showId);
      if (error) throw error;
      return data;
    },
    enabled: !!showId && enabled,
    ...cacheStrategies.moderate,
  });
};

// Get entries by class ID
export const useEntriesByClassQuery = (classId: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.classEntries(classId),
    queryFn: async () => {
      const { data, error } = await getEntriesByClass(classId);
      if (error) throw error;
      return data;
    },
    enabled: !!classId && enabled,
    ...cacheStrategies.moderate,
  });
};

// Get entries by dog ID
export const useEntriesByDogQuery = (dogId: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.dogEntries(dogId),
    queryFn: async () => {
      const { data, error } = await getEntriesByDog(dogId);
      if (error) throw error;
      return data;
    },
    enabled: !!dogId && enabled,
    ...cacheStrategies.moderate,
  });
};

// Get entries by status
export const useEntriesByStatusQuery = (status: EntryStatus, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.entriesByStatus(status),
    queryFn: async () => {
      const { data, error } = await getEntriesByStatus(status);
      if (error) throw error;
      return data;
    },
    enabled: !!status && enabled,
    ...cacheStrategies.moderate,
  });
};

// Search entries
export const useEntriesSearchQuery = (searchTerm: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.entriesSearch(searchTerm),
    queryFn: async () => {
      const { data, error } = await searchEntries(searchTerm);
      if (error) throw error;
      return data;
    },
    enabled: !!searchTerm && searchTerm.length >= 2 && enabled,
    ...cacheStrategies.dynamic, // 1 minute stale for search results
  });
};

// Get entry statistics
export const useEntryStatisticsQuery = (showId?: string) => {
  return useQuery({
    queryKey: showId ? queryKeys.showStatistics(showId) : ['entries', 'statistics'],
    queryFn: async () => {
      const { data, error } = await getEntryStatistics(showId);
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.static, // 30 minutes stale for statistics
  });
};

// Create entry mutation
export const useCreateEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entryData: DbEntryInsert) => {
      const { data, error } = await createEntry(entryData);
      if (error) throw error;
      return data;
    },
    onMutate: async newEntry => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.entries });

      // Snapshot the previous value
      const previousEntries = queryClient.getQueryData(queryKeys.entries);

      // Optimistically update to the new value
      queryClient.setQueryData(queryKeys.entries, (old: unknown[]) =>
        old
          ? [...old, { ...newEntry, id: `temp-${Date.now()}` }]
          : [{ ...newEntry, id: `temp-${Date.now()}` }]
      );

      return { previousEntries };
    },
    onError: (_err, _newEntry, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        queryClient.setQueryData(queryKeys.entries, context.previousEntries);
      }
    },
    onSettled: () => {
      // Invalidate and refetch related queries
      invalidateQueries.all('entries');
    },
  });
};

// Update entry mutation
export const useUpdateEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; updates: DbEntryUpdate }) => {
      const { data, error } = await updateEntry(params);
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.entry(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.entries });

      // Snapshot the previous values
      const previousEntry = queryClient.getQueryData(queryKeys.entry(id));
      const previousEntries = queryClient.getQueryData(queryKeys.entries);

      // Optimistically update entry
      queryClient.setQueryData(queryKeys.entry(id), (old: unknown) =>
        old
          ? {
              ...(old as Record<string, unknown>),
              ...updates,
              updated_at: new Date().toISOString(),
            }
          : null
      );

      // Optimistically update entries list
      queryClient.setQueryData(queryKeys.entries, (old: Array<Record<string, unknown>>) =>
        old
          ? old.map(entry =>
              entry.id === id
                ? { ...entry, ...updates, updated_at: new Date().toISOString() }
                : entry
            )
          : []
      );

      return { previousEntry, previousEntries };
    },
    onError: (_err, { id }, context) => {
      // Rollback on error
      if (context?.previousEntry) {
        queryClient.setQueryData(queryKeys.entry(id), context.previousEntry);
      }
      if (context?.previousEntries) {
        queryClient.setQueryData(queryKeys.entries, context.previousEntries);
      }
    },
    onSettled: (_data, _error, { id }) => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.entry(id) });
      invalidateQueries.all('entries');
    },
  });
};

// Delete entry mutation
export const useDeleteEntryMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await deleteEntry(id);
      if (error) throw error;
      return id;
    },
    onMutate: async id => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.entries });

      // Snapshot the previous value
      const previousEntries = queryClient.getQueryData(queryKeys.entries);

      // Optimistically remove from entries list
      queryClient.setQueryData(queryKeys.entries, (old: Array<Record<string, unknown>>) =>
        old ? old.filter(entry => entry.id !== id) : []
      );

      // Remove individual entry cache
      queryClient.removeQueries({ queryKey: queryKeys.entry(id) });

      return { previousEntries };
    },
    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        queryClient.setQueryData(queryKeys.entries, context.previousEntries);
      }
    },
    onSettled: () => {
      // Invalidate and refetch related queries
      invalidateQueries.all('entries');
    },
  });
};

// Update entry status mutation
export const useUpdateEntryStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      status: EntryStatus;
      userId: string;
      reason?: string;
    }) => {
      const { data, error } = await updateEntryStatus(params);
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, status }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.entry(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.entries });

      // Snapshot the previous values
      const previousEntry = queryClient.getQueryData(queryKeys.entry(id));
      const previousEntries = queryClient.getQueryData(queryKeys.entries);

      const statusUpdate = {
        status,
        updated_at: new Date().toISOString(),
      };

      // Optimistically update entry
      queryClient.setQueryData(queryKeys.entry(id), (old: unknown) =>
        old ? { ...(old as Record<string, unknown>), ...statusUpdate } : null
      );

      // Optimistically update entries list
      queryClient.setQueryData(queryKeys.entries, (old: Array<Record<string, unknown>>) =>
        old ? old.map(entry => (entry.id === id ? { ...entry, ...statusUpdate } : entry)) : []
      );

      return { previousEntry, previousEntries };
    },
    onError: (_err, { id }, context) => {
      // Rollback on error
      if (context?.previousEntry) {
        queryClient.setQueryData(queryKeys.entry(id), context.previousEntry);
      }
      if (context?.previousEntries) {
        queryClient.setQueryData(queryKeys.entries, context.previousEntries);
      }
    },
    onSettled: (_data, _error, { id }) => {
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.entry(id) });
      invalidateQueries.all('entries');
    },
  });
};

// Bulk create entries mutation
export const useCreateMultipleEntriesMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entriesData: DbEntryInsert[]) => {
      const { data, error } = await createMultipleEntries(entriesData);
      if (error) throw error;
      return data;
    },
    onMutate: async newEntries => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.entries });

      // Snapshot the previous value
      const previousEntries = queryClient.getQueryData(queryKeys.entries);

      // Optimistically update to the new value
      const tempEntries = newEntries.map((entry, index) => ({
        ...entry,
        id: `temp-bulk-${Date.now()}-${index}`,
      }));

      queryClient.setQueryData(queryKeys.entries, (old: Array<Record<string, unknown>>) =>
        old ? [...old, ...tempEntries] : tempEntries
      );

      return { previousEntries };
    },
    onError: (_err, _newEntries, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        queryClient.setQueryData(queryKeys.entries, context.previousEntries);
      }
    },
    onSettled: () => {
      // Invalidate and refetch related queries
      invalidateQueries.all('entries');
    },
  });
};
