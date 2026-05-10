/**
 * useShowDayData — Two-tier polling hook for exhibitor show day detection
 * and live ring progress.
 *
 * Tier 1 (showDayCheck): Lightweight query every 60s to detect if today is a show day.
 * Tier 2 (showDayDetails + ringProgress): Full data every 30s, only when isShowDay=true.
 *
 * Adaptive timing: uses actual scored dog completion times (after 3+ scored)
 * instead of a fixed estimate.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { isCheckInStatus } from '@myk9/core';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import type {
  ShowDayData,
  ShowDayClass,
  ActiveShowInfo,
  ShowDayCheckRow,
  ShowDayDetailRow,
  RingProgressRow,
} from '@/types/show-day-types';
import { DEFAULT_MINUTES_PER_DOG, MIN_SCORED_FOR_ADAPTIVE } from '@/types/show-day-types';
import { getTodayLocal } from '@/utils/dateLocal';

/**
 * Compute estimated minutes until this exhibitor's run using adaptive timing.
 *
 * After MIN_SCORED_FOR_ADAPTIVE dogs have been scored, computes average pace
 * from consecutive scoring_completed_at timestamps. Before that, uses
 * DEFAULT_MINUTES_PER_DOG (3 min).
 */
export function computeEstimatedTime(
  myRunningOrder: number | null,
  scoredEntries: number,
  scoredTimestamps: Date[]
): number | null {
  if (myRunningOrder == null) return null;

  const dogsAhead = Math.max(0, myRunningOrder - scoredEntries - 1);
  if (dogsAhead === 0) return 0;

  let avgMinutes = DEFAULT_MINUTES_PER_DOG;

  if (scoredTimestamps.length >= MIN_SCORED_FOR_ADAPTIVE && scoredTimestamps.length >= 2) {
    const sorted = [...scoredTimestamps].sort((a, b) => a.getTime() - b.getTime());
    const firstMs = sorted[0].getTime();
    const lastMs = sorted[sorted.length - 1].getTime();
    const spanMinutes = (lastMs - firstMs) / 60_000;
    const intervals = sorted.length - 1;
    if (intervals > 0 && spanMinutes > 0) {
      avgMinutes = spanMinutes / intervals;
    }
  }

  return Math.round(dogsAhead * avgMinutes);
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/** Tier 1: Lightweight check — does this user have entries for trials today? */
async function fetchShowDayCheck(userId: string, today: string): Promise<ShowDayCheckRow[]> {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      id,
      trial:trials!inner(
        id, date,
        show:shows!inner(
          id, name, location, status, start_date, end_date,
          club:clubs(name)
        )
      )
    `
    )
    .eq('handler_id', userId)
    .eq('trial.date', today);

  if (error) throw error;
  return (data || []) as unknown as ShowDayCheckRow[];
}

/** Tier 2a: Full entry details for the exhibitor's classes today */
async function fetchShowDayDetails(userId: string, today: string): Promise<ShowDayDetailRow[]> {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      id, check_in_status, armband, run_order,
      is_scored, result_status, is_in_ring,
      dog:dogs!inner(id, call_name),
      class:classes!inner(
        id, name, element, level, status,
        total_entries_count, scored_count, ring_number
      ),
      trial:trials!inner(
        id, date,
        show:shows!inner(
          id, name, location, status,
          club:clubs(name)
        )
      )
    `
    )
    .eq('handler_id', userId)
    .eq('trial.date', today)
    .order('run_order', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as ShowDayDetailRow[];
}

/** Tier 2b: Ring progress for all entries in the exhibitor's classes */
async function fetchRingProgress(classIds: string[]): Promise<RingProgressRow[]> {
  if (classIds.length === 0) return [];

  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      class_id, is_in_ring, is_scored, scoring_completed_at, run_order,
      dog:dogs!inner(call_name)
    `
    )
    .in('class_id', classIds)
    .or('is_in_ring.eq.true,is_scored.eq.true')
    .order('scoring_completed_at', { ascending: true });

  if (error) throw error;
  return (data || []) as unknown as RingProgressRow[];
}

// ---------------------------------------------------------------------------
// Data transformation
// ---------------------------------------------------------------------------

/** Extract unique active shows from check rows */
export function extractActiveShows(rows: ShowDayCheckRow[]): ActiveShowInfo[] {
  const seen = new Set<string>();
  const shows: ActiveShowInfo[] = [];
  for (const row of rows) {
    const show = row.trial.show;
    if (seen.has(show.id)) continue;
    seen.add(show.id);
    shows.push({
      showId: show.id,
      showName: show.name,
      location: show.location || '',
      clubName: show.club?.name || '',
      trialDate: row.trial.date,
      showStatus: show.status,
    });
  }
  return shows;
}

/** Per-class ring progress aggregation */
export interface ClassProgress {
  scoredCount: number;
  currentDogInRing: string | null;
  scoredTimestamps: Date[];
}

export function buildClassProgressMap(progressRows: RingProgressRow[]): Map<string, ClassProgress> {
  const map = new Map<string, ClassProgress>();

  for (const row of progressRows) {
    let progress = map.get(row.class_id);
    if (!progress) {
      progress = { scoredCount: 0, currentDogInRing: null, scoredTimestamps: [] };
      map.set(row.class_id, progress);
    }

    if (row.is_in_ring) {
      progress.currentDogInRing = row.dog.call_name;
    }

    if (row.is_scored && row.scoring_completed_at) {
      progress.scoredCount++;
      progress.scoredTimestamps.push(new Date(row.scoring_completed_at));
    }
  }

  return map;
}

/** Transform detail rows + progress into ShowDayClass[] */
export function buildShowDayClasses(
  detailRows: ShowDayDetailRow[],
  progressMap: Map<string, ClassProgress>
): ShowDayClass[] {
  return detailRows.map((row): ShowDayClass => {
    const progress = progressMap.get(row.class.id);
    const scoredEntries = progress?.scoredCount ?? row.class.scored_count;
    const scoredTimestamps = progress?.scoredTimestamps ?? [];

    return {
      classId: row.class.id,
      className: row.class.name,
      element: row.class.element,
      level: row.class.level,
      dogCallName: row.dog.call_name,
      dogId: row.dog.id,
      armband: row.armband,
      entryId: row.id,
      totalEntries: row.class.total_entries_count,
      scoredEntries,
      currentDogInRing: progress?.currentDogInRing ?? null,
      myRunningOrder: row.run_order,
      estimatedTimeMinutes: computeEstimatedTime(row.run_order, scoredEntries, scoredTimestamps),
      ringNumber: row.class.ring_number,
      entryStatus:
        row.check_in_status != null && isCheckInStatus(row.check_in_status)
          ? row.check_in_status
          : 'no-status',
      isScored: row.is_scored,
      resultStatus: row.result_status,
      classStatus: row.class.status,
      showId: row.trial.show.id,
      showName: row.trial.show.name,
      trialDate: row.trial.date,
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShowDayData(): ShowDayData {
  const { userWithRoles } = useAuthContext();
  const userId = userWithRoles?.databaseUserId ?? '';

  // No useMemo — must recompute on each render so an overnight tab picks up the new date
  const today = getTodayLocal();

  // Tier 1: Lightweight check (60s interval, always active)
  const checkQuery = useQuery({
    queryKey: queryKeys.showDayCheck(userId),
    queryFn: () => fetchShowDayCheck(userId, today),
    enabled: !!userId,
    staleTime: 60_000,
    gcTime: 120_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const activeShows = useMemo(
    () => (checkQuery.data ? extractActiveShows(checkQuery.data) : []),
    [checkQuery.data]
  );
  const isShowDay = activeShows.length > 0;

  // Tier 2a: Full entry details (30s interval, only when show day)
  const detailsQuery = useQuery({
    queryKey: queryKeys.showDayDetails(userId),
    queryFn: () => fetchShowDayDetails(userId, today),
    enabled: !!userId && isShowDay,
    staleTime: 30_000,
    gcTime: 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Extract class IDs for ring progress query
  const classIds = useMemo(() => {
    if (!detailsQuery.data) return [];
    const ids = new Set<string>();
    for (const row of detailsQuery.data) {
      ids.add(row.class.id);
    }
    return [...ids];
  }, [detailsQuery.data]);

  // Tier 2b: Ring progress (30s interval, only when we have class IDs)
  const progressQuery = useQuery({
    queryKey: queryKeys.showDayRingProgress(userId, classIds),
    queryFn: () => fetchRingProgress(classIds),
    enabled: !!userId && isShowDay && classIds.length > 0,
    staleTime: 30_000,
    gcTime: 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  // Derive lastUpdated from React Query's dataUpdatedAt
  const lastUpdated = useMemo(
    () => (detailsQuery.dataUpdatedAt > 0 ? new Date(detailsQuery.dataUpdatedAt) : null),
    [detailsQuery.dataUpdatedAt]
  );

  // Build final data
  return useMemo((): ShowDayData => {
    const isLoading = checkQuery.isLoading || (isShowDay && detailsQuery.isLoading);
    const error = checkQuery.error ?? detailsQuery.error ?? progressQuery.error ?? null;
    const isStale =
      isShowDay && !detailsQuery.isLoading && detailsQuery.isError && detailsQuery.data != null;

    if (!isShowDay || !detailsQuery.data) {
      return {
        isShowDay,
        activeShows,
        activeShow: activeShows[0] ?? null,
        myClasses: [],
        nextUp: null,
        completedToday: [],
        stats: { total: 0, completed: 0, qualified: 0 },
        isLoading,
        error: error as Error | null,
        isStale: false,
        lastUpdated,
      };
    }

    const progressMap = buildClassProgressMap(progressQuery.data ?? []);
    const myClasses = buildShowDayClasses(detailsQuery.data, progressMap);

    const completedToday = myClasses.filter(c => c.isScored);
    const upcoming = myClasses.filter(c => !c.isScored);

    // nextUp: first unscored class, prefer by running order
    const nextUp =
      upcoming.length > 0
        ? upcoming.reduce((best, c) => {
            if (best.myRunningOrder == null) return c;
            if (c.myRunningOrder == null) return best;
            return c.myRunningOrder < best.myRunningOrder ? c : best;
          })
        : null;

    const qualified = completedToday.filter(c => c.resultStatus === 'qualified').length;

    return {
      isShowDay,
      activeShows,
      activeShow: activeShows[0] ?? null,
      myClasses,
      nextUp,
      completedToday,
      stats: {
        total: myClasses.length,
        completed: completedToday.length,
        qualified,
      },
      isLoading,
      error: error as Error | null,
      isStale,
      lastUpdated,
    };
  }, [
    isShowDay,
    activeShows,
    checkQuery.isLoading,
    checkQuery.error,
    detailsQuery.data,
    detailsQuery.isLoading,
    detailsQuery.isError,
    detailsQuery.error,
    progressQuery.data,
    progressQuery.error,
    lastUpdated,
  ]);
}
