/**
 * React Query hooks for Home dashboard page
 *
 * Replaces useStaleWhileRevalidate with React Query for automatic caching and background refetching.
 * Benefits:
 * - Automatic caching with configurable stale/cache times
 * - Deduplication (multiple components requesting same data = 1 network call)
 * - Background refetching
 * - Built-in loading/error states
 * - Query invalidation helpers
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { logger } from '../../../utils/logger';
import { subscriptionCleanup } from '../../../services/subscriptionCleanup';
import { debounce } from 'lodash';
import { ensureReplicationManager } from '@/utils/replicationHelper';
import type { Entry, Trial, Class } from '@/services/replication';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface EntryData {
  id: number;
  armband: number;
  call_name: string;
  breed: string;
  handler: string;
  is_favorite?: boolean;
  class_name?: string;
  is_scored?: boolean;
}

export interface TrialData {
  id: number;
  show_id: number;
  trial_name: string;
  trial_date: string;
  trial_number: number;
  trial_type: string;
  classes_completed: number;
  classes_total: number;
  entries_completed: number;
  entries_total: number;
}

export interface DashboardData {
  entries: EntryData[];
  trials: TrialData[];
}

// ============================================================
// QUERY KEYS (centralized for easy invalidation)
// ============================================================

export const homeDashboardKeys = {
  all: (licenseKey: string) => ['homeDashboard', licenseKey] as const,
  entries: (licenseKey: string) => ['homeDashboard', licenseKey, 'entries'] as const,
  trials: (showId: number) => ['homeDashboard', showId, 'trials'] as const,
};

// ============================================================
// FETCH FUNCTIONS
// ============================================================

/**
 * Try to load trials from replicated cache
 * Returns null if cache is not available or empty (signals fallback needed)
 */
async function tryLoadTrialsFromCache(showId: number): Promise<TrialData[] | null> {
  try {
    const manager = await ensureReplicationManager();
    const trialsTable = manager.getTable('trials');
    const classesTable = manager.getTable('classes');
    const entriesTable = manager.getTable('entries');

    if (!trialsTable) return null;

    // Get trials for this show from cache (cast to proper types)
    const allTrials = await trialsTable.getAll() as Trial[];
    const showTrials = allTrials.filter(t => String(t.show_id) === String(showId));

    logger.log(`✅ Loaded ${showTrials.length} trials from cache for show ${showId}`);

    if (showTrials.length === 0) return null;

    // Get classes and entries from cache for counts
    const allClasses = classesTable ? await classesTable.getAll() as Class[] : [];
    const allEntries = entriesTable ? await entriesTable.getAll() as Entry[] : [];

    // Build trial data with counts from cached data
    const processedTrials: TrialData[] = showTrials.map(trial => {
      const trialId = String(trial.id);
      const trialClasses = allClasses.filter(c => String(c.trial_id) === trialId);
      const trialClassIds = new Set(trialClasses.map(c => String(c.id)));
      const trialEntries = allEntries.filter(e => trialClassIds.has(String(e.class_id)));

      const totalClasses = trialClasses.length;
      const completedClasses = trialClasses.filter(c => c.is_scoring_finalized).length;
      const totalEntries = trialEntries.length;
      const completedEntries = trialEntries.filter(e => e.is_scored).length;

      return {
        id: parseInt(trialId, 10),
        show_id: parseInt(String(trial.show_id), 10),
        trial_name: trial.element || '',
        trial_date: trial.trial_date,
        trial_number: trial.trial_number || 1,
        trial_type: trial.competition_type || '',
        classes_completed: completedClasses,
        classes_total: totalClasses,
        entries_completed: completedEntries,
        entries_total: totalEntries
      };
    });

    return processedTrials;
  } catch (error) {
    logger.error('❌ Error loading trials from cache:', error);
    return null;
  }
}

/**
 * Fetch trials with progress counts
 * Uses replicated cache first (offline-first), falls back to Supabase
 */
async function fetchTrials(showId: string | number | undefined): Promise<TrialData[]> {
  if (!showId) {
    logger.log('⏸️ Skipping trials fetch - showId not ready yet');
    return [];
  }

  // Convert showId to number if it's a string
  const numericShowId = typeof showId === 'string' ? parseInt(showId, 10) : showId;

  logger.log('🔍 Fetching trials for show ID:', numericShowId);

  // Try replicated cache first (offline-first)
  try {
    const cachedTrials = await tryLoadTrialsFromCache(numericShowId);
    if (cachedTrials && cachedTrials.length > 0) {
      logger.log('✅ Using cached trials data:', cachedTrials.length, 'trials');
      return cachedTrials;
    }
  } catch (error) {
    logger.error('❌ Error loading from cache, falling back to Supabase:', error);
  }

  // Fall back to Supabase if cache miss or error
  logger.log('🔄 Fetching trials from Supabase (cache miss or empty)...');

  // Load trials
  const { data: trialsData, error: trialsError } = await supabase
    .from('trials')
    .select('*')
    .eq('show_id', numericShowId);

  if (trialsError) {
    logger.error('❌ Error loading trials:', trialsError);
    throw trialsError;
  }

  logger.log('✅ Trials data loaded:', trialsData?.length || 0, 'trials');

  if (!trialsData || trialsData.length === 0) {
    return [];
  }

  // Process trials with counts - OPTIMIZED using view_class_summary
  const trialIds = trialsData.map(t => t.id);

  // Fetch pre-aggregated class data with entry counts in ONE query
  const { data: classSummaries } = await supabase
    .from('view_class_summary')
    .select('*')
    .in('trial_id', trialIds);

  // Group class summaries by trial_id
  // CRITICAL: Use string keys for consistency (prevents number/string type mismatch bugs)
  const classesByTrial = new Map<string, typeof classSummaries>();
  classSummaries?.forEach(cls => {
    const trialIdKey = String(cls.trial_id);
    if (!classesByTrial.has(trialIdKey)) {
      classesByTrial.set(trialIdKey, []);
    }
    classesByTrial.get(trialIdKey)!.push(cls);
  });

  // Process trials using pre-calculated counts from view
  const processedTrials: TrialData[] = trialsData.map(trial => {
    const trialClasses = classesByTrial.get(String(trial.id)) || [];
    const totalClasses = trialClasses.length;
    const completedClasses = trialClasses.filter(c => c.is_scoring_finalized).length;

    // Sum pre-calculated entry counts from view
    const totalEntries = trialClasses.reduce((sum, c) => sum + (c.total_entries || 0), 0);
    const completedEntries = trialClasses.reduce((sum, c) => sum + (c.scored_entries || 0), 0);

    return {
      ...trial,
      classes_completed: completedClasses,
      classes_total: totalClasses,
      entries_completed: completedEntries,
      entries_total: totalEntries
    };
  });

  return processedTrials;
}

/**
 * Try to load entries from replicated cache
 * Returns null if cache is not available or empty (signals fallback needed)
 * Extracted to reduce nesting depth (DEBT-009)
 *
 * CRITICAL: Must filter by licenseKey to prevent cross-show data leakage
 * IndexedDB cache may contain stale data from previous sessions/shows
 *
 * @param licenseKey - The current show's license key to filter by
 */
async function tryLoadEntriesFromCache(licenseKey: string): Promise<EntryData[] | null> {
  const manager = await ensureReplicationManager();
  const table = manager.getTable('entries');
  if (!table) return null;

  const cachedEntries = await table.getAll() as Entry[];
  logger.log(`✅ Loaded ${cachedEntries.length} total entries from cache`);

  // CRITICAL: Filter by license_key to prevent showing dogs from other shows
  // This handles both stale cache from dev sessions AND production show switching
  const filteredEntries = cachedEntries.filter(entry => entry.license_key === licenseKey);
  logger.log(`🔒 Filtered to ${filteredEntries.length} entries for license_key: ${licenseKey}`);

  // If no entries match current license key, fall back to Supabase
  // This ensures we don't serve stale data from a different show
  if (filteredEntries.length === 0) {
    logger.log('📭 No entries for current show in cache, falling back to Supabase');
    return null;
  }

  // Transform replicated Entry to EntryData format
  const uniqueDogs = new Map<number, EntryData>();

  filteredEntries.forEach(entry => {
    if (!uniqueDogs.has(entry.armband_number)) {
      uniqueDogs.set(entry.armband_number, {
        id: parseInt(entry.id, 10),
        armband: entry.armband_number,
        call_name: entry.dog_call_name,
        breed: entry.dog_breed || '',
        handler: entry.handler_name,
        is_favorite: false, // Will be updated by component after favorites load
        class_name: undefined, // No class info in replicated Entry yet
        is_scored: entry.is_scored
      });
    }
  });

  const processedEntries = Array.from(uniqueDogs.values());
  logger.log('🐕 Processed unique dogs from cache:', processedEntries.length);

  return processedEntries;
}

/**
 * Fetch entries (unique dogs by armband)
 * Uses replicated cache when enabled, falls back to Supabase
 */
async function fetchEntries(licenseKey: string | undefined): Promise<EntryData[]> {
logger.log('🐕 fetchEntries called with licenseKey:', licenseKey);

  if (!licenseKey) {
    logger.log('⏸️ Skipping entries fetch - licenseKey not ready yet');
    return [];
  }

  // Try replicated cache first
  logger.log('🔄 Fetching entries from replicated cache...');

  try {
    const cachedResult = await tryLoadEntriesFromCache(licenseKey);
    if (cachedResult) {
      return cachedResult;
    }
    // Cache returned null - fall through to Supabase
  } catch (error) {
    logger.error('❌ Error loading from replicated cache, falling back to Supabase:', error);
    // Fall through to Supabase query
  }

  // Fall back to original Supabase query
  logger.log('🔍 Fetching entries from Supabase (fallback or replication disabled)...');

  // Load entries from the normalized view
  const { data: entriesData, error: entriesError } = await supabase
    .from('view_entry_class_join_normalized')
    .select('*')
    .eq('license_key', licenseKey)
    .order('armband_number', { ascending: true });

  if (entriesError) {
    logger.error('❌ Error loading entries:', entriesError);
    throw entriesError;
  }

  logger.log('✅ Entries data loaded:', entriesData?.length || 0, 'entries');

  if (!entriesData) {
    return [];
  }

  // Process entries - get unique dogs by armband
  const uniqueDogs = new Map<number, EntryData>();

  entriesData.forEach(entry => {
    if (!uniqueDogs.has(entry.armband_number)) {
      uniqueDogs.set(entry.armband_number, {
        id: entry.id,
        armband: entry.armband_number,
        call_name: entry.dog_call_name,
        breed: entry.dog_breed,
        handler: entry.handler_name,
        is_favorite: false, // Will be updated by component after favorites load
        class_name: entry.element && entry.level ? `${entry.element} ${entry.level}` : undefined,
        is_scored: entry.is_scored
      });
    }
  });

  const processedEntries = Array.from(uniqueDogs.values());
  logger.log('🐕 Processed unique dogs by armband:', processedEntries.length);

  return processedEntries;
}

// ============================================================
// CUSTOM HOOKS
// ============================================================

/**
 * Hook to fetch trials with progress counts
 */
export function useTrials(showId: string | number | undefined) {
  // Convert showId to number for query key
  const numericShowId = typeof showId === 'string' ? parseInt(showId, 10) : showId;

  return useQuery({
    queryKey: homeDashboardKeys.trials(numericShowId || 0),
    queryFn: () => fetchTrials(showId),
    enabled: !!showId, // Only run if showId is provided
    staleTime: 1 * 60 * 1000, // 1 minute (trials change frequently)
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

/**
 * Hook to fetch entries (unique dogs)
 */
export function useEntries(licenseKey: string | undefined) {
  return useQuery({
    queryKey: homeDashboardKeys.entries(licenseKey || ''),
    queryFn: () => fetchEntries(licenseKey),
    enabled: !!licenseKey, // Only run if licenseKey is provided
    staleTime: 30 * 1000, // 30 seconds - entries can change frequently during scoring
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

/**
 * Helper hook that combines all dashboard data fetching with real-time updates
 */
export function useHomeDashboardData(
  licenseKey: string | undefined,
  showId: string | number | undefined
) {
  const queryClient = useQueryClient();
  const trialsQuery = useTrials(showId);
  const entriesQuery = useEntries(licenseKey);

  // Convert showId to number for consistent usage
  const numericShowId = typeof showId === 'string' ? parseInt(showId, 10) : showId;

  // Set up real-time subscription with debounced invalidation
  useEffect(() => {
    if (!licenseKey || !numericShowId) return;

    logger.log('📡 Setting up real-time subscription for Home dashboard');

    // Debounced invalidation (3 second delay after last change)
    // This batches rapid scoring events into a single refetch
    const invalidateTrialsDebounced = debounce(() => {
      logger.log('🔄 Refetching trial counts after entry changes...');
      queryClient.invalidateQueries({
        queryKey: homeDashboardKeys.trials(numericShowId)
      });
    }, 3000);

    // Subscribe to entries table changes
    const channel = supabase
      .channel(`home-entries-${licenseKey}`)
      .on('postgres_changes', {
        event: '*',  // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'entries',
        filter: `license_key=eq.${licenseKey}`
      }, (payload) => {
        logger.log('📡 Entry changed:', payload.eventType);

        // Only invalidate if scoring-related fields changed
        if (payload.eventType === 'UPDATE') {
          // Extract is_scored from payload records (Supabase realtime provides Record<string, unknown>)
          const oldIsScored = (payload.old as Record<string, unknown> | undefined)?.is_scored;
          const newIsScored = (payload.new as Record<string, unknown> | undefined)?.is_scored;

          // Check if is_scored changed (this affects trial counts via is_scoring_finalized)
          if (oldIsScored !== newIsScored) {
            logger.log('📊 Score status changed, invalidating trials...');
            invalidateTrialsDebounced();
          }
        } else if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
          // INSERT or DELETE always affects counts
          logger.log('📊 Entry added/removed, invalidating trials...');
          invalidateTrialsDebounced();
        }
      })
      .subscribe();

    // Register subscription for monitoring
    subscriptionCleanup.register(
      `home-entries-${licenseKey}`,
      'entry',
      licenseKey
    );

    return () => {
      logger.log('🧹 Cleaning up Home dashboard subscription');
      invalidateTrialsDebounced.cancel(); // Cancel pending debounce
      supabase.removeChannel(channel);
      subscriptionCleanup.unregister(`home-entries-${licenseKey}`);
    };
  }, [licenseKey, numericShowId, queryClient]);

  return {
    trials: trialsQuery.data || [],
    entries: entriesQuery.data || [],
    isLoading: trialsQuery.isLoading || entriesQuery.isLoading,
    isRefreshing: trialsQuery.isFetching || entriesQuery.isFetching,
    error: trialsQuery.error || entriesQuery.error,
    // refetch with optional forceSync to pull fresh data from server first
    refetch: async (forceSync: boolean = false) => {
      // If forceSync, sync from server before refetching from cache
      if (forceSync && licenseKey) {
        try {
          logger.log('🔄 Force sync requested - syncing trials, classes, and entries from server...');
          const manager = await ensureReplicationManager();
          await Promise.all([
            manager.syncTable('trials', { licenseKey }),
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
      trialsQuery.refetch();
      entriesQuery.refetch();
    },
  };
}
