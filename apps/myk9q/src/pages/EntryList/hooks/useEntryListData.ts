/**
 * useEntryListData - Entry list data fetching hook
 *
 * Refactored to use React Query for consistency with useClassListData.
 * Supports drag-and-drop by skipping cache invalidation during drag operations.
 */

import { useEffect, useRef, useCallback, MutableRefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../../contexts/AuthContext';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import { logger } from '@/utils/logger';
import type { UserRole } from '@/utils/auth';

// Import types and helper functions from extracted module
import type { ClassInfo, EntryListData } from './useEntryListDataHelpers';
import {
  fetchFromReplicationCache,
  fetchFromSupabase,
  fetchCombinedFromReplicationCache,
  fetchCombinedFromSupabase
} from './useEntryListDataHelpers';
import { Entry } from '@/stores/entryStore';

// Re-export types for consumers
export type { ClassInfo, EntryListData };

// ============================================================
// QUERY KEYS (centralized for easy invalidation)
// ============================================================

export const entryListKeys = {
  all: (classId: string) => ['entryList', classId] as const,
  combined: (classIdA: string, classIdB: string) => ['entryList', 'combined', classIdA, classIdB] as const,
};

// Stable empty array to prevent infinite re-renders
const EMPTY_ENTRIES: Entry[] = [];

interface UseEntryListDataOptions {
  classId?: string;
  classIdA?: string;
  classIdB?: string;
  /** Ref to check if drag operation is in progress - skips auto-refresh when true */
  isDraggingRef?: MutableRefObject<boolean>;
}

/**
 * Shared hook for fetching and caching entry list data using React Query.
 * Supports both single class and combined class views.
 * Respects drag-and-drop operations by skipping cache invalidation during drags.
 */
export const useEntryListData = ({ classId, classIdA, classIdB, isDraggingRef }: UseEntryListDataOptions) => {
  const { showContext, role } = useAuth();
  const queryClient = useQueryClient();

  const isCombinedView = !!(classIdA && classIdB);
  const licenseKey = showContext?.licenseKey;
  const userRole: UserRole = (role as UserRole) || 'exhibitor';

  // Track if we're currently doing a force sync to prevent concurrent syncs
  const isSyncingRef = useRef(false);

  // Query key depends on view type
  const queryKey = isCombinedView
    ? entryListKeys.combined(classIdA!, classIdB!)
    : entryListKeys.all(classId || '');

  // Single class fetch function
  const fetchSingleClass = async (): Promise<EntryListData> => {
    if (!classId || !licenseKey) {
      return { entries: [], classInfo: null };
    }

    logger.log('🔄 Fetching entries from replicated cache...');
    const cacheResult = await fetchFromReplicationCache(classId, licenseKey, userRole);
    if (cacheResult) {
      return cacheResult;
    }

    // Fall back to Supabase
    return fetchFromSupabase(classId, licenseKey, userRole);
  };

  // Combined class fetch function
  const fetchCombinedClasses = async (): Promise<EntryListData> => {
    if (!classIdA || !classIdB || !licenseKey) {
      return { entries: [], classInfo: null };
    }

    logger.log('🔄 Fetching combined entries from replicated cache...');
    const cacheResult = await fetchCombinedFromReplicationCache(classIdA, classIdB, licenseKey, userRole);
    if (cacheResult) {
      return cacheResult;
    }

    // Fall back to Supabase
    return fetchCombinedFromSupabase(classIdA, classIdB, licenseKey, userRole);
  };

  // Use React Query for data fetching
  const query = useQuery({
    queryKey,
    queryFn: isCombinedView ? fetchCombinedClasses : fetchSingleClass,
    enabled: isCombinedView
      ? !!(classIdA && classIdB && licenseKey)
      : !!(classId && licenseKey),
    staleTime: 30 * 1000, // 30 seconds - entries can change frequently during scoring
    gcTime: 5 * 60 * 1000, // 5 minutes cache
    networkMode: 'always', // Run query even offline, will use cached data
    retry: false, // Don't retry when offline
    refetchOnWindowFocus: false, // Disabled - cache subscriptions handle updates
    refetchOnReconnect: false, // Disabled - cache subscriptions handle updates
  });

  // Subscribe to replication table changes to invalidate React Query cache
  // CRITICAL: This ensures UI updates when background syncAll() completes
  // Also respects drag-and-drop by skipping invalidation during drags
  useEffect(() => {
    let unsubscribeEntries: (() => void) | undefined;
    let unsubscribeClasses: (() => void) | undefined;
    let isMounted = true;
    // Track if we've done the initial callback for each subscription
    // subscribe() immediately calls back with current data - we need to skip that
    let entriesInitialDone = false;
    let classesInitialDone = false;
    // Debounce invalidation to coalesce rapid notifications (leading + trailing edge)
    let invalidationTimeout: ReturnType<typeof setTimeout> | null = null;
    const INVALIDATION_DEBOUNCE_MS = 500;

    const setupSubscriptions = async () => {
      try {
        const manager = await ensureReplicationManager();
        const entriesTable = manager.getTable('entries');
        const classesTable = manager.getTable('classes');

        if (!entriesTable || !classesTable || !isMounted) return;

        // Build query key for invalidation (using current values from closure)
        const currentQueryKey = isCombinedView
          ? entryListKeys.combined(classIdA!, classIdB!)
          : entryListKeys.all(classId || '');

        // Debounced invalidation function - coalesces rapid notifications
        const debouncedInvalidate = () => {
          if (!isMounted) return;
          // Skip invalidation during drag operations to prevent snap-back
          if (isDraggingRef?.current) {
            logger.log('⏸️ Skipping entry list refresh during drag operation');
            return;
          }
          // Clear any pending invalidation
          if (invalidationTimeout) {
            clearTimeout(invalidationTimeout);
          }
          // Schedule invalidation after debounce period
          invalidationTimeout = setTimeout(() => {
            if (!isMounted) return;
            if (isDraggingRef?.current) return;
            logger.log('🔄 Invalidating entry list query after debounce');
            queryClient.invalidateQueries({ queryKey: currentQueryKey });
          }, INVALIDATION_DEBOUNCE_MS);
        };

        // Subscribe to entries table changes
        unsubscribeEntries = entriesTable.subscribe(() => {
          // Skip the immediate callback that subscribe() triggers
          if (!entriesInitialDone) {
            entriesInitialDone = true;
            return;
          }
          debouncedInvalidate();
        });

        // Subscribe to classes table changes (affects classInfo)
        unsubscribeClasses = classesTable.subscribe(() => {
          // Skip the immediate callback that subscribe() triggers
          if (!classesInitialDone) {
            classesInitialDone = true;
            return;
          }
          debouncedInvalidate();
        });

        logger.log('✅ EntryList replication subscriptions ready');
      } catch (error) {
        logger.error('❌ Error setting up entry list replication subscriptions:', error);
      }
    };

    setupSubscriptions();

    return () => {
      isMounted = false;
      if (invalidationTimeout) clearTimeout(invalidationTimeout);
      if (unsubscribeEntries) unsubscribeEntries();
      if (unsubscribeClasses) unsubscribeClasses();
    };
  // Use primitive values in deps, not queryKey array (new reference each render = infinite loop)
  }, [queryClient, classId, classIdA, classIdB, isCombinedView, isDraggingRef]);

  // Refetch function with optional forceSync
  // forceSync: if true, syncs with server before reading cache (for user-initiated refresh)
  // CRITICAL: Wrapped in useCallback to prevent infinite loops in components that use
  // refresh as a useEffect dependency (e.g., CombinedEntryList's mount effect)
  const refresh = useCallback(async (forceSync: boolean = false) => {
    // Prevent concurrent force syncs
    if (forceSync && isSyncingRef.current) {
      logger.log('⏸️ Force sync already in progress, skipping...');
      return;
    }

    if (forceSync && licenseKey) {
      isSyncingRef.current = true;
      try {
        logger.log('🔄 Force sync requested - syncing entries and classes from server...');
        const manager = await ensureReplicationManager();
        await Promise.all([
          manager.syncTable('entries', { licenseKey }),
          manager.syncTable('classes', { licenseKey }),
        ]);
        logger.log('✅ Force sync complete');
      } catch (syncError) {
        // Sync failed (likely offline) - continue with cached data
        logger.warn('⚠️ Sync failed (offline?), using cached data:', syncError);
      } finally {
        isSyncingRef.current = false;
      }
    }

    // Refetch from cache (which is now updated if sync succeeded)
    await query.refetch();
  }, [licenseKey, query]);

  return {
    entries: query.data?.entries || EMPTY_ENTRIES,
    classInfo: query.data?.classInfo || null,
    isStale: query.isStale,
    isRefreshing: query.isFetching,
    fetchError: query.error as Error | null,
    refresh,
    isCombinedView
  };
};
