import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '../../../utils/logger';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import { useTrialInfo, useClasses, classListKeys } from './useClassListFetch';
import type { ClassEntry } from './useClassListFetch';

// Re-export types and query keys so existing imports continue to work
export type { ClassEntry, TrialInfo, ClassListData } from './useClassListFetch';
export { classListKeys, useTrialInfo, useClasses } from './useClassListFetch';

// Stable empty array to prevent infinite re-renders when data is undefined
// See: ClassList.tsx useEffect syncs this to local state - new [] reference = infinite loop
const EMPTY_CLASSES: ClassEntry[] = [];

export function useClassListData(
  trialId: string | undefined,
  showId: string | number | undefined,
  licenseKey: string | undefined
) {
  const queryClient = useQueryClient();
  const trialInfoQuery = useTrialInfo(trialId, showId, licenseKey);
  const classesQuery = useClasses(trialId, licenseKey);

  // Subscribe to replication table changes to invalidate React Query cache
  // CRITICAL: This ensures UI updates when background syncAll() completes
  // Without this, React Query serves stale cached data even though IndexedDB is updated
  useEffect(() => {
    let unsubscribeClasses: (() => void) | undefined;
    let unsubscribeEntries: (() => void) | undefined;
    let isMounted = true;
    // Track if we've done the initial callback for each subscription
    // subscribe() immediately calls back with current data - we need to skip that
    let classesInitialDone = false;
    let entriesInitialDone = false;
    // Debounce invalidation to coalesce rapid notifications (leading + trailing edge)
    let invalidationTimeout: ReturnType<typeof setTimeout> | null = null;
    const INVALIDATION_DEBOUNCE_MS = 500;

    const setupSubscriptions = async () => {
      try {
        const manager = await ensureReplicationManager();
        const classesTable = manager.getTable('classes');
        const entriesTable = manager.getTable('entries');

        if (!classesTable || !entriesTable || !isMounted) return;

        // Debounced invalidation function - coalesces rapid notifications
        const debouncedInvalidate = (includeTrialInfo: boolean = false) => {
          if (!isMounted || !trialId) return;
          // Clear any pending invalidation
          if (invalidationTimeout) {
            clearTimeout(invalidationTimeout);
          }
          // Schedule invalidation after debounce period
          invalidationTimeout = setTimeout(() => {
            if (!isMounted || !trialId) return;
            logger.log('🔄 Invalidating class list queries after debounce');
            queryClient.invalidateQueries({ queryKey: classListKeys.classes(trialId) });
            if (includeTrialInfo) {
              queryClient.invalidateQueries({ queryKey: classListKeys.trialInfo(trialId) });
            }
          }, INVALIDATION_DEBOUNCE_MS);
        };

        // Subscribe to classes table changes
        unsubscribeClasses = classesTable.subscribe(() => {
          // Skip the immediate callback that subscribe() triggers
          if (!classesInitialDone) {
            classesInitialDone = true;
            return;
          }
          debouncedInvalidate(true); // Include trial info for class changes
        });

        // Subscribe to entries table changes (affects entry counts on class cards)
        unsubscribeEntries = entriesTable.subscribe(() => {
          // Skip the immediate callback that subscribe() triggers
          if (!entriesInitialDone) {
            entriesInitialDone = true;
            return;
          }
          debouncedInvalidate(false); // Only classes for entry changes
        });

        logger.log('✅ ClassList replication subscriptions ready');
      } catch (error) {
        logger.error('❌ Error setting up class list replication subscriptions:', error);
      }
    };

    setupSubscriptions();

    return () => {
      isMounted = false;
      if (invalidationTimeout) clearTimeout(invalidationTimeout);
      if (unsubscribeClasses) unsubscribeClasses();
      if (unsubscribeEntries) unsubscribeEntries();
    };
  }, [queryClient, trialId]);

  return {
    trialInfo: trialInfoQuery.data || null,
    // Use stable empty array to prevent infinite re-renders
    classes: classesQuery.data || EMPTY_CLASSES,
    isLoading: trialInfoQuery.isLoading || classesQuery.isLoading,
    isRefreshing: trialInfoQuery.isFetching || classesQuery.isFetching,
    error: trialInfoQuery.error || classesQuery.error,
    // refetch with optional forceSync to pull fresh data from server first
    refetch: async (forceSync: boolean = false) => {
      // If forceSync, sync from server before refetching from cache
      if (forceSync && licenseKey) {
        try {
          logger.log('🔄 Force sync requested - syncing classes and entries from server...');
          const manager = await ensureReplicationManager();
          await Promise.all([
            manager.syncTable('classes', { licenseKey }),
            manager.syncTable('entries', { licenseKey }),
          ]);
          logger.log('✅ Force sync complete');
        } catch (syncError) {
          // Sync failed (likely offline) - continue with cached data
          logger.warn('⚠️ Sync failed (offline?), using cached data:', syncError);
        }
      }
      // Now refetch from cache (which is now updated if sync succeeded)
      trialInfoQuery.refetch();
      classesQuery.refetch();
    },
  };
}
