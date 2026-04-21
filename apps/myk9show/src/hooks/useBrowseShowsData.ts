import { useMemo, useCallback, useEffect } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { useEntryStore, type SyncableShowEntry } from '@/store/entryStore';
import { useShowStore } from '@/store/showStore';
import { logger } from '@/services/LoggingService';
import type { Show } from '@/types/show-types';
import type { UserShowContext, ShowRelationship } from '@/types/unified-shows-types';
import { getUserShowContext, enhanceShowsWithRelationships } from '@/utils/unified-shows-config';
import { getTabQuickActions } from '@/utils/show-actions';
import { showRelationshipCache } from '@/utils/show-relationships';
import {
  showManagementTracker,
  syncShowRelationships,
  getEnhancedShowContext,
  RelationshipPerformanceMonitor,
} from '@/utils/show-management-tracking';
import { ShowPermissionValidator } from '@/utils/permissionValidation';
import { userHasEntriesForShow } from '@/utils/entryStatusUtils';

/**
 * Enhanced show with relationship metadata
 */
export interface EnhancedShow extends Show {
  relationship: ShowRelationship[];
  userCanManage: boolean;
  userIsJudging: boolean;
  userHasEntries: boolean;
  enhancedContext?: ReturnType<typeof getEnhancedShowContext>;
  userCanEdit?: boolean;
  userCanDelete?: boolean;
  userCanViewPrivateData?: boolean;
}

/**
 * Quick stats for shows summary
 */
export interface QuickStats {
  upcoming: number;
  closingSoon: number;
  userEntries: number;
}

interface UseBrowseShowsDataProps {
  filteredShows: Show[];
  selectedTab: string;
}

interface UseBrowseShowsDataReturn {
  // Auth and loading
  user: ReturnType<typeof useAuthContext>['userWithRoles'];
  isLoading: boolean;
  hasError: boolean;
  showsError: Error | null;
  entriesError: string | null;

  // Data
  shows: Show[];
  entries: SyncableShowEntry[];
  enhancedShows: EnhancedShow[];

  // Computed
  userContext: UserShowContext | null;
  tabQuickActions: ReturnType<typeof getTabQuickActions>;
  quickStats: QuickStats;

  // Actions
  handleRetry: () => Promise<void>;
  loadEntries: () => Promise<void>;
}

/**
 * Custom hook for managing browse shows data, loading, and enhancement
 * Extracted from BrowseShowsPage.tsx as part of DEBT-002 refactoring
 */
export function useBrowseShowsData({
  filteredShows,
  selectedTab,
}: UseBrowseShowsDataProps): UseBrowseShowsDataReturn {
  const { userWithRoles: user, loading: authLoading } = useAuthContext();
  const shows = useShowStore(s => s.shows);
  const showsLoading = useShowStore(s => s.isLoading);
  const storeErrorMsg = useShowStore(s => s.error);
  const showsError = storeErrorMsg ? new Error(storeErrorMsg) : null;
  const { entries, isLoading: entriesLoading, error: entriesError, loadEntries } = useEntryStore();
  const { status: syncStatus } = useReplicationSync();

  // The auth-gated initial sync only fires once authLoading flips to false
  // and a session is available, so for signed-in users there's a window where
  // the store is empty but shows haven't been downloaded yet. Treat that
  // window as loading so the skeleton stays up instead of the empty-state
  // flash that previously required a hard refresh to clear. Skip for guests
  // because sync never runs without a session — otherwise the skeleton would
  // be stuck forever.
  const showsSyncPending =
    !!user &&
    (syncStatus.tablesStatus.shows === 'idle' || syncStatus.tablesStatus.shows === 'syncing');
  const isLoading =
    authLoading || showsLoading || entriesLoading || (shows.length === 0 && showsSyncPending);
  const hasError = !!(showsError || entriesError);

  // Get user show context for filtering with caching
  const userContext = useMemo(() => {
    return getUserShowContext(user, shows, entries);
  }, [user, shows, entries]);

  // Sync show relationships when user or data changes
  useEffect(() => {
    if (user?.id && shows.length > 0) {
      const startTime = performance.now();

      // Sync relationships with the new tracking system
      syncShowRelationships(shows, user);

      // Monitor performance only in development
      if (import.meta.env.DEV) {
        const duration = performance.now() - startTime;
        RelationshipPerformanceMonitor.getInstance().recordOperation(
          'syncShowRelationships',
          duration
        );
      }

      // Clear old cache when switching users
      return () => {
        showRelationshipCache.clearUserCache(user.id);
        showManagementTracker.clearUserCache(user.id);
      };
    }
    return undefined;
  }, [user, shows]);

  // Load data on mount with enhanced tracking integration
  useEffect(() => {
    const loadData = async () => {
      try {
        const startTime = performance.now();

        await loadEntries();

        // Monitor data loading performance only in development
        if (import.meta.env.DEV) {
          const duration = performance.now() - startTime;
          RelationshipPerformanceMonitor.getInstance().recordOperation('loadInitialData', duration);
        }
      } catch (error) {
        logger.error('Failed to load data', 'shows', {}, error as Error);
      }
    };

    loadData();
  }, [loadEntries]);

  // Periodic performance monitoring (development only)
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const performanceInterval = setInterval(() => {
      const metrics = RelationshipPerformanceMonitor.getInstance().getMetrics();
      if (Object.keys(metrics).length > 0) {
        logger.debug('Relationship tracking performance', 'shows', { metrics });
      }
    }, 60000); // Log every minute

    return () => clearInterval(performanceInterval);
  }, []);

  // Enhanced shows with relationship metadata and permission filtering
  const enhancedShows = useMemo((): EnhancedShow[] => {
    // Early return for empty arrays
    if (!filteredShows || filteredShows.length === 0) {
      return [];
    }

    // First filter shows by permissions
    const permissionFilteredShows = ShowPermissionValidator.filterShows(filteredShows, user);

    // Early return if no shows remain after permission filtering
    if (permissionFilteredShows.length === 0) {
      return [];
    }

    if (!userContext) {
      return permissionFilteredShows.map(show => ({
        ...show,
        relationship: ['all' as ShowRelationship],
        userCanManage: false,
        userIsJudging: false,
        userHasEntries: false,
      }));
    }

    // Use enhanced tracking system for more detailed relationship context
    return permissionFilteredShows.map(show => {
      const enhancedContext = getEnhancedShowContext(show, user, entries);
      const baseRelationship = enhanceShowsWithRelationships([show], userContext)[0];

      return {
        ...baseRelationship,
        enhancedContext,
        userCanEdit: enhancedContext?.canEdit || false,
        userCanDelete: enhancedContext?.canDelete || false,
        userCanViewPrivateData: enhancedContext?.canViewPrivateData || false,
      };
    });
  }, [filteredShows, userContext, user, entries]);

  // Get tab quick actions
  const tabQuickActions = useMemo(() => {
    return getTabQuickActions(selectedTab, user);
  }, [selectedTab, user]);

  // Calculate quick stats for summary bar
  const quickStats = useMemo((): QuickStats => {
    const now = new Date();
    let upcoming = 0;
    let closingSoon = 0;
    let userEntries = 0;

    shows.forEach(show => {
      const showDate = new Date(show.startDate);
      const closeDate = new Date(show.entryCloseDate);

      // Upcoming shows (not yet started)
      if (showDate > now) {
        upcoming++;
      }

      // Closing soon (within 7 days)
      const daysUntilClose = Math.ceil(
        (closeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilClose >= 0 && daysUntilClose <= 7) {
        closingSoon++;
      }

      // User has entries
      if (userHasEntriesForShow(show.id, entries)) {
        userEntries++;
      }
    });

    return { upcoming, closingSoon, userEntries };
  }, [shows, entries]);

  // Error handling with retry capability and relationship sync
  const handleRetry = useCallback(async () => {
    try {
      const startTime = performance.now();

      await loadEntries();

      // Re-sync relationships after successful data reload
      if (user?.id) {
        syncShowRelationships(shows, user);
      }

      // Monitor retry performance only in development
      if (import.meta.env.DEV) {
        const duration = performance.now() - startTime;
        RelationshipPerformanceMonitor.getInstance().recordOperation('retryDataLoad', duration);
      }
    } catch (error) {
      logger.error('Retry failed', 'shows', {}, error as Error);
    }
  }, [loadEntries, user, shows]);

  return {
    user,
    isLoading,
    hasError,
    showsError: showsError || null,
    entriesError: entriesError || null,
    shows,
    entries,
    enhancedShows,
    userContext,
    tabQuickActions,
    quickStats,
    handleRetry,
    loadEntries,
  };
}
