/**
 * Stats Data Hook
 *
 * Fetches and aggregates statistics data for shows, trials, and classes.
 *
 * Refactored as part of DEBT-008 to reduce complexity from 86 to manageable levels.
 * Helper functions extracted to statsDataHelpers.ts.
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  StatsData,
  StatsContext,
  BreedStat,
  JudgeStat,
  StatsQueryResult
} from '../types/stats.types';
import { logger } from '@/utils/logger';
import {
  EMPTY_STATS,
  calculateBasicCounts,
  calculateRates,
  calculateTimeStats,
  applyLevelFilters,
  applyCommonFilters,
  aggregateBreedStatsFromData,
  fetchBreedStatsFromView,
  aggregateJudgeStatsFromData,
  fetchJudgeStatsFromView,
  fetchJudgeSummaryData,
  fetchFastestTimes,
  fetchCleanSweepDogs,
  fetchTotalEntriesCount,
  hasBreedRelatedFilters,
  hasAdditionalFilters
} from './statsDataHelpers';

// ========================================
// TYPES
// ========================================

interface UseStatsDataReturn {
  data: StatsData | null;
  isLoading: boolean;
  error: Error | null;
  isOffline: boolean;
  refetch: () => void;
}

// ========================================
// AUTH HELPERS
// ========================================

/**
 * Get license key from auth storage
 */
function getLicenseKey(): string {
  const authData = localStorage.getItem('myK9Q_auth');
  if (!authData) throw new Error('Not authenticated');

  const parsedAuth = JSON.parse(authData);
  const licenseKey = parsedAuth.showContext?.licenseKey;
  if (!licenseKey) throw new Error('No license key found');

  return licenseKey;
}

// ========================================
// DATA FETCHERS
// ========================================

/**
 * Fetch main stats data from view_stats_summary
 */
async function fetchMainStatsData(
  context: StatsContext,
  licenseKey: string
): Promise<StatsQueryResult[]> {
  let query = supabase
    .from('view_stats_summary')
    .select('*')
    .eq('license_key', licenseKey);

  query = applyLevelFilters(query, context);
  query = applyCommonFilters(query, context.filters);

  const { data, error } = await query;
  if (error) throw error;

  return data || [];
}

/**
 * Fetch breed stats (chooses strategy based on active filters)
 */
async function fetchBreedStats(
  context: StatsContext,
  licenseKey: string,
  statsData: StatsQueryResult[]
): Promise<BreedStat[]> {
  if (hasBreedRelatedFilters(context.filters)) {
    // Aggregate from already-filtered data
    return aggregateBreedStatsFromData(statsData);
  }

  // Use pre-aggregated view for performance
  return fetchBreedStatsFromView(context, licenseKey);
}

/**
 * Fetch judge stats (chooses strategy based on active filters)
 */
async function fetchJudgeStats(
  context: StatsContext,
  licenseKey: string
): Promise<JudgeStat[]> {
  if (hasAdditionalFilters(context.filters)) {
    // Fetch filtered summary data and aggregate
    const summaryData = await fetchJudgeSummaryData(context, licenseKey);
    return aggregateJudgeStatsFromData(summaryData);
  }

  // Use pre-aggregated view for performance
  return fetchJudgeStatsFromView(context, licenseKey);
}

// ========================================
// MAIN HOOK
// ========================================

export function useStatsData(context: StatsContext): UseStatsDataReturn {
  const [data, setData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Build cache key from context
  const cacheKey = useMemo(() => {
    const parts = [
      context.level,
      context.showId || '',
      context.trialId || '',
      context.classId || '',
      context.filters.breed || '',
      context.filters.judge || '',
      context.filters.trialDate || '',
      context.filters.trialNumber?.toString() || '',
      context.filters.element || '',
      context.filters.level || ''
    ];
    return parts.join(':');
  }, [context]);

  /**
   * Main fetch function - orchestrates all data fetching
   */
  const fetchStats = async () => {
    // Skip fetch if offline - stats require network connectivity
    if (!navigator.onLine) {
      setIsLoading(false);
      setData(null);
      logger.log('📊 Stats: Skipping fetch - offline');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const licenseKey = getLicenseKey();

      // Fetch main stats data
      const statsData = await fetchMainStatsData(context, licenseKey);

      if (statsData.length === 0) {
        setData(EMPTY_STATS);
        return;
      }

      // Calculate basic stats
      const counts = calculateBasicCounts(statsData);
      const rates = calculateRates(counts);
      const timeStats = calculateTimeStats(statsData);

      // Fetch additional stats in parallel
      const [breedStats, judgeStats, fastestTimesResult, cleanSweepDogs, totalAllEntries] = await Promise.all([
        fetchBreedStats(context, licenseKey, statsData),
        fetchJudgeStats(context, licenseKey),
        fetchFastestTimes(context, licenseKey),
        fetchCleanSweepDogs(context, licenseKey),
        fetchTotalEntriesCount(context, licenseKey)
      ]);

      // Assemble final stats data
      setData({
        ...counts,
        ...rates,
        ...timeStats,
        totalAllEntries,
        fastestTime: fastestTimesResult.fastestTime,
        breedStats,
        judgeStats,
        cleanSweepDogs,
        fastestTimes: fastestTimesResult.fastestTimes
      });
    } catch (err) {
      logger.error('Error fetching stats:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch statistics'));
    } finally {
      setIsLoading(false);
    }
  };

  // Refetch trigger state - increment to force a refetch
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Refetch function - triggers a new fetch from server
  const refetch = () => {
    setRefetchTrigger(prev => prev + 1);
  };

  // Effect to fetch data when cache key or refetch trigger changes
  useEffect(() => {
    fetchStats();
  }, [cacheKey, refetchTrigger]);

  return {
    data,
    isLoading,
    error,
    isOffline,
    refetch
  };
}
