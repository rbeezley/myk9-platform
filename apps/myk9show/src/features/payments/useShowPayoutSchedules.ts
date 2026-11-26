/**
 * Each club show's last day and timezone, for the payout promise (MYK9-1985).
 *
 * Read through the replication-backed shows-by-club query, never a direct
 * table read. The timezone is the show's first trial's zone through
 * getTrialTimezone (getEntryWindowTimezone), the same rule the server's
 * private.show_time_zone uses. A show the read does not return (not yet
 * synced, soft-deleted) has no schedule, and its row states the promise in
 * words instead of a date.
 */
import { useMemo } from 'react';
import { useShowsByClubQuery } from '@/hooks/queries/useShowsDatabase';
import type { Show } from '@/types/show-types';
import { getEntryWindowTimezone } from '@/utils/entryWindowDate';
import { showCalendarDay } from './payoutDeadline';

export interface ShowPayoutSchedule {
  lastDay: string;
  timeZone: string;
}

export function showPayoutSchedule(
  show: Pick<Show, 'endDate' | 'trials'>
): ShowPayoutSchedule | null {
  const lastDay = showCalendarDay(show.endDate);
  if (!lastDay) return null;
  const liveTrials = (show.trials ?? []).filter(trial => !trial.deletedAt);
  return { lastDay, timeZone: getEntryWindowTimezone(liveTrials) };
}

export function useShowPayoutSchedules(clubId: string): Map<string, ShowPayoutSchedule> {
  const { data } = useShowsByClubQuery(clubId);
  return useMemo(() => {
    const schedules = new Map<string, ShowPayoutSchedule>();
    for (const show of data ?? []) {
      const schedule = showPayoutSchedule(show);
      if (schedule) schedules.set(show.id, schedule);
    }
    return schedules;
  }, [data]);
}
