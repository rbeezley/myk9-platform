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
  calculateTimeStatsFiltered,
  applyLevelFilters,
  applyCommonFilters,
  aggregateBreedStatsFromData,
  fetchBreedStatsFromView,
  aggregateJudgeStatsFromData,
  fetchJudgeSummaryData,
  fetchFastestTimes,
  fetchCleanSweepDogs,
  fetchTotalEntriesCount,
  fetchCompletedClassIds,
  hasBreedRelatedFilters,
  hasAdditionalFilters,
  normalizeJudgeName,
  getJudgeDisplayName
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
 *
 * @param context - Stats context
 * @param licenseKey - Show license key
 * @param statsData - Main stats data
 * @param completedClassIds - Set of completed class IDs for time filtering (null = no restriction)
 */
async function fetchBreedStats(
  context: StatsContext,
  licenseKey: string,
  statsData: StatsQueryResult[],
  completedClassIds: Set<number> | null
): Promise<BreedStat[]> {
  if (hasBreedRelatedFilters(context.filters)) {
    // Aggregate from already-filtered data
    return aggregateBreedStatsFromData(statsData, completedClassIds);
  }

  // Use pre-aggregated view for performance
  return fetchBreedStatsFromView(context, licenseKey, completedClassIds);
}

/**
 * Fetch judge stats (chooses strategy based on active filters)
 *
 * When completedClassIds is provided, we must use the summary-based approach
 * because the view aggregates by trial and doesn't have class-level granularity.
 *
 * @param context - Stats context
 * @param licenseKey - Show license key
 * @param completedClassIds - Set of completed class IDs for time filtering (null = no restriction)
 */
async function fetchJudgeStats(
  context: StatsContext,
  licenseKey: string,
  completedClassIds: Set<number> | null
): Promise<JudgeStat[]> {
  // When filtering times by completed classes, we must use summary-based approach
  // because the view doesn't have class-level granularity
  if (hasAdditionalFilters(context.filters) || completedClassIds) {
    // Fetch filtered summary data and aggregate
    const summaryData = await fetchJudgeSummaryData(context, licenseKey);
    return aggregateJudgeStatsFromData(summaryData, completedClassIds);
  }

  // Use pre-aggregated view for performance (no time restrictions needed)
  const query = supabase
    .from('view_judge_stats')
    .select('*')
    .eq('license_key', licenseKey);

  const result = await applyLevelFilters(query, context)
    .order('total_entries', { ascending: false })
    .limit(20);  // Fetch more to account for per-trial rows that will be merged

  if (result.error) throw result.error;

  // Deduplicate judges across trials using normalized names
  // The view returns one row per judge per trial, so we need to aggregate
  const judgeAggregateMap = new Map<string, {
    displayName: string;
    classesJudged: number;
    totalEntries: number;
    qualifiedCount: number;
    qualifiedTimes: number[];
  }>();

  for (const judge of result.data || []) {
    const normalizedKey = normalizeJudgeName(judge.judge_name);
    if (!normalizedKey) continue;

    const existing = judgeAggregateMap.get(normalizedKey) || {
      displayName: getJudgeDisplayName(judge.judge_name),
      classesJudged: 0,
      totalEntries: 0,
      qualifiedCount: 0,
      qualifiedTimes: []
    };

    existing.classesJudged += judge.classes_judged;
    existing.totalEntries += judge.total_entries;
    existing.qualifiedCount += judge.qualified_count;

    if (judge.avg_qualified_time && judge.avg_qualified_time > 0) {
      // Weight the average time by number of qualified entries
      for (let i = 0; i < judge.qualified_count; i++) {
        existing.qualifiedTimes.push(judge.avg_qualified_time);
      }
    }

    judgeAggregateMap.set(normalizedKey, existing);
  }

  return Array.from(judgeAggregateMap.values())
    .map(stats => ({
      judgeName: stats.displayName,
      classesJudged: stats.classesJudged,
      totalEntries: stats.totalEntries,
      qualifiedCount: stats.qualifiedCount,
      qualificationRate: stats.totalEntries > 0 ? (stats.qualifiedCount / stats.totalEntries) * 100 : 0,
      averageQualifiedTime: stats.qualifiedTimes.length > 0
        ? stats.qualifiedTimes.reduce((sum, t) => sum + t, 0) / stats.qualifiedTimes.length
        : null
    }))
    .sort((a, b) => b.totalEntries - a.totalEntries)
    .slice(0, 10);
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
      const shouldRestrictTimes = context.restrictTimesToCompletedClasses ?? false;

      // Fetch completed class IDs if we need to filter times
      // This is used to show times only from completed classes for non-admin/judge users
      const completedClassIds = shouldRestrictTimes
        ? await fetchCompletedClassIds(context, licenseKey)
        : null;

      // Fetch main stats data
      const statsData = await fetchMainStatsData(context, licenseKey);

      if (statsData.length === 0) {
        setData(EMPTY_STATS);
        return;
      }

      // Calculate basic stats (counts don't need time filtering)
      const counts = calculateBasicCounts(statsData);
      const rates = calculateRates(counts);

      // Calculate time stats, filtering to completed classes if restriction is in place
      const timeStats = calculateTimeStatsFiltered(statsData, completedClassIds);

      // Fetch additional stats in parallel
      // Pass completedClassIds to functions that return time data
      const [breedStats, judgeStats, fastestTimesResult, cleanSweepDogs, totalAllEntries] = await Promise.all([
        fetchBreedStats(context, licenseKey, statsData, completedClassIds),
        fetchJudgeStats(context, licenseKey, completedClassIds),
        fetchFastestTimes(context, licenseKey, shouldRestrictTimes),
        fetchCleanSweepDogs(context, licenseKey),
        fetchTotalEntriesCount(context, licenseKey)
      ]);

      // Assemble final stats data
      // Times are already filtered to completed classes by the helper functions
      setData({
        ...counts,
        ...rates,
        averageTime: timeStats.averageTime,
        medianTime: timeStats.medianTime,
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
