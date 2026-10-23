/**
 * useShowDayData — Two-tier hook for exhibitor show day detection and live
 * ring progress.
 *
 * Replica-backed (MYK9-1368): all three queries read IndexedDB, not the
 * database, and this hook is mounted app-wide on every signed-in device, so a
 * timer meant a full replica scan every 30 s per device. They are refreshed
 * when the entries replica changes (coalesced to once per 15 s) and by one slow
 * 5 minute timer on the check query so the date rolls on an overnight tab.
 *
 * Tier 1 (showDayCheck): Lightweight query to detect if today is a show day.
 * Tier 2 (showDayDetails + ringProgress): Full data, only when isShowDay=true.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { isCheckInStatus } from '@myk9/core';
import { compareByRunOrder, type RunQueueEntry } from '@myk9/ringside/run-queue';
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
import { getTodayLocal } from '@/utils/dateLocal';
import { useEntriesReplicaInvalidation } from './useEntriesReplicaInvalidation';
import {
  fetchReplicatedRingProgress,
  fetchReplicatedShowDayCheck,
  fetchReplicatedShowDayDetails,
} from './showDayDataReplication';

// ---------------------------------------------------------------------------
// Query functions
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

/** Project a show-day class onto the shared run-queue shape so ordering is `compareByRunOrder`'s. */
function toRunQueueEntry(c: ShowDayClass): RunQueueEntry {
  return { id: c.entryId, armband: null, exhibitorOrder: c.myRunningOrder };
}

/** Per-class ring progress aggregation */
export interface ClassProgress {
  scoredCount: number;
  currentDogInRing: string | null;
}

export function buildClassProgressMap(progressRows: RingProgressRow[]): Map<string, ClassProgress> {
  const map = new Map<string, ClassProgress>();

  for (const row of progressRows) {
    let progress = map.get(row.class_id);
    if (!progress) {
      progress = { scoredCount: 0, currentDogInRing: null };
      map.set(row.class_id, progress);
    }

    if (row.is_in_ring) {
      progress.currentDogInRing = row.dog.call_name;
    }

    if (row.is_scored && row.scoring_completed_at) {
      progress.scoredCount++;
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
      ringNumber: null,
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

/** At most one replica-driven refresh per this window (MYK9-1368). */
export const SHOW_DAY_REPLICA_COALESCE_MS = 15_000;
/** The only timer: lets `getTodayLocal()` roll the date on an overnight tab. */
export const SHOW_DAY_DATE_ROLL_MS = 5 * 60_000;

export function useShowDayData(): ShowDayData {
  const { userWithRoles } = useAuthContext();
  const userId = userWithRoles?.databaseUserId ?? '';

  const queryClient = useQueryClient();

  // Tier 1: Lightweight check (always active). The one timer is the date roll.
  // The date is read at fetch time, not render time: with no polling an
  // overnight tab may not re-render before the 5 minute check runs.
  const checkQuery = useQuery({
    queryKey: queryKeys.showDayCheck(userId),
    queryFn: () => fetchReplicatedShowDayCheck(userId, getTodayLocal()),
    enabled: !!userId,
    staleTime: Infinity,
    gcTime: 120_000,
    refetchInterval: SHOW_DAY_DATE_ROLL_MS,
    refetchOnWindowFocus: true,
  });

  const activeShows = useMemo(
    () => (checkQuery.data ? extractActiveShows(checkQuery.data) : []),
    [checkQuery.data]
  );
  const isShowDay = activeShows.length > 0;

  // Tier 2a: Full entry details (only when show day). No timer: replica changes refresh it.
  const detailsQuery = useQuery({
    queryKey: queryKeys.showDayDetails(userId),
    queryFn: () => fetchReplicatedShowDayDetails(userId, getTodayLocal()),
    enabled: !!userId && isShowDay,
    staleTime: Infinity,
    gcTime: 60_000,
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

  // Tier 2b: Ring progress (only when we have class IDs). No timer, as above.
  const progressQuery = useQuery({
    queryKey: queryKeys.showDayRingProgress(userId, classIds),
    queryFn: () => fetchReplicatedRingProgress(classIds),
    enabled: !!userId && isShowDay && classIds.length > 0,
    staleTime: Infinity,
    gcTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // The replica is the source of truth: a score, check-in or sync that reaches
  // this device refreshes all three (ring progress by key prefix, since its key
  // carries the class ids).
  useEntriesReplicaInvalidation(
    [
      queryKeys.showDayCheck(userId),
      queryKeys.showDayDetails(userId),
      ['show-day', 'ring-progress', userId],
    ],
    SHOW_DAY_REPLICA_COALESCE_MS
  );

  // With staleTime Infinity, details cached for yesterday's show day would be
  // served as-is once the date rolls (or a show day starts after a quiet spell)
  // and no entry changed. Refetch them when the set of active show days changes.
  const activeDaysKey = activeShows.map(s => `${s.showId}@${s.trialDate}`).join('|');
  const previousDaysKey = useRef(activeDaysKey);
  useEffect(() => {
    if (previousDaysKey.current === activeDaysKey) return;
    previousDaysKey.current = activeDaysKey;
    void queryClient.invalidateQueries({ queryKey: queryKeys.showDayDetails(userId) });
    void queryClient.invalidateQueries({ queryKey: ['show-day', 'ring-progress', userId] });
  }, [activeDaysKey, queryClient, userId]);

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

    // nextUp: first unscored class by the shared run-queue order. A class with no
    // run order yet only wins when no other class has one.
    const nextUp = upcoming.reduce<ShowDayClass | null>((best, c) => {
      if (best == null) return c;
      if (c.myRunningOrder == null) return best;
      if (best.myRunningOrder == null) return c;
      return compareByRunOrder(toRunQueueEntry(c), toRunQueueEntry(best)) < 0 ? c : best;
    }, null);

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
