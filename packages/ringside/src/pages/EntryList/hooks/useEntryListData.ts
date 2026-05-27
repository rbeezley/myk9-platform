/**
 * useEntryListData — Entry list data fetching hook (PR E2b).
 *
 * Moved from apps/myk9q with the host's app-singleton calls lifted out
 * into the injected `EntryListDataDependencies` shape. The host's shim
 * at apps/myk9q/src/pages/EntryList/hooks/useEntryListData.ts binds the
 * real implementations (useAuth, ensureReplicationManager,
 * useEntryListDataHelpers fetchers) and forwards the rest of the
 * options through; existing callers in EntryList.tsx / CombinedEntryList.tsx
 * keep working unchanged.
 *
 * Uses React Query for caching + invalidation. The replication-table
 * subscription that lives in the second useEffect is what keeps the UI
 * fresh when background syncs land — the host implementation of
 * `subscribeToReplicationChanges` is responsible for plumbing that
 * pub-sub through.
 *
 * Respects drag-and-drop operations by skipping cache invalidation
 * during drags (the optional `isDraggingRef` parameter is owned by
 * useDragAndDropEntries and shared with this hook to suppress
 * snap-back).
 */

import { useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@myk9/core';
import type { UserRole } from '../../../auth/passcodes';
import type { Entry } from '../../../stores/entryStore';
import type {
  ClassInfo,
  EntryListData,
  EntryListDataDependencies,
} from '../types';

// Re-export the data-shape types for downstream consumers so they can
// import them from the package root without reaching into ./types.
export type { ClassInfo, EntryListData, EntryListDataDependencies };

// ============================================================
// QUERY KEYS (module-local — only this file invalidates them)
// ============================================================

const entryListKeys = {
  all: (classId: string) => ['entryList', classId] as const,
  combined: (classIdA: string, classIdB: string) =>
    ['entryList', 'combined', classIdA, classIdB] as const,
};

// Stable empty array to prevent infinite re-renders on the entries field.
const EMPTY_ENTRIES: Entry[] = [];

// Debounce window for coalescing replication-change notifications. Half
// a second covers most rapid-fire change bursts (e.g. a sync resolving
// dozens of rows) without making cache invalidation feel sluggish.
const INVALIDATION_DEBOUNCE_MS = 500;

export interface UseEntryListDataOptions {
  classId?: string;
  classIdA?: string;
  classIdB?: string;
  /** Ref to check if drag operation is in progress — skips auto-refresh when true. */
  isDraggingRef?: MutableRefObject<boolean>;
  /** Host-supplied capability bag. */
  dependencies: EntryListDataDependencies;
}

/**
 * Shared hook for fetching and caching entry list data using React Query.
 * Supports both single class and combined class views.
 * Respects drag-and-drop operations by skipping cache invalidation during drags.
 */
export const useEntryListData = ({
  classId,
  classIdA,
  classIdB,
  isDraggingRef,
  dependencies,
}: UseEntryListDataOptions) => {
  const queryClient = useQueryClient();

  const { auth, fetchSingleClass, fetchCombinedClasses, forceSyncEntriesAndClasses, subscribeToReplicationChanges } = dependencies;

  const isCombinedView = !!(classIdA && classIdB);
  const licenseKey = auth.showContext?.licenseKey;
  const userRole: UserRole = (auth.role as UserRole) || 'exhibitor';

  // Track if we're currently doing a force sync to prevent concurrent syncs.
  const isSyncingRef = useRef(false);

  // Query key depends on view type.
  const queryKey = isCombinedView
    ? entryListKeys.combined(classIdA!, classIdB!)
    : entryListKeys.all(classId || '');

  // Single class fetch wrapper — pulls licenseKey from auth and applies
  // the empty-state contract when arguments are missing.
  const runSingleFetch = async (): Promise<EntryListData> => {
    if (!classId || !licenseKey) {
      return { entries: [], classInfo: null };
    }
    logger.log('🔄 Fetching entries via host single-class fetcher...');
    return fetchSingleClass(classId, licenseKey, userRole);
  };

  // Combined class fetch wrapper.
  const runCombinedFetch = async (): Promise<EntryListData> => {
    if (!classIdA || !classIdB || !licenseKey) {
      return { entries: [], classInfo: null };
    }
    logger.log('🔄 Fetching combined entries via host combined fetcher...');
    return fetchCombinedClasses(classIdA, classIdB, licenseKey, userRole);
  };

  // React Query for data fetching. Settings match the pre-move SUT:
  // 30s stale, 5min gc, networkMode 'always' for offline use, no retries
  // (offline failures return cached data), no auto-refetch on focus or
  // reconnect (cache subscriptions handle updates).
  const query = useQuery({
    queryKey,
    queryFn: isCombinedView ? runCombinedFetch : runSingleFetch,
    enabled: isCombinedView
      ? !!(classIdA && classIdB && licenseKey)
      : !!(classId && licenseKey),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    networkMode: 'always',
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Subscribe to replication table changes to invalidate React Query cache.
  // CRITICAL: This ensures UI updates when background syncAll() completes.
  // Also respects drag-and-drop by skipping invalidation during drags.
  useEffect(() => {
    let isMounted = true;
    let invalidationTimeout: ReturnType<typeof setTimeout> | null = null;

    // Build query key for invalidation (using current values from closure).
    const currentQueryKey = isCombinedView
      ? entryListKeys.combined(classIdA!, classIdB!)
      : entryListKeys.all(classId || '');

    // Debounced invalidation function — coalesces rapid notifications.
    const debouncedInvalidate = () => {
      if (!isMounted) return;
      // Skip invalidation during drag operations to prevent snap-back.
      if (isDraggingRef?.current) {
        logger.log('⏸️ Skipping entry list refresh during drag operation');
        return;
      }
      if (invalidationTimeout) {
        clearTimeout(invalidationTimeout);
      }
      invalidationTimeout = setTimeout(() => {
        if (!isMounted) return;
        if (isDraggingRef?.current) return;
        logger.log('🔄 Invalidating entry list query after debounce');
        queryClient.invalidateQueries({ queryKey: currentQueryKey });
      }, INVALIDATION_DEBOUNCE_MS);
    };

    // Host subscription. Host implementation owns the "skip initial
    // callback" semantics — the pre-move SUT had that logic inline; now
    // it's the host's responsibility per the DI contract.
    const unsubscribe = subscribeToReplicationChanges(debouncedInvalidate);

    return () => {
      isMounted = false;
      if (invalidationTimeout) clearTimeout(invalidationTimeout);
      unsubscribe();
    };
    // Use primitive values in deps, not queryKey array (new reference each
    // render = infinite loop). The dependencies object itself is also
    // included so re-binding (e.g. auth.showContext change) re-subscribes.
  }, [
    queryClient,
    classId,
    classIdA,
    classIdB,
    isCombinedView,
    isDraggingRef,
    subscribeToReplicationChanges,
  ]);

  // Refetch function with optional forceSync.
  // forceSync: if true, syncs with server before reading cache (for
  // user-initiated refresh).
  // CRITICAL: Wrapped in useCallback to prevent infinite loops in
  // components that use refresh as a useEffect dependency (e.g.,
  // CombinedEntryList's mount effect).
  //
  // Note: a pre-existing bug from before the move puts the whole `query`
  // object in this dep array, which means refresh isn't actually stable
  // across renders (PR #399 follow-up task tracks the fix). Preserved
  // here to keep this PR purely a move, no behavioral change.
  const refresh = useCallback(
    async (forceSync: boolean = false) => {
      if (forceSync && isSyncingRef.current) {
        logger.log('⏸️ Force sync already in progress, skipping...');
        return;
      }

      if (forceSync && licenseKey) {
        isSyncingRef.current = true;
        try {
          logger.log('🔄 Force sync requested - syncing entries and classes from server...');
          await forceSyncEntriesAndClasses(licenseKey);
          logger.log('✅ Force sync complete');
        } catch (syncError) {
          // Sync failed (likely offline) — continue with cached data.
          logger.warn('⚠️ Sync failed (offline?), using cached data:', syncError);
        } finally {
          isSyncingRef.current = false;
        }
      }

      // Refetch from cache (which is now updated if sync succeeded).
      await query.refetch();
    },
    [licenseKey, query, forceSyncEntriesAndClasses],
  );

  return {
    entries: query.data?.entries || EMPTY_ENTRIES,
    classInfo: query.data?.classInfo || null,
    isStale: query.isStale,
    isRefreshing: query.isFetching,
    fetchError: query.error as Error | null,
    refresh,
    isCombinedView,
  };
};
