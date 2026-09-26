import { useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  GUEST_READ_QUERY_OPTIONS,
  resolveGuestRead,
  useQueryOnlineStatus,
} from '@/hooks/guestServerRead';
import { useReplicationSync } from '@/hooks/useReplicationSync';
import { useEntryStore, type SyncableShowEntry } from '@/store/entryStore';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { getPublicShows } from '@/services/database/shows';
import { mapDatabaseShowsArray } from '@/services/mappers/showMappers';
import { logger } from '@/services/LoggingService';
import type { Show } from '@/types/show-types';
import type { UserShowContext, ShowRelationship } from '@/types/unified-shows-types';
import { getUserShowContext, enhanceShowsWithRelationships } from '@/utils/unified-shows-config';
import { useNavigate } from 'react-router-dom';
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
import { withEntryWindowTimeZones } from '@/utils/entryWindowZones';
import { mergeAccountEnteredShowStubs } from '@/utils/browseShowsUtils';
import { useAccountEnteredShowIds } from '@/hooks/queries/useAccountEnteredShowIds';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';

export const PUBLIC_SHOWS_QUERY_KEY = ['shows', 'public'] as const;

const NO_STORE_SHOWS: Show[] = [];

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
  /** A signed-out guest's online-only read cannot run: the device is offline. */
  showsOffline: boolean;
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
  const navigate = useNavigate();
  const { userWithRoles: user, loading: authLoading } = useAuthContext();
  // Signed out: no session at all. Only a session reads the replica (INTENT below).
  const isGuest = !authLoading && !user;
  const rawStoreShows = useShowStore(s => (user ? s.shows : NO_STORE_SHOWS));
  // Store shows carry no trials, so stamp each with its entry-window zone
  // from the trial store: every Browse surface (cards, table, scrubber, map,
  // filters) judges entry status in the show's own zone (MYK9-714).
  const storeTrials = useTrialStore(s => s.trials);
  const storeShows = useMemo(
    () => withEntryWindowTimeZones(rawStoreShows, storeTrials),
    [rawStoreShows, storeTrials]
  );
  const showsLoading = useShowStore(s => Boolean(user) && s.isLoading);

  // INTENT: MYK9-780, same owner decision as MYK9-747/768: public, signed-out
  // surfaces read online and never read the shared replica. The shows
  // replica holds whatever an earlier signed-in session on this device could
  // see (a secretary's drafts, shows soft-deleted on the server since), so a
  // guest's list and its stats are shows_select's answer for anon, never a
  // cached row, not even offline or after a failed read (guestServerRead.ts).
  const guestQuery = useQuery({
    queryKey: PUBLIC_SHOWS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await getPublicShows();
      if (error) throw error;
      return mapDatabaseShowsArray(data ?? []);
    },
    enabled: isGuest,
    ...GUEST_READ_QUERY_OPTIONS,
  });
  const isOnline = useQueryOnlineStatus();
  const guestRead = isGuest ? resolveGuestRead(guestQuery, isOnline) : null;
  const refetchGuestShows = guestQuery.refetch;

  let shows: Show[] = NO_STORE_SHOWS;
  if (user) shows = storeShows;
  else if (guestRead?.kind === 'ready') shows = guestRead.data;
  const showsOffline = guestRead?.kind === 'offline';
  const storeErrorMsg = useShowStore(s => (user ? s.error : null));
  let showsError = storeErrorMsg ? new Error(storeErrorMsg) : null;
  if (guestRead?.kind === 'error') showsError = new Error("Couldn't load shows");
  if (showsOffline) showsError = new Error('Offline');
  const {
    entries: storeEntries,
    isLoading: entriesLoading,
    error: entriesError,
    loadEntries,
  } = useEntryStore();
  const { status: syncStatus } = useReplicationSync();

  // "Entered as exhibitor" count integrity: the local per-show entryStore is
  // empty for a show the exhibitor hasn't opened this session, so merge in the
  // authoritative account-level entered show ids (same source as My Shows) as
  // additive stubs. Membership filters key on show id + the caller's user id,
  // so this corrects the tab count/list without swapping the shared store.
  // The SAME resolver the other three `getUserEntries` consumers use, so
  // restructure 4 is 4/4 rather than 3/4 (MYK9-629 round 1).
  const personId = useEntriesPersonId();
  const accountEnteredShowIds = useAccountEnteredShowIds(personId);
  const { active: activeAccountEnteredShowIds, all: allAccountEnteredShowIds } =
    accountEnteredShowIds;
  const derivedUserId = user?.databaseUserId ?? user?.id;
  const entries = useMemo(
    () =>
      mergeAccountEnteredShowStubs(
        storeEntries,
        allAccountEnteredShowIds,
        derivedUserId,
        activeAccountEnteredShowIds
      ),
    [storeEntries, allAccountEnteredShowIds, activeAccountEnteredShowIds, derivedUserId]
  );
  const activeEnteredShowIds = useMemo(() => {
    const ids = new Set<string>();
    if (!derivedUserId) return ids;
    for (const entry of entries) {
      const belongsToUser =
        entry.registrationData.handler === derivedUserId ||
        entry.registrationData.handlerId === derivedUserId;
      if (belongsToUser && userHasEntriesForShow(entry.showId, [entry])) {
        ids.add(entry.showId);
      }
    }
    return ids;
  }, [derivedUserId, entries]);

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
    authLoading ||
    showsLoading ||
    entriesLoading ||
    accountEnteredShowIds.isLoading ||
    (shows.length === 0 && showsSyncPending) ||
    guestRead?.kind === 'loading';
  const hasError = !!(showsError || entriesError || accountEnteredShowIds.isError);

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
        userHasEntries: activeEnteredShowIds.has(show.id),
        enhancedContext,
        userCanEdit: enhancedContext?.canEdit || false,
        userCanDelete: enhancedContext?.canDelete || false,
        userCanViewPrivateData: enhancedContext?.canViewPrivateData || false,
      };
    });
  }, [filteredShows, userContext, user, entries, activeEnteredShowIds]);

  // Get tab quick actions. `navigate` is passed in rather than reached for
  // globally: these actions used to set window.location.href, a full document
  // load in an offline-first PWA.
  const tabQuickActions = useMemo(() => {
    return getTabQuickActions(selectedTab, user, navigate);
  }, [selectedTab, user, navigate]);

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
      if (activeEnteredShowIds.has(show.id)) {
        userEntries++;
      }
    });

    return { upcoming, closingSoon, userEntries };
  }, [shows, activeEnteredShowIds]);

  // Error handling with retry capability and relationship sync
  const handleRetry = useCallback(async () => {
    try {
      const startTime = performance.now();

      if (isGuest) await refetchGuestShows();
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
  }, [isGuest, refetchGuestShows, loadEntries, user, shows]);

  return {
    user,
    isLoading,
    hasError,
    showsError: showsError || null,
    showsOffline,
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
