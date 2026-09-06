import type { Show } from '@/types/show-types';
import { getEntryStatus } from '@/utils/entryStatusUtils';

/** How a show's entry status is drawn on a month tile. */
export type MonthDot = 'open' | 'closing' | 'muted';

export interface MonthTile {
  /** `'all'` for the All-upcoming tile, else `YYYY-MM` (local calendar). */
  key: string;
  /** Short label: `ALL` or a three-letter month. */
  label: string;
  /** Four-digit year, shown only when a tile starts a new year. */
  year: number | null;
  count: number;
  /** One dot per show in date order, capped at `MAX_DOTS`. */
  dots: MonthDot[];
  isPast: boolean;
}

export const MONTHS_BACK = 3;
export const MONTHS_AHEAD = 12;
export const MAX_DOTS = 6;
export const ALL_MONTHS_KEY = 'all';

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `YYYY-MM` from local calendar components of a date-only or ISO string. */
export function monthKeyOf(dateValue: string | undefined): string | null {
  if (!dateValue) return null;
  const [year, month] = dateValue.split('T')[0].split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Whether a URL value is a well-formed month key; anything else is ignored. */
export function isMonthKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && MONTH_KEY_PATTERN.test(value);
}

function keyFor(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function dotFor(show: Show): MonthDot {
  const status = getEntryStatus(show).status;
  if (status === 'closing_soon') return 'closing';
  if (status === 'accepting' || status === 'submitted') return 'open';
  return 'muted';
}

function isUpcoming(show: Show, startOfToday: Date): boolean {
  const end = show.endDate || show.startDate;
  const [y, m, d] = end.split('T')[0].split('-').map(Number);
  if (![y, m, d].every(Number.isFinite)) return false;
  return new Date(y, m - 1, d) >= startOfToday;
}

/**
 * Build the scrubber tiles: an All-upcoming tile followed by one tile per month
 * from `MONTHS_BACK` months before `now` through `MONTHS_AHEAD` months after.
 * Shows outside that window are counted on no tile (the All tile still counts
 * upcoming ones); a show with no parseable start date is skipped.
 */
export function buildMonthTiles(shows: Show[], now: Date = new Date()): MonthTile[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentKey = keyFor(now.getFullYear(), now.getMonth());
  const sorted = [...shows].sort((a, b) => a.startDate.localeCompare(b.startDate));

  const byMonth = new Map<string, Show[]>();
  for (const show of sorted) {
    const key = monthKeyOf(show.startDate);
    if (!key) continue;
    const bucket = byMonth.get(key) ?? [];
    bucket.push(show);
    byMonth.set(key, bucket);
  }

  const upcoming = sorted.filter(show => isUpcoming(show, startOfToday));
  const tiles: MonthTile[] = [
    {
      key: ALL_MONTHS_KEY,
      label: 'ALL',
      year: null,
      count: upcoming.length,
      dots: upcoming.slice(0, MAX_DOTS).map(dotFor),
      isPast: false,
    },
  ];

  let previousYear: number | null = null;
  for (let offset = -MONTHS_BACK; offset <= MONTHS_AHEAD; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const key = keyFor(date.getFullYear(), date.getMonth());
    const bucket = byMonth.get(key) ?? [];
    const year = date.getFullYear();
    tiles.push({
      key,
      label: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      year: year !== previousYear ? year : null,
      count: bucket.length,
      dots: bucket.slice(0, MAX_DOTS).map(dotFor),
      isPast: key < currentKey,
    });
    previousYear = year;
  }
  return tiles;
}
