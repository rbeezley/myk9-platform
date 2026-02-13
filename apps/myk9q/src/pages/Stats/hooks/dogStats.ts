import { supabase } from '@/lib/supabase';
import type {
  StatsContext,
  BreedStat,
  CleanSweepDog,
  FastestTimeEntry,
  BreedStatsQueryResult,
  CleanSweepQueryResult,
  FastestTimesQueryResult,
  StatsQueryResult
} from '../types/stats.types';
import { logger } from '@/utils/logger';
import { applyLevelFilters } from './eventStats';

// ========================================
// BREED STATS
// ========================================

export function aggregateBreedStatsFromData(
  statsData: StatsQueryResult[],
  completedClassIds?: Set<number> | null
): BreedStat[] {
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
      const isFromCompletedClass = !completedClassIds || (entry.class_id && completedClassIds.has(Number(entry.class_id)));
      if (entry.search_time_seconds && entry.search_time_seconds > 0 && isFromCompletedClass) {
        existing.qualifiedTimes.push(entry.search_time_seconds);
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

export async function fetchBreedStatsFromView(
  context: StatsContext,
  licenseKey: string,
  completedClassIds?: Set<number> | null
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

    const isFromCompletedClass = !completedClassIds || (row.class_id && completedClassIds.has(Number(row.class_id)));

    if (row.fastest_time && row.fastest_time > 0 && isFromCompletedClass) {
      if (existing.fastestTime === null || row.fastest_time < existing.fastestTime) {
        existing.fastestTime = row.fastest_time;
      }
    }

    if (row.avg_time && row.avg_time > 0 && row.qualified_count > 0 && isFromCompletedClass) {
      for (let i = 0; i < row.qualified_count; i++) {
        existing.qualifiedTimes.push(row.avg_time);
      }
    }

    breedMap.set(breed, existing);
  }

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
// FASTEST TIMES
// ========================================

export async function fetchFastestTimes(
  context: StatsContext,
  licenseKey: string,
  restrictToCompletedClasses: boolean = false
): Promise<{ fastestTimes: FastestTimeEntry[]; fastestTime: FastestTimeEntry | null }> {
  let query = supabase
    .from('view_fastest_times')
    .select('*')
    .eq('license_key', licenseKey);

  query = applyLevelFilters(query, context);

  if (context.filters.breed) query = query.eq('dog_breed', context.filters.breed);
  if (context.filters.element) query = query.eq('element', context.filters.element);
  if (context.filters.level) query = query.eq('level', context.filters.level);
  if (context.filters.classId) query = query.eq('class_id', context.filters.classId);

  const { data, error } = await query;
  if (error) throw error;

  let filteredData = data || [];
  if (restrictToCompletedClasses && filteredData.length > 0) {
    const classIds = [...new Set(filteredData.map(d => d.class_id).filter(Boolean))];

    if (classIds.length > 0) {
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('id, class_status, is_scoring_finalized')
        .in('id', classIds);

      if (classError) {
        logger.error('Error fetching class statuses for visibility filter:', classError);
      } else if (classData) {
        const completedClassIds = new Set(
          classData
            .filter(c => c.class_status === 'completed' || c.is_scoring_finalized === true)
            .map(c => c.id)
        );

        filteredData = filteredData.filter(d => d.class_id && completedClassIds.has(d.class_id));
        logger.log(`📊 Stats: Filtered fastest times to ${filteredData.length} entries from ${completedClassIds.size} completed classes`);
      }
    }
  }

  const dogMap = new Map<string, FastestTimesQueryResult>();
  for (const time of filteredData) {
    const existing = dogMap.get(time.armband_number);
    if (!existing || time.search_time_seconds < existing.search_time_seconds) {
      dogMap.set(time.armband_number, time);
    }
  }

  const sortedUniqueTimes = Array.from(dogMap.values())
    .sort((a, b) => a.search_time_seconds - b.search_time_seconds)
    .slice(0, 20);

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
      level: time.level,
      classId: time.class_id ? Number(time.class_id) : undefined
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
