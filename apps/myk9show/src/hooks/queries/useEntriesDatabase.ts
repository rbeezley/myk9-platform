// React Query hooks for database entry operations
// Entry Store Integration - React Query Implementation
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { EntryStatus } from '@/types/entry-lifecycle';
import {
  getAllEntries,
  getEntryById,
  getEntriesByShow,
  getPublicEntriesByShow,
  getEntriesByClass,
  getPublicEntriesByClass,
  getEntriesByDog,
  countActiveEntriesByDog,
  countBlockingEntriesByDog,
  getEntriesByStatus,
  getEntriesForShow,
  createEntry,
  updateEntry,
  deleteEntry,
  updateEntryStatusWithAudit,
  createMultipleEntries,
  getEntryStatistics,
  searchEntries,
} from '@/services/database/entries';
import type { SecretaryEntry } from '@/services/database/entries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { entryInvalidationKeys } from '@/services/database/entries/invalidation';
import { useAuthContext } from '@/hooks/useAuthContext';
import type { DbEntryInsert, DbEntryUpdate } from '@/types/database-mappings';

// Get all entries with related data
export const useEntriesQuery = () => {
  const { user, loading } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.entries,
    queryFn: async () => {
      const { data, error } = await getAllEntries();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(user && user.is_anonymous !== true) && !loading,
    ...cacheStrategies.moderate, // 5 minutes stale, 10 minutes cache
  });
};

// Get entry by ID with full details
export const useEntryQuery = (id: string, enabled = true) => {
  const { user, loading } = useAuthContext();

  return useQuery({
    queryKey: queryKeys.entry(id),
    queryFn: async () => {
      const { data, error } = await getEntryById(id);
      if (error) throw error;
      return data;
    },
    enabled: !!id && enabled && Boolean(user && user.is_anonymous !== true) && !loading,
    ...cacheStrategies.moderate,
  });
};

// Get entries by show ID
export const useEntriesByShowQuery = (showId: string, enabled = true) => {
  // Public show + styled-landing pages render this for logged-out visitors, who
  // no longer hold a broad SELECT on `entries`. Route anon through the
  // cascade-gated public view (safe columns only); authenticated callers keep
  // the full replication-backed read.
  const { user, loading } = useAuthContext();
  const isAnon = !user || user.is_anonymous === true;

  return useQuery({
    queryKey: [...queryKeys.showEntries(showId), isAnon ? 'public' : 'auth'],
    queryFn: async () => {
      if (isAnon) {
        const { data } = await getPublicEntriesByShow(showId);
        return data as unknown as Awaited<ReturnType<typeof getEntriesByShow>>['data'];
      }
      const { data, error } = await getEntriesByShow(showId);
      if (error) throw error;
      return data;
    },
    enabled: !!showId && enabled && !loading,
    ...cacheStrategies.moderate,
  });
};

/**
 * Authenticated show read that preserves replica freshness for workflows where
 * a cached count would produce an unsafe decision.
 */
export const useVerifiedEntriesByShowQuery = (showId: string, enabled = true) => {
  const { user, loading } = useAuthContext();

  return useQuery({
    queryKey: [...queryKeys.showEntries(showId), 'verified'],
    queryFn: async () => {
      const result = await getEntriesByShow(showId);
      if (result.error) throw result.error;
      return { data: result.data, verified: result.verified };
    },
    enabled: !!showId && enabled && Boolean(user && user.is_anonymous !== true) && !loading,
    ...cacheStrategies.moderate,
  });
};

/**
 * Canonical staff read for show-scoped entry work.
 *
 * Show Desk, Class Details, Class Management, and Entry Management must share
 * this cache identity so a cold per-show replica cannot look populated on one
 * surface and confidently empty on another.
 */
export const useSecretaryShowEntriesQuery = (showId: string, enabled = true) =>
  useQuery<SecretaryEntry[]>({
    queryKey: queryKeys.showEntries(showId),
    queryFn: async () => {
      const { data, error } = await getEntriesForShow(showId);
      if (error) throw error;
      // The service normalizes both replication and PostgREST rows to the
      // SecretaryEntry contract; Supabase's nested relation inference cannot
      // express that normalized union at this boundary.
      return (data ?? []) as unknown as SecretaryEntry[];
    },
    enabled: Boolean(showId) && enabled,
    ...cacheStrategies.dynamic,
  });

// Get entries by class ID
export const useEntriesByClassQuery = (classId: string, enabled = true) => {
  // Public class page renders this for logged-out visitors, who no longer hold
  // a broad SELECT on `entries`. Route anon through the cascade-gated public
  // view (safe columns only); authenticated callers keep the full read. Mirrors
  // useEntriesByShowQuery and useClassEntriesRaw.
  const { user, loading } = useAuthContext();
  const isAnon = !user || user.is_anonymous === true;

  return useQuery({
    queryKey: [...queryKeys.classEntries(classId), isAnon ? 'public' : 'auth'],
    queryFn: async () => {
      if (isAnon) {
        const { data } = await getPublicEntriesByClass(classId);
        return data as unknown as Awaited<ReturnType<typeof getEntriesByClass>>['data'];
      }
      const { data, error } = await getEntriesByClass(classId);
      if (error) throw error;
      return data;
    },
    enabled: !!classId && enabled && !loading,
    ...cacheStrategies.moderate,
  });
};

// Get entries by dog ID
// Returns `{ rows, verified }` rather than a bare array: a dog's entries span
// many per-show replication scopes, so an offline result is only ever a lower
// bound. `verified` says whether the rows came from the authoritative online
// read, which is the only way a consumer can tell "this dog has nothing" from
// "we could not find out" (MYK9-121).
export const useEntriesByDogQuery = (dogId: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.dogEntries(dogId),
    queryFn: async () => {
      const { data, error, verified } = await getEntriesByDog(dogId);
      if (error) throw error;
      return { rows: data, verified };
    },
    enabled: !!dogId && enabled,
    ...cacheStrategies.moderate,
  });
};

/**
 * Cache keys for the two delete-dialog counts (MYK9-600).
 *
 * Exported and used by the hooks below rather than spelled inline, so a test
 * can pin the SHAPE. Both must stay rooted at `queryKeys.dogEntries(dogId)`:
 * React Query invalidates by key prefix, and `entryInvalidationKeys({ dogId })`
 * emits exactly that prefix, so re-rooting either key anywhere else silently
 * strands the count behind every entry write that routes through it. Nothing
 * else in the app would notice.
 */
export const dogActiveEntryCountKey = (dogId: string) =>
  [...queryKeys.dogEntries(dogId), 'active-count'] as const;

export const dogBlockingEntryCountKey = (dogId: string) =>
  [...queryKeys.dogEntries(dogId), 'blocking-count'] as const;

/**
 * Freshness for both counts (MYK9-600).
 *
 * NOT `cacheStrategies.moderate`. These are money-and-results facts — a refund
 * issued a minute ago, or a score just cleared, flips them — and they feed a
 * dialog that decides whether a destructive button is pressable and what it
 * claims will be destroyed. A five-minute stale window let the dialog
 * confidently describe a state the database had already left.
 *
 * `staleTime: 0` is what actually does the work in the app's flow: `DogDialogs`
 * keeps the observer mounted and toggles `enabled`, so a second open of the
 * dialog is an ENABLE transition, not a remount, and React Query refetches an
 * enabled-and-stale query. `refetchOnMount: 'always'` covers the remount path a
 * different caller might take; `gcTime: 0` keeps no number around to be shown
 * before the refetch resolves.
 */
const DELETE_DIALOG_COUNT_FRESHNESS = {
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: 'always',
} as const;

// Count a dog's live entries — drives the delete-dog confirmation warning.
// Direct count (see countActiveEntriesByDog), gated by `enabled` so it only
// fires when the confirmation dialog is open.
export const useDogActiveEntryCountQuery = (dogId: string, enabled = true) => {
  return useQuery({
    queryKey: dogActiveEntryCountKey(dogId),
    queryFn: () => countActiveEntriesByDog(dogId),
    enabled: !!dogId && enabled,
    ...DELETE_DIALOG_COUNT_FRESHNESS,
  });
};

// Count the dog's entries that would make soft_delete_dog refuse (MK002), so the
// confirmation can say so up front instead of letting the user click Delete into
// a server error. Gated by `enabled` like the active count beside it.
export const useDogBlockingEntryCountQuery = (dogId: string, enabled = true) => {
  return useQuery({
    queryKey: dogBlockingEntryCountKey(dogId),
    queryFn: () => countBlockingEntriesByDog(dogId),
    enabled: !!dogId && enabled,
    ...DELETE_DIALOG_COUNT_FRESHNESS,
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
    onSettled: (_data, _error, variables) => {
      entryInvalidationKeys({
        ...(variables.show_id ? { showId: variables.show_id } : {}),
        ...(variables.class_id ? { classId: variables.class_id } : {}),
        ...(variables.dog_id ? { dogId: variables.dog_id } : {}),
      }).forEach(k => queryClient.invalidateQueries({ queryKey: k }));
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
    onSettled: (data, _error, { id }) => {
      entryInvalidationKeys({
        entryId: id,
        ...(data?.show_id ? { showId: data.show_id } : {}),
        ...(data?.class_id ? { classId: data.class_id } : {}),
        ...(data?.dog_id ? { dogId: data.dog_id } : {}),
      }).forEach(k => queryClient.invalidateQueries({ queryKey: k }));
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

      // Capture show/class/dog context before optimistic removal
      const deletedEntry = (previousEntries as Array<Record<string, unknown>> | undefined)?.find(
        e => e.id === id
      );

      // Optimistically remove from entries list
      queryClient.setQueryData(queryKeys.entries, (old: Array<Record<string, unknown>>) =>
        old ? old.filter(entry => entry.id !== id) : []
      );

      // Remove individual entry cache
      queryClient.removeQueries({ queryKey: queryKeys.entry(id) });

      return {
        previousEntries,
        showId: deletedEntry?.show_id as string | undefined,
        classId: deletedEntry?.class_id as string | undefined,
        dogId: deletedEntry?.dog_id as string | undefined,
      };
    },
    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        queryClient.setQueryData(queryKeys.entries, context.previousEntries);
      }
    },
    onSettled: (_data, _error, _id, context) => {
      entryInvalidationKeys({
        ...(context?.showId ? { showId: context.showId } : {}),
        ...(context?.classId ? { classId: context.classId } : {}),
        ...(context?.dogId ? { dogId: context.dogId } : {}),
      }).forEach(k => queryClient.invalidateQueries({ queryKey: k }));
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
      const { data, error } = await updateEntryStatusWithAudit(params);
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
    onSettled: (data, _error, { id }) => {
      entryInvalidationKeys({
        entryId: id,
        ...(data?.show_id ? { showId: data.show_id } : {}),
        ...(data?.class_id ? { classId: data.class_id } : {}),
      }).forEach(k => queryClient.invalidateQueries({ queryKey: k }));
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
    onSettled: (_data, _error, variables) => {
      entryInvalidationKeys({}).forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      const uniqueShowIds = [
        ...new Set(variables.map(e => e.show_id).filter((id): id is string => !!id)),
      ];
      uniqueShowIds.forEach(showId =>
        entryInvalidationKeys({ showId }).forEach(k =>
          queryClient.invalidateQueries({ queryKey: k })
        )
      );
      const uniqueClassIds = [
        ...new Set(variables.map(e => e.class_id).filter((id): id is string => !!id)),
      ];
      uniqueClassIds.forEach(classId =>
        entryInvalidationKeys({ classId }).forEach(k =>
          queryClient.invalidateQueries({ queryKey: k })
        )
      );
    },
  });
};
