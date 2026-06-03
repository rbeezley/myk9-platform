/**
 * Pure, date-aware statistics for MyEntriesPage.
 *
 * These helpers are the single source of truth for the "Upcoming Shows" and
 * "Past Shows" summary counts. They exist to fix two long-standing defects:
 *
 *  1. The cards are labelled "Shows" but historically counted *entries*, so an
 *     exhibitor with 6 entries across 3 shows saw "6 Past Shows".
 *  2. "Past" was decided with a live-timestamp comparison against `start_date`,
 *     so a multi-day show that started earlier but is *still running today* was
 *     bucketed as past (and never as upcoming). That disagreed with the
 *     date-range-aware "Show today" banner (get_account_today_entries RPC).
 *
 * The rule here is day-granular and end-date aware: a show is past only once
 * its final day is before today.
 *
 * @module MyEntriesPage/stats
 */

import { parseLocalDateString } from '@/utils/dateLocal';
import type { MyEntry } from './my-entries-types';

/**
 * Parse a show date that may be a date-only string ("YYYY-MM-DD") or a full
 * timestamp.
 *
 * `new Date("2026-06-02")` parses as **UTC** midnight, which in a negative-offset
 * zone (e.g. America/Chicago) becomes the *previous* local day — so a show
 * ending today would be read as yesterday and wrongly bucketed "past". For
 * date-only strings we build a local-midnight Date instead; full timestamps
 * (which already carry an offset) fall through to the native parser.
 */
export function parseShowDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const local = parseLocalDateString(value); // only matches bare YYYY-MM-DD
  if (local) return local;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** Midnight (local) for the given date — strips the time component. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The last calendar day a show runs — its end date when known, else the start date. */
function showLastDay(entry: MyEntry): Date {
  return entry.showEndDate ?? entry.showDate;
}

/**
 * A show is "past" only once its final day is before today. A multi-day show
 * that started earlier but is still running today is NOT past.
 */
export function isPastShowEntry(entry: MyEntry, now: Date): boolean {
  return startOfLocalDay(showLastDay(entry)).getTime() < startOfLocalDay(now).getTime();
}

export interface MyEntriesShowDateStats {
  /** Distinct shows whose final day is before today. */
  pastShows: number;
  /** Distinct shows that are running today or in the future. */
  upcomingShows: number;
  /** Entries belonging to a non-past (current or future) show. */
  upcomingEntries: number;
}

/** Stable key for de-duplicating shows; falls back to name+date for legacy rows without an id. */
function showKey(entry: MyEntry): string {
  return entry.showId || `${entry.showName}|${entry.showDate.getTime()}`;
}

/**
 * Compute show-date-derived stats from the user's entries.
 *
 * Counts DISTINCT shows (deduped by show), not entries — the cards are labelled
 * "Past Shows" / "Upcoming Shows".
 */
export function computeMyEntriesShowDateStats(
  entries: MyEntry[],
  now: Date
): MyEntriesShowDateStats {
  const pastShowIds = new Set<string>();
  const upcomingShowIds = new Set<string>();
  let upcomingEntries = 0;

  for (const entry of entries) {
    if (isPastShowEntry(entry, now)) {
      pastShowIds.add(showKey(entry));
    } else {
      upcomingShowIds.add(showKey(entry));
      upcomingEntries += 1;
    }
  }

  return {
    pastShows: pastShowIds.size,
    upcomingShows: upcomingShowIds.size,
    upcomingEntries,
  };
}
