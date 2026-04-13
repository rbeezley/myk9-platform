import { supabase } from '@/lib/supabase';
import type {
  StatsData,
  StatsContext,
  StatsQueryResult
} from '../types/stats.types';
import { logger } from '@/utils/logger';

// ========================================
// CONSTANTS
// ========================================

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

export function calculateBasicCounts(statsData: StatsQueryResult[]): BasicCounts {
  const totalEntries = statsData.length;
  const scoredEntries = statsData.filter(e => e.is_scored).length;
  const qualifiedCount = statsData.filter(e => e.result_status === 'qualified').length;
  const nqCount = statsData.filter(e => e.result_status === 'nq').length;
  const excusedCount = statsData.filter(e => e.result_status === 'excused').length;
  const absentCount = statsData.filter(e => e.result_status === 'absent').length;
  const withdrawnCount = statsData.filter(e => e.result_status === 'withdrawn').length;

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

export function calculateRates(counts: BasicCounts): Rates {
  const { scoredEntries, qualifiedCount, nqCount, excusedCount, absentCount, withdrawnCount } = counts;
  const attempts = qualifiedCount + nqCount + excusedCount;

  return {
    qualificationRate: attempts > 0 ? (qualifiedCount / attempts) * 100 : 0,
    nqRate: attempts > 0 ? (nqCount / attempts) * 100 : 0,
    excusedRate: attempts > 0 ? (excusedCount / attempts) * 100 : 0,
    absentRate: scoredEntries > 0 ? (absentCount / scoredEntries) * 100 : 0,
    withdrawnRate: scoredEntries > 0 ? (withdrawnCount / scoredEntries) * 100 : 0
  };
}

export function calculateTimeStats(statsData: StatsQueryResult[]): TimeStats {
  const validTimes = statsData
    .filter(e => e.result_status === 'qualified' && e.search_time_seconds && e.search_time_seconds > 0)
    .map(e => e.search_time_seconds as number)
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

export function calculateTimeStatsFiltered(
  statsData: StatsQueryResult[],
  completedClassIds: Set<number> | null
): TimeStats {
  const filteredData = completedClassIds
    ? statsData.filter(e => e.class_id && completedClassIds.has(Number(e.class_id)))
    : statsData;

  const validTimes = filteredData
    .filter(e => e.result_status === 'qualified' && e.search_time_seconds && e.search_time_seconds > 0)
    .map(e => e.search_time_seconds as number)
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

interface SupabaseQueryBuilder {
  eq: (column: string, value: string | number) => SupabaseQueryBuilder;
}

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
// TOTAL ENTRIES COUNT
// ========================================

export async function fetchTotalEntriesCount(
  context: StatsContext,
  licenseKey: string
): Promise<number> {
  try {
    let classIds: string[] = [];

    if (context.level === 'class' && context.classId) {
      classIds = [context.classId];
    } else if (context.level === 'trial' && context.trialId) {
      let classQuery = supabase
        .from('classes')
        .select('id')
        .eq('trial_id', context.trialId);

      if (context.filters.element) classQuery = classQuery.eq('element', context.filters.element);
      if (context.filters.level) classQuery = classQuery.eq('level', context.filters.level);

      const { data } = await classQuery;
      classIds = data?.map(c => c.id) || [];
    } else if (context.level === 'show' && context.showId) {
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

    let query = supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('license_key', licenseKey)
      .in('class_id', classIds);

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
// COMPLETED CLASS IDS HELPER
// ========================================

export async function fetchCompletedClassIds(
  context: StatsContext,
  _licenseKey: string
): Promise<Set<number> | null> {
  let classIds: number[] = [];

  if (context.level === 'class' && context.classId) {
    classIds = [Number(context.classId)];
  } else if (context.level === 'trial' && context.trialId) {
    const { data } = await supabase
      .from('classes')
      .select('id')
      .eq('trial_id', context.trialId);
    classIds = data?.map(c => Number(c.id)) || [];
  } else if (context.level === 'show' && context.showId) {
    const { data: trialIds } = await supabase
      .from('trials')
      .select('id')
      .eq('show_id', context.showId);

    if (trialIds && trialIds.length > 0) {
      const { data } = await supabase
        .from('classes')
        .select('id')
        .in('trial_id', trialIds.map(t => t.id));
      classIds = data?.map(c => Number(c.id)) || [];
    }
  }

  if (classIds.length === 0) {
    return new Set();
  }

  const { data: classData, error } = await supabase
    .from('classes')
    .select('id, class_status, is_scoring_finalized')
    .in('id', classIds);

  if (error) {
    logger.error('Error fetching class statuses:', error);
    return new Set();
  }

  const completedIds = new Set(
    (classData || [])
      .filter(c => c.class_status === 'completed' || c.is_scoring_finalized === true)
      .map(c => Number(c.id))
  );

  logger.log(`📊 Stats: Found ${completedIds.size} completed classes out of ${classIds.length} total`);

  return completedIds;
}

// ========================================
// FILTER CHECKS
// ========================================

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

export function hasAdditionalFilters(filters: StatsContext['filters']): boolean {
  return !!(
    filters.breed ||
    filters.trialDate ||
    filters.element ||
    filters.level ||
    filters.classId
  );
}
