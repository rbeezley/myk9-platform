/**
 * useDashboardData Hook
 *
 * Aggregates data from multiple sources for the Show Dashboard:
 * - Announcement statistics (unread count)
 * - Class progress across all trials
 * - Favorite dogs with pending entries
 * - Show information
 *
 * Uses offline-first approach with replicated cache.
 */

import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAnnouncementStore, type Announcement } from '@/stores/announcementStore';
import { useHomeDashboardData, type TrialData } from '@/pages/Home/hooks/useHomeDashboardData';
import { replicatedShowsTable, type Show } from '@/services/replication';
import { loadFavoritesAsSet } from '@/utils/favoritesUtils';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Entry, Class, Trial } from '@/services/replication';
import { logger } from '@/utils/logger';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface ClassSummary {
  id: number;
  class_name: string;
  element: string;
  level: string;
  section: string;
  judge_name: string;
  entry_count: number;
  completed_count: number;
  class_status: string;
  trial_id: number;
  trial_number: number;
  trial_date: string;
  planned_start_time?: string;
  // Status-related time fields for ClassStatusDialog
  briefing_time?: string;
  break_until_time?: string;
  start_time?: string;
  // Time limit fields for scoresheet printing
  time_limit_seconds?: number;
  time_limit_area2_seconds?: number;
  time_limit_area3_seconds?: number;
  area_count?: number;
}

export interface FavoriteEntry {
  dogId: number;
  armband: number;
  dogName: string;
  nextClass: string | null;
  nextClassId: number | null;
  queuePosition: number | null;
  isInRing: boolean;
  isPending: boolean;
}

export interface DashboardStats {
  unreadAnnouncements: number;
  totalAnnouncements: number;
  favoritesPending: number;
  activeClasses: number;
  completedClasses: number;
  totalClasses: number;
  completionPercent: number;
}

export interface DashboardData {
  // Stats for StatsRow
  stats: DashboardStats;

  // Lists for cards
  classes: ClassSummary[];
  pendingClasses: ClassSummary[];
  completedClasses: ClassSummary[];
  favoriteEntries: FavoriteEntry[];
  recentAnnouncements: Announcement[];
  show: Show | null;
  trials: TrialData[];

  // State
  isLoading: boolean;
  error: string | null;
  refetch: (options?: { all?: boolean; forceSync?: boolean }) => Promise<void>;
}

// ============================================================
// QUERY KEYS
// ============================================================

export const dashboardKeys = {
  all: (licenseKey: string) => ['showDashboard', licenseKey] as const,
  classes: (licenseKey: string) => ['showDashboard', licenseKey, 'classes'] as const,
  show: (licenseKey: string) => ['showDashboard', licenseKey, 'show'] as const,
};

// ============================================================
// FETCH FUNCTIONS
// ============================================================

/**
 * Fetch all classes across all trials for a show
 */
async function fetchAllClasses(licenseKey: string): Promise<ClassSummary[]> {
  try {
    const manager = await ensureReplicationManager();
    const classesTable = manager.getTable('classes');
    const entriesTable = manager.getTable('entries');
    const trialsTable = manager.getTable('trials');

    if (!classesTable) {
      logger.warn('[useDashboardData] Classes table not available');
      return [];
    }

    // Get all data from cache
    const allClasses = (await classesTable.getAll()) as Class[];
    const allEntries = entriesTable ? ((await entriesTable.getAll()) as Entry[]) : [];
    const allTrials = trialsTable ? ((await trialsTable.getAll()) as Trial[]) : [];

    // Build trial lookup map
    const trialMap = new Map<number, { trial_number: number; trial_date: string }>();
    allTrials.forEach(trial => {
      const trialId = typeof trial.id === 'string' ? parseInt(trial.id, 10) : trial.id;
      trialMap.set(trialId, {
        trial_number: trial.trial_number || 1,
        trial_date: trial.trial_date || '',
      });
    });

    // Filter entries by license key
    const showEntries = allEntries.filter(e => e.license_key === licenseKey);

    // Build class summaries
    const classSummaries: ClassSummary[] = allClasses.map(cls => {
      const classEntries = showEntries.filter(e => String(e.class_id) === String(cls.id));
      const completedCount = classEntries.filter(e => e.is_scored).length;
      const trialId = typeof cls.trial_id === 'string' ? parseInt(cls.trial_id, 10) : cls.trial_id;
      const trialInfo = trialMap.get(trialId) || { trial_number: 1, trial_date: '' };

      // Only include section if it's not a dash (dash means N/A)
      const sectionPart = cls.section && cls.section !== '-' ? cls.section : '';

      // Build class name and remove any trailing dashes (N/A indicators)
      const rawClassName = `${cls.element || ''} ${cls.level || ''}${sectionPart ? ' ' + sectionPart : ''}`.trim();
      const className = rawClassName.replace(/[\s-]+$/, '').trim();

      return {
        id: typeof cls.id === 'string' ? parseInt(cls.id, 10) : cls.id,
        class_name: className,
        element: cls.element || '',
        level: cls.level || '',
        section: cls.section || '',
        judge_name: cls.judge_name || '',
        entry_count: classEntries.length,
        completed_count: completedCount,
        class_status: cls.class_status || 'no-status',
        trial_id: trialId,
        trial_number: trialInfo.trial_number,
        trial_date: trialInfo.trial_date,
        planned_start_time: cls.planned_start_time || cls.start_time || undefined,
        // Status-related time fields for ClassStatusDialog
        briefing_time: cls.briefing_time,
        break_until_time: cls.break_until,
        start_time: cls.start_time,
        // Time limit fields for scoresheet printing
        time_limit_seconds: cls.time_limit_seconds,
        time_limit_area2_seconds: cls.time_limit_area2_seconds,
        time_limit_area3_seconds: cls.time_limit_area3_seconds,
        area_count: cls.area_count,
      };
    });

    // Filter to only classes that have entries for this show
    const classesWithEntries = classSummaries.filter(c => c.entry_count > 0);

    // Sort by: trial_number (primary), start time (secondary), class name (tertiary)
    classesWithEntries.sort((a, b) => {
      // Primary: trial number
      if (a.trial_number !== b.trial_number) {
        return a.trial_number - b.trial_number;
      }

      // Secondary: start time (null/undefined pushed to end)
      const timeA = a.planned_start_time ? new Date(a.planned_start_time).getTime() : Infinity;
      const timeB = b.planned_start_time ? new Date(b.planned_start_time).getTime() : Infinity;

      if (timeA !== timeB) {
        return timeA - timeB;
      }

      // Tertiary: alphabetical by class name
      return a.class_name.localeCompare(b.class_name);
    });

    logger.log(`[useDashboardData] Loaded ${classesWithEntries.length} classes for dashboard`);
    return classesWithEntries;
  } catch (error) {
    logger.error('[useDashboardData] Error fetching classes:', error);
    return [];
  }
}

/**
 * Fetch show details
 */
async function fetchShow(licenseKey: string): Promise<Show | null> {
  try {
    const allShows = await replicatedShowsTable.getAllShows();
    const show = allShows.find(s => s.license_key === licenseKey);
    return show || null;
  } catch (error) {
    logger.error('[useDashboardData] Error fetching show:', error);
    return null;
  }
}

/**
 * Calculate queue position for an entry within its class.
 * Returns the number of dogs ahead in the queue (0 = next up).
 */
function calculateQueuePosition(
  entry: Entry,
  allShowEntries: Entry[]
): number | null {
  // Skip if entry is already scored - no queue position needed
  if (entry.is_scored) {
    return null;
  }

  // Get all entries for this class
  const classId = String(entry.class_id);
  const classEntries = allShowEntries.filter(e => String(e.class_id) === classId);

  // Filter to only pending entries (not scored, not pulled)
  const pendingEntries = classEntries.filter(e =>
    !e.is_scored &&
    e.entry_status !== 'pulled' &&
    e.entry_status !== 'completed'
  );

  // Sort by exhibitor_order (ascending), with in-ring entries first
  const sortedEntries = [...pendingEntries].sort((a, b) => {
    // In-ring entries always first
    const aIsInRing = a.entry_status === 'in-ring' || a.is_in_ring;
    const bIsInRing = b.entry_status === 'in-ring' || b.is_in_ring;
    if (aIsInRing && !bIsInRing) return -1;
    if (!aIsInRing && bIsInRing) return 1;

    // Then by exhibitor_order (treat 0 as "not set" and fall back to armband)
    const aOrder = (a.exhibitor_order && a.exhibitor_order > 0) ? a.exhibitor_order : (a.armband_number ?? 9999);
    const bOrder = (b.exhibitor_order && b.exhibitor_order > 0) ? b.exhibitor_order : (b.armband_number ?? 9999);
    return aOrder - bOrder;
  });

  // Find this entry's position in the sorted list
  const entryId = String(entry.id);
  const position = sortedEntries.findIndex(e => String(e.id) === entryId);

  // Return the number of dogs ahead (position is 0-indexed)
  return position >= 0 ? position : null;
}

/**
 * Calculate favorite entries with queue positions
 */
async function calculateFavoriteEntries(
  licenseKey: string,
  favoriteDogArmbands: Set<number>
): Promise<FavoriteEntry[]> {
  if (favoriteDogArmbands.size === 0) {
    return [];
  }

  try {
    const manager = await ensureReplicationManager();
    const entriesTable = manager.getTable('entries');

    if (!entriesTable) return [];

    const allEntries = (await entriesTable.getAll()) as Entry[];
    const showEntries = allEntries.filter(e => e.license_key === licenseKey);

    // Group entries by armband (dog)
    const dogEntries = new Map<number, Entry[]>();
    showEntries.forEach(entry => {
      if (favoriteDogArmbands.has(entry.armband_number)) {
        if (!dogEntries.has(entry.armband_number)) {
          dogEntries.set(entry.armband_number, []);
        }
        dogEntries.get(entry.armband_number)!.push(entry);
      }
    });

    // Get class info for class names
    const classesTable = manager.getTable('classes');
    const allClasses = classesTable ? ((await classesTable.getAll()) as Class[]) : [];
    const classMap = new Map<string, Class>();
    allClasses.forEach(cls => {
      classMap.set(String(cls.id), cls);
    });

    // Build favorite entries list
    const favorites: FavoriteEntry[] = [];

    dogEntries.forEach((entries, _armband) => {
      // Find the next pending entry (not scored, not pulled)
      // entry_status values: 'no-status' | 'checked-in' | 'at-gate' | 'in-ring' | 'completed'
      const pendingEntries = entries.filter(e => !e.is_scored && e.entry_status !== 'completed');
      const inRingEntry = pendingEntries.find(e => e.is_in_ring);
      const nextEntry = inRingEntry || pendingEntries[0];

      if (nextEntry || entries.length > 0) {
        const firstEntry = entries[0];
        // Get class info for next entry
        const nextClass = nextEntry ? classMap.get(String(nextEntry.class_id)) : null;
        const nextClassName = nextClass
          ? `${nextClass.element || ''} ${nextClass.level || ''}`.trim()
          : null;

        favorites.push({
          dogId: typeof firstEntry.id === 'string' ? parseInt(firstEntry.id, 10) : Number(firstEntry.id),
          armband: firstEntry.armband_number,
          dogName: firstEntry.dog_call_name,
          nextClass: nextClassName,
          nextClassId: nextEntry ? (typeof nextEntry.class_id === 'string' ? parseInt(nextEntry.class_id, 10) : Number(nextEntry.class_id)) : null,
          queuePosition: nextEntry ? calculateQueuePosition(nextEntry, showEntries) : null,
          isInRing: !!inRingEntry,
          isPending: pendingEntries.length > 0,
        });
      }
    });

    return favorites;
  } catch (error) {
    logger.error('[useDashboardData] Error calculating favorite entries:', error);
    return [];
  }
}

// ============================================================
// MAIN HOOK
// ============================================================

/**
 * Hook to fetch all dashboard data
 */
export function useDashboardData(
  licenseKey: string | undefined,
  showId: string | number | undefined
): DashboardData {
  // Get query client for cache invalidation
  const queryClient = useQueryClient();

  // Get announcement data from store
  const {
    announcements,
    unreadCount,
    isLoading: announcementsLoading,
  } = useAnnouncementStore();

  // Get trials from existing hook (entries not needed - we use replicated cache)
  const {
    trials,
    isLoading: homeDataLoading,
    error: homeDataError,
    refetch: refetchHomeData,
  } = useHomeDashboardData(licenseKey, showId);

  // Fetch classes
  const classesQuery = useQuery({
    queryKey: dashboardKeys.classes(licenseKey || ''),
    queryFn: () => fetchAllClasses(licenseKey!),
    enabled: !!licenseKey,
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch show
  const showQuery = useQuery({
    queryKey: dashboardKeys.show(licenseKey || ''),
    queryFn: () => fetchShow(licenseKey!),
    enabled: !!licenseKey,
    staleTime: 5 * 60 * 1000, // 5 minutes (show info rarely changes)
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  // Load dog favorites from localStorage
  const favoriteDogs = useMemo(() => {
    return loadFavoritesAsSet('dog', licenseKey);
  }, [licenseKey]);

  // Calculate favorite entries
  const favoriteEntriesQuery = useQuery({
    queryKey: ['showDashboard', licenseKey, 'favorites', Array.from(favoriteDogs).join(',')],
    queryFn: () => calculateFavoriteEntries(licenseKey!, favoriteDogs),
    enabled: !!licenseKey && favoriteDogs.size > 0,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Compute derived stats
  // Note: Database uses underscores (in_progress), but some places use dashes (in-progress)
  // We check for both to handle any inconsistencies
  const stats = useMemo((): DashboardStats => {
    const classes = classesQuery.data || [];
    // Only count classes explicitly marked as "in progress" - not setup, briefing, etc.
    const activeClasses = classes.filter(c =>
      c.class_status === 'in_progress' || c.class_status === 'in-progress'
    ).length;
    const completedClasses = classes.filter(c => c.class_status === 'completed').length;
    const totalClasses = classes.length;
    const completionPercent = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;
    const favoritesPending = (favoriteEntriesQuery.data || []).filter(f => f.isPending).length;

    return {
      unreadAnnouncements: unreadCount,
      totalAnnouncements: announcements.length,
      favoritesPending,
      activeClasses,
      completedClasses,
      totalClasses,
      completionPercent,
    };
  }, [classesQuery.data, unreadCount, announcements.length, favoriteEntriesQuery.data]);

  // Split classes into pending and completed
  const { pendingClasses, completedClasses: completedClassesList } = useMemo(() => {
    const classes = classesQuery.data || [];
    return {
      pendingClasses: classes.filter(c => c.class_status !== 'completed'),
      completedClasses: classes.filter(c => c.class_status === 'completed'),
    };
  }, [classesQuery.data]);

  // Get recent announcements (top 3)
  const recentAnnouncements = useMemo(() => {
    return [...announcements]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3);
  }, [announcements]);

  // Combine loading states
  const isLoading = announcementsLoading || homeDataLoading || classesQuery.isLoading || showQuery.isLoading;

  // Combine errors
  const error = homeDataError?.message || classesQuery.error?.message || showQuery.error?.message || null;

  // Combined refetch - uses refetchQueries for immediate data refresh
  // NOTE: Only refetches classes query by default to avoid "show not found" race condition
  // forceSync option syncs from server before refetching cache
  const refetch = useCallback(async (options?: { all?: boolean; forceSync?: boolean }): Promise<void> => {
    // If forceSync, sync from server before refetching from cache
    if (options?.forceSync && licenseKey) {
      try {
        logger.log('🔄 Force sync requested - syncing classes, entries, and shows from server...');
        const manager = await ensureReplicationManager();
        await Promise.all([
          manager.syncTable('classes', { licenseKey }),
          manager.syncTable('entries', { licenseKey }),
          manager.syncTable('shows', { licenseKey }),
        ]);
        logger.log('✅ Force sync complete');
      } catch (syncError) {
        // Sync failed (likely offline) - continue with cached data
        logger.warn('⚠️ Sync failed (offline?), using cached data:', syncError);
      }
    }

    // Force immediate refetch of classes query (not just invalidate)
    await queryClient.refetchQueries({
      queryKey: dashboardKeys.classes(licenseKey || ''),
      type: 'active',
    });

    // Only refetch other queries if explicitly requested (e.g., full page refresh)
    if (options?.all) {
      refetchHomeData();
      showQuery.refetch();
      favoriteEntriesQuery.refetch();
    }
  }, [queryClient, licenseKey, refetchHomeData, showQuery, favoriteEntriesQuery]);

  return {
    stats,
    classes: classesQuery.data || [],
    pendingClasses,
    completedClasses: completedClassesList,
    favoriteEntries: favoriteEntriesQuery.data || [],
    recentAnnouncements,
    show: showQuery.data || null,
    trials,
    isLoading,
    error,
    refetch,
  };
}
