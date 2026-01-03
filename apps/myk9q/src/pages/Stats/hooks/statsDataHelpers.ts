/**
 * Stats Data Helper Functions
 *
 * Extracted from useStatsData.ts (DEBT-008) to reduce complexity.
 * Each function handles a specific stats calculation or data fetch.
 */

import { supabase } from '@/lib/supabase';
import type {
  StatsData,
  StatsContext,
  BreedStat,
  JudgeStat,
  CleanSweepDog,
  FastestTimeEntry,
  BreedStatsQueryResult,
  CleanSweepQueryResult,
  FastestTimesQueryResult,
  StatsQueryResult
} from '../types/stats.types';
import { logger } from '@/utils/logger';

// ========================================
// CONSTANTS
// ========================================

/**
 * Empty stats object for when no data is found
 */
export const EMPTY_STATS: StatsData = {
  totalAllEntries: 0,
  totalEntries: 0,
  scoredEntries: 0,
  qualifiedCount: 0,
  nqCount: 0,
  excusedCount: 0,
  absentCount: 0,
  withdrawnCount: 0,
  uniqueDogs: 0,
  qualificationRate: 0,
  nqRate: 0,
  excusedRate: 0,
  absentRate: 0,
  withdrawnRate: 0,
  fastestTime: null,
  averageTime: null,
  medianTime: null,
  breedStats: [],
  judgeStats: [],
  cleanSweepDogs: [],
  fastestTimes: []
};

// ========================================
// TYPES
// ========================================

export interface BasicCounts {
  totalEntries: number;
  scoredEntries: number;
  qualifiedCount: number;
  nqCount: number;
  excusedCount: number;
  absentCount: number;
  withdrawnCount: number;
  uniqueDogs: number;
}

export interface Rates {
  qualificationRate: number;
  nqRate: number;
  excusedRate: number;
  absentRate: number;
  withdrawnRate: number;
}

export interface TimeStats {
  fastestTime: number | null;
  averageTime: number | null;
  medianTime: number | null;
}

// ========================================
// BASIC STATS CALCULATIONS
// ========================================

/**
 * Calculate basic entry counts from stats data
 */
export function calculateBasicCounts(statsData: StatsQueryResult[]): BasicCounts {
  const totalEntries = statsData.length;
  const scoredEntries = statsData.filter(e => e.is_scored).length;
  const qualifiedCount = statsData.filter(e => e.result_status === 'qualified').length;
  const nqCount = statsData.filter(e => e.result_status === 'nq').length;
  const excusedCount = statsData.filter(e => e.result_status === 'excused').length;
  const absentCount = statsData.filter(e => e.result_status === 'absent').length;
  const withdrawnCount = statsData.filter(e => e.result_status === 'withdrawn').length;

  // Calculate unique dogs (by armband number)
  const uniqueArmbands = new Set(
    statsData.filter(e => e.armband_number).map(e => e.armband_number)
  );
  const uniqueDogs = uniqueArmbands.size;

  return {
    totalEntries,
    scoredEntries,
    qualifiedCount,
    nqCount,
    excusedCount,
    absentCount,
    withdrawnCount,
    uniqueDogs
  };
}

/**
 * Calculate percentage rates from counts
 */
export function calculateRates(counts: BasicCounts): Rates {
  const { scoredEntries, qualifiedCount, nqCount, excusedCount, absentCount, withdrawnCount } = counts;

  return {
    qualificationRate: scoredEntries > 0 ? (qualifiedCount / scoredEntries) * 100 : 0,
    nqRate: scoredEntries > 0 ? (nqCount / scoredEntries) * 100 : 0,
    excusedRate: scoredEntries > 0 ? (excusedCount / scoredEntries) * 100 : 0,
    absentRate: scoredEntries > 0 ? (absentCount / scoredEntries) * 100 : 0,
    withdrawnRate: scoredEntries > 0 ? (withdrawnCount / scoredEntries) * 100 : 0
  };
}

/**
 * Calculate time statistics (fastest, average, median) from qualified entries
 */
export function calculateTimeStats(statsData: StatsQueryResult[]): TimeStats {
  const validTimes = statsData
    .filter(e => e.result_status === 'qualified' && e.valid_time && e.valid_time > 0)
    .map(e => e.valid_time as number)
    .sort((a, b) => a - b);

  if (validTimes.length === 0) {
    return { fastestTime: null, averageTime: null, medianTime: null };
  }

  const fastestTime = validTimes[0];
  const averageTime = validTimes.reduce((sum, time) => sum + time, 0) / validTimes.length;

  const medianTime = validTimes.length % 2 === 0
    ? (validTimes[Math.floor(validTimes.length / 2) - 1] + validTimes[Math.floor(validTimes.length / 2)]) / 2
    : validTimes[Math.floor(validTimes.length / 2)];

  return { fastestTime, averageTime, medianTime };
}

// ========================================
// QUERY BUILDER HELPERS
// ========================================

/**
 * Supabase query builder type for dynamic filter application.
 * Uses explicit typing since Supabase's generic PostgrestFilterBuilder
 * has complex internal types that don't work well with generic wrappers.
 */
interface SupabaseQueryBuilder {
  eq: (column: string, value: string | number) => SupabaseQueryBuilder;
}

/**
 * Apply level filters (show/trial/class) to a Supabase query
 *
 * Note: Uses type assertion because Supabase's query builder types are
 * complex generics that don't compose well with wrapper functions.
 * The runtime behavior is fully type-safe.
 */
export function applyLevelFilters<T>(
  query: T,
  context: StatsContext
): T {
  const q = query as unknown as SupabaseQueryBuilder;

  if (context.level === 'show' && context.showId) {
    return q.eq('show_id', context.showId) as unknown as T;
  }
  if (context.level === 'trial' && context.trialId) {
    return q.eq('trial_id', context.trialId) as unknown as T;
  }
  if (context.level === 'class' && context.classId) {
    return q.eq('class_id', context.classId) as unknown as T;
  }

  return query;
}

/**
 * Apply common filters to a Supabase query
 *
 * Note: Uses type assertion because Supabase's query builder types are
 * complex generics that don't compose well with wrapper functions.
 * The runtime behavior is fully type-safe.
 */
export function applyCommonFilters<T>(
  query: T,
  filters: StatsContext['filters']
): T {
  let q = query as unknown as SupabaseQueryBuilder;

  if (filters.breed) q = q.eq('dog_breed', filters.breed);
  if (filters.judge) q = q.eq('judge_name', filters.judge);
  if (filters.trialDate) q = q.eq('trial_date', filters.trialDate);
  if (filters.element) q = q.eq('element', filters.element);
  if (filters.level) q = q.eq('level', filters.level);
  if (filters.classId) q = q.eq('class_id', filters.classId);

  return q as unknown as T;
}

// ========================================
// TOTAL ENTRIES COUNT (ALL ENTRIES)
// ========================================

/**
 * Fetch total entries count from entries table (includes unscored entries)
 * This queries the entries table directly, not the view which filters to scored only
 */
export async function fetchTotalEntriesCount(
  context: StatsContext,
  licenseKey: string
): Promise<number> {
  try {
    // First, get the class IDs we need to filter by (applies level + element/level filters)
    let classIds: string[] = [];

    if (context.level === 'class' && context.classId) {
      // Single class - just use it directly
      classIds = [context.classId];
    } else if (context.level === 'trial' && context.trialId) {
      // Get class IDs for this trial, with optional element/level filters
      let classQuery = supabase
        .from('classes')
        .select('id')
        .eq('trial_id', context.trialId);

      if (context.filters.element) classQuery = classQuery.eq('element', context.filters.element);
      if (context.filters.level) classQuery = classQuery.eq('level', context.filters.level);

      const { data } = await classQuery;
      classIds = data?.map(c => c.id) || [];
    } else if (context.level === 'show' && context.showId) {
      // Get trial IDs for this show, then class IDs with optional element/level filters
      const { data: trialIds } = await supabase
        .from('trials')
        .select('id')
        .eq('show_id', context.showId);

      if (trialIds && trialIds.length > 0) {
        let classQuery = supabase
          .from('classes')
          .select('id')
          .in('trial_id', trialIds.map(t => t.id));

        if (context.filters.element) classQuery = classQuery.eq('element', context.filters.element);
        if (context.filters.level) classQuery = classQuery.eq('level', context.filters.level);

        const { data } = await classQuery;
        classIds = data?.map(c => c.id) || [];
      }
    }

    if (classIds.length === 0) {
      return 0;
    }

    // Now count entries for these class IDs
    let query = supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('license_key', licenseKey)
      .in('class_id', classIds);

    // Apply breed filter (this IS on entries table)
    if (context.filters.breed) query = query.eq('dog_breed', context.filters.breed);

    const { count, error } = await query;

    if (error) {
      logger.error('Error fetching total entries count:', error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    logger.error('Error in fetchTotalEntriesCount:', err);
    return 0;
  }
}

// ========================================
// BREED STATS
// ========================================

/**
 * Aggregate breed stats from raw stats data (when filters require in-app aggregation)
 */
export function aggregateBreedStatsFromData(statsData: StatsQueryResult[]): BreedStat[] {
  const breedMap = new Map<string, {
    totalEntries: number;
    qualifiedCount: number;
    nqCount: number;
    qualifiedTimes: number[];
  }>();

  for (const entry of statsData) {
    if (!entry.dog_breed) continue;

    const normalizedBreed = entry.dog_breed.trim();
    const existing = breedMap.get(normalizedBreed) || {
      totalEntries: 0,
      qualifiedCount: 0,
      nqCount: 0,
      qualifiedTimes: []
    };

    existing.totalEntries++;

    if (entry.result_status === 'qualified') {
      existing.qualifiedCount++;
      if (entry.valid_time && entry.valid_time > 0) {
        existing.qualifiedTimes.push(entry.valid_time);
      }
    }

    if (entry.result_status === 'nq') {
      existing.nqCount++;
    }

    breedMap.set(normalizedBreed, existing);
  }

  return Array.from(breedMap.entries())
    .map(([breed, stats]) => ({
      breed,
      totalEntries: stats.totalEntries,
      qualifiedCount: stats.qualifiedCount,
      nqCount: stats.nqCount,
      qualificationRate: stats.totalEntries > 0 ? (stats.qualifiedCount / stats.totalEntries) * 100 : 0,
      averageTime: stats.qualifiedTimes.length > 0
        ? stats.qualifiedTimes.reduce((sum, time) => sum + time, 0) / stats.qualifiedTimes.length
        : null,
      fastestTime: stats.qualifiedTimes.length > 0 ? Math.min(...stats.qualifiedTimes) : null
    }))
    .sort((a, b) => b.totalEntries - a.totalEntries)
    .slice(0, 10);
}

/**
 * Fetch breed stats from pre-aggregated view
 * Note: The view groups by class_id, so we need to aggregate results by breed
 */
export async function fetchBreedStatsFromView(
  context: StatsContext,
  licenseKey: string
): Promise<BreedStat[]> {
  let query = supabase
    .from('view_breed_stats')
    .select('*')
    .eq('license_key', licenseKey);

  query = applyLevelFilters(query, context);

  if (context.filters.breed) {
    query = query.eq('dog_breed', context.filters.breed);
  }

  const { data, error } = await query;

  if (error) throw error;

  // The view returns one row per class per breed, so we need to aggregate by breed
  const breedMap = new Map<string, {
    totalEntries: number;
    qualifiedCount: number;
    nqCount: number;
    fastestTime: number | null;
    qualifiedTimes: number[];
  }>();

  for (const row of (data || []) as BreedStatsQueryResult[]) {
    if (!row.dog_breed) continue;

    const breed = row.dog_breed.trim();
    const existing = breedMap.get(breed) || {
      totalEntries: 0,
      qualifiedCount: 0,
      nqCount: 0,
      fastestTime: null,
      qualifiedTimes: []
    };

    existing.totalEntries += row.total_entries || 0;
    existing.qualifiedCount += row.qualified_count || 0;
    existing.nqCount += row.nq_count || 0;

    // Track fastest time across all classes
    if (row.fastest_time && row.fastest_time > 0) {
      if (existing.fastestTime === null || row.fastest_time < existing.fastestTime) {
        existing.fastestTime = row.fastest_time;
      }
    }

    // Collect times for average calculation
    if (row.avg_time && row.avg_time > 0 && row.qualified_count > 0) {
      // Weight by qualified count for proper averaging
      for (let i = 0; i < row.qualified_count; i++) {
        existing.qualifiedTimes.push(row.avg_time);
      }
    }

    breedMap.set(breed, existing);
  }

  // Convert to array and calculate final stats
  return Array.from(breedMap.entries())
    .map(([breed, stats]) => ({
      breed,
      totalEntries: stats.totalEntries,
      qualifiedCount: stats.qualifiedCount,
      nqCount: stats.nqCount,
      qualificationRate: stats.totalEntries > 0 ? (stats.qualifiedCount / stats.totalEntries) * 100 : 0,
      averageTime: stats.qualifiedTimes.length > 0
        ? stats.qualifiedTimes.reduce((sum, t) => sum + t, 0) / stats.qualifiedTimes.length
        : null,
      fastestTime: stats.fastestTime
    }))
    .sort((a, b) => b.totalEntries - a.totalEntries)
    .slice(0, 10);
}

// ========================================
// JUDGE STATS
// ========================================

/**
 * Aggregate judge stats from raw summary data
 */
export function aggregateJudgeStatsFromData(summaryData: StatsQueryResult[]): JudgeStat[] {
  const judgeMap = new Map<string, {
    classesJudged: Set<string>;
    totalEntries: number;
    qualifiedCount: number;
    qualifiedTimes: number[];
  }>();

  for (const entry of summaryData) {
    if (!entry.judge_name || !entry.class_id) continue;

    const normalizedJudgeName = entry.judge_name.trim();
    const existing = judgeMap.get(normalizedJudgeName) || {
      classesJudged: new Set<string>(),
      totalEntries: 0,
      qualifiedCount: 0,
      qualifiedTimes: []
    };

    existing.classesJudged.add(entry.class_id);
    existing.totalEntries++;

    if (entry.result_status === 'qualified') {
      existing.qualifiedCount++;
      if (entry.search_time_seconds && entry.search_time_seconds > 0) {
        existing.qualifiedTimes.push(entry.search_time_seconds);
      }
    }

    judgeMap.set(normalizedJudgeName, existing);
  }

  return Array.from(judgeMap.entries())
    .map(([judgeName, stats]) => ({
      judgeName,
      classesJudged: stats.classesJudged.size,
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

/**
 * Fetch and aggregate judge stats from pre-aggregated view
 * Note: View returns one row per trial, so we need to aggregate across trials
 */
export async function fetchJudgeStatsFromView(
  context: StatsContext,
  licenseKey: string
): Promise<JudgeStat[]> {
  let query = supabase
    .from('view_judge_stats')
    .select('*')
    .eq('license_key', licenseKey);

  query = applyLevelFilters(query, context);

  if (context.filters.judge) {
    query = query.eq('judge_name', context.filters.judge);
  }

  const { data, error } = await query
    .order('total_entries', { ascending: false })
    .limit(10);

  if (error) throw error;

  // Deduplicate judges across trials
  const judgeAggregateMap = new Map<string, {
    classesJudged: number;
    totalEntries: number;
    qualifiedCount: number;
    qualifiedTimes: number[];
  }>();

  for (const judge of data || []) {
    const normalizedName = judge.judge_name?.trim();
    if (!normalizedName) continue;

    const existing = judgeAggregateMap.get(normalizedName) || {
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

    judgeAggregateMap.set(normalizedName, existing);
  }

  return Array.from(judgeAggregateMap.entries())
    .map(([judgeName, stats]) => ({
      judgeName,
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

/**
 * Fetch summary data for judge stats aggregation (when filters are active)
 */
export async function fetchJudgeSummaryData(
  context: StatsContext,
  licenseKey: string
): Promise<StatsQueryResult[]> {
  let query = supabase
    .from('view_stats_summary')
    .select('*')
    .eq('license_key', licenseKey);

  // Apply level filters (only show and trial, not class for judge stats)
  if (context.level === 'show' && context.showId) {
    query = query.eq('show_id', context.showId);
  } else if (context.level === 'trial' && context.trialId) {
    query = query.eq('trial_id', context.trialId);
  }

  query = applyCommonFilters(query, context.filters);

  const { data, error } = await query;
  if (error) throw error;

  return data || [];
}

// ========================================
// FASTEST TIMES
// ========================================

/**
 * Fetch and process fastest times
 */
export async function fetchFastestTimes(
  context: StatsContext,
  licenseKey: string
): Promise<{ fastestTimes: FastestTimeEntry[]; fastestTime: FastestTimeEntry | null }> {
  let query = supabase
    .from('view_fastest_times')
    .select('*')
    .eq('license_key', licenseKey);

  query = applyLevelFilters(query, context);

  // Apply filters (view_fastest_times has breed, element, level)
  if (context.filters.breed) query = query.eq('dog_breed', context.filters.breed);
  if (context.filters.element) query = query.eq('element', context.filters.element);
  if (context.filters.level) query = query.eq('level', context.filters.level);
  if (context.filters.classId) query = query.eq('class_id', context.filters.classId);

  const { data, error } = await query;
  if (error) throw error;

  // Filter to unique dogs (keep only fastest time per dog)
  const dogMap = new Map<string, FastestTimesQueryResult>();
  for (const time of data || []) {
    const existing = dogMap.get(time.armband_number);
    if (!existing || time.search_time_seconds < existing.search_time_seconds) {
      dogMap.set(time.armband_number, time);
    }
  }

  // Convert to array, sort by time, and assign ranks
  const sortedUniqueTimes = Array.from(dogMap.values())
    .sort((a, b) => a.search_time_seconds - b.search_time_seconds)
    .slice(0, 20);

  // Assign ranks with tie handling
  let currentRank = 1;
  const fastestTimes: FastestTimeEntry[] = sortedUniqueTimes.map((time, index) => {
    if (index > 0 && time.search_time_seconds !== sortedUniqueTimes[index - 1].search_time_seconds) {
      currentRank = index + 1;
    }

    return {
      entryId: time.entry_id,
      armbandNumber: time.armband_number,
      dogCallName: time.dog_call_name,
      handlerName: time.handler_name,
      dogBreed: time.dog_breed,
      searchTimeSeconds: time.search_time_seconds,
      timeRank: currentRank,
      element: time.element,
      level: time.level
    };
  });

  return {
    fastestTimes,
    fastestTime: fastestTimes.length > 0 ? fastestTimes[0] : null
  };
}

// ========================================
// CLEAN SWEEP DOGS
// ========================================

/**
 * Fetch clean sweep dogs (show level only)
 */
export async function fetchCleanSweepDogs(
  context: StatsContext,
  licenseKey: string
): Promise<CleanSweepDog[]> {
  if (context.level !== 'show') {
    return [];
  }

  let query = supabase
    .from('view_clean_sweep_dogs')
    .select('*')
    .eq('license_key', licenseKey)
    .eq('is_clean_sweep', true);

  if (context.showId) {
    query = query.eq('show_id', context.showId);
  }

  if (context.filters.breed) {
    query = query.eq('dog_breed', context.filters.breed);
  }

  const { data, error } = await query
    .order('dog_call_name')
    .limit(50);

  if (error) {
    logger.error('[Stats] Clean sweep query error:', error);
    throw error;
  }

  return (data || []).map((dog: CleanSweepQueryResult) => ({
    armbandNumber: dog.armband_number,
    dogCallName: dog.dog_call_name,
    handlerName: dog.handler_name,
    dogBreed: dog.dog_breed,
    elementsEntered: dog.elements_entered,
    elementsQualified: dog.elements_qualified,
    elementsList: dog.elements_list
  }));
}

// ========================================
// FILTER CHECKS
// ========================================

/**
 * Check if breed-related filters are active (requires in-app aggregation)
 */
export function hasBreedRelatedFilters(filters: StatsContext['filters']): boolean {
  return !!(
    filters.trialDate ||
    filters.trialNumber ||
    filters.element ||
    filters.level ||
    filters.judge ||
    filters.classId
  );
}

/**
 * Check if additional filters are active (requires in-app aggregation for judge stats)
 */
export function hasAdditionalFilters(filters: StatsContext['filters']): boolean {
  return !!(
    filters.breed ||
    filters.trialDate ||
    filters.element ||
    filters.level ||
    filters.classId
  );
}
