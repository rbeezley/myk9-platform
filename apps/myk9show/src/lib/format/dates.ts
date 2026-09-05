/**
 * Shared date/time formatting — the single app-facing module for rendering
 * show, trial, and entry dates (UX walk remediation plan, task 2.A).
 *
 * One date style per context; do not invent new ones at call sites:
 *
 * - Show date range (browse lists, show cards, tables, report headers):
 *   compact — "Aug 1–3, 2026" — via {@link formatShowDateRange}.
 * - Entry/trial date (the specific day someone competes: ringside headers,
 *   dog profile, My Shows rows): weekday compact — "Sat, Aug 1, 2026" — via
 *   {@link formatEntryDate}. Detail/confirmation headers use the long style —
 *   "Saturday, August 1, 2026" — via `formatEntryDate(date, { style: 'long' })`.
 * - Date-only supporting text, no weekday: "August 1, 2026" via
 *   {@link formatLongDate}, "Aug 1" via {@link formatMonthDay}, or
 *   "Sat, Aug 1" via {@link formatWeekdayMonthDay}.
 * - Compact CALENDAR date (a DATE-typed column with no weekday: entry
 *   open/close, a show's start day in a list): "Jan 2, 2027" — via
 *   {@link formatShortCalendarDate}.
 * - Compact table/record date (e.g. a row's created/submitted date, no
 *   competition-day significance): "Jul 3, 2026" — via {@link formatShortDate}.
 *   INSTANTS ONLY; a DATE column renders a day early through it.
 * - Record date + time together (e.g. a row's created/submitted instant):
 *   "Jul 3, 2:00 PM" — via {@link formatEntryDateTime}.
 * - Full record date + time where the year matters (printable receipts,
 *   audit-like output): "Jul 3, 2026, 2:00 PM" — via
 *   {@link formatRecordDateTime}.
 * - Clock times (trial start, briefing, check-in): "8:30 AM" — via
 *   {@link formatTime}, passing the trial's IANA zone from
 *   `getTrialTimezone(trial)` (`@/features/registries`).
 *
 * Timezone model: DATE-typed columns (start_date, end_date, trial_date,
 * entry_open/close_date) are calendar dates with no timezone — they parse as
 * local midnight (never `new Date('YYYY-MM-DD')`, which parses as UTC and
 * shifts a day for western-hemisphere viewers). Only instants (timestamptz)
 * are timezone-sensitive and take a `timeZone`.
 *
 * Missing or unparseable input renders as '' — callers own their placeholder
 * (e.g. the 2.F armband rule's "—").
 */
import { formatDateRange, toLocalDate, toLocalDateOnly } from '@/utils/date-format';

export { toLocalDate, toLocalDateOnly };

function resolveCalendarDate(value: string | Date): Date {
  return value instanceof Date ? value : toLocalDate(value);
}

function isRenderableCalendarDate(value: string | Date): boolean {
  return !isNaN(resolveCalendarDate(value).getTime());
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A bare `YYYY-MM-DD` string is a DATE column with no timezone — parsing it
 * with `new Date(str)` reads as UTC midnight and renders a day early for
 * western-hemisphere viewers. Route it through `toLocalDate` instead; a
 * value that already carries a time component (or a `Date` instance) is a
 * real instant and is used as-is.
 */
function resolveInstant(value: string | Date): Date {
  if (value instanceof Date) return value;
  return DATE_ONLY.test(value) ? toLocalDate(value) : new Date(value);
}

/** Compact show date range: "Aug 1–3, 2026" (single day: "Aug 1, 2026"). */
export function formatShowDateRange(startDate?: string | null, endDate?: string | null): string {
  if (!startDate) return '';
  const end = endDate || startDate;
  if (!isRenderableCalendarDate(startDate) || !isRenderableCalendarDate(end)) return '';
  return formatDateRange(startDate, end, 'short', true);
}

export type EntryDateStyle = 'weekday' | 'long';

/**
 * A single competition day: "Sat, Aug 1, 2026" (weekday, default) or
 * "Saturday, August 1, 2026" (long — detail/confirmation headers).
 */
export function formatEntryDate(
  date?: string | Date | null,
  opts: { style?: EntryDateStyle } = {}
): string {
  if (!date || !isRenderableCalendarDate(date)) return '';
  const parsed = resolveCalendarDate(date);
  const style = opts.style ?? 'weekday';
  return parsed.toLocaleDateString(
    'en-US',
    style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
  );
}

/** A date-only value without weekday: "August 1, 2026". */
export function formatLongDate(value?: string | Date | null): string {
  if (!value || !isRenderableCalendarDate(value)) return '';
  return resolveCalendarDate(value).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** A numeric date-only value: "8/1/2026". */
export function formatDateOnly(value?: string | Date | null): string {
  if (!value || !isRenderableCalendarDate(value)) return '';
  return resolveCalendarDate(value).toLocaleDateString('en-US');
}

/** A tight date label without year: "Aug 1". */
export function formatMonthDay(value?: string | Date | null): string {
  if (!value || !isRenderableCalendarDate(value)) return '';
  return resolveCalendarDate(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** A tight date label with weekday but no year: "Sat, Aug 1". */
export function formatWeekdayMonthDay(value?: string | Date | null): string {
  if (!value || !isRenderableCalendarDate(value)) return '';
  return resolveCalendarDate(value).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Compact CALENDAR date, no weekday: "Jan 2, 2027".
 *
 * The calendar-safe twin of {@link formatShortDate}. Use it for every
 * DATE-typed column — `shows.start_date` / `end_date` / `entry_open_date` /
 * `entry_close_date`, `trials.trial_date` — which round-trip as midnight-UTC
 * timestamps and render a day early through any instant formatter west of
 * UTC. Reserve {@link formatShortDate} for genuine instants (`created_at`,
 * `reviewed_at`, …).
 */
export function formatShortCalendarDate(value?: string | Date | null): string {
  if (!value || !isRenderableCalendarDate(value)) return '';
  return resolveCalendarDate(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Compact record date, no weekday, no competition-day significance
 * (e.g. an entry's created/submitted date in a table row): "Jul 3, 2026".
 *
 * This is an INSTANT formatter — for a DATE-typed column use
 * {@link formatShortCalendarDate} instead.
 */
export function formatShortDate(value?: string | Date | null): string {
  if (!value) return '';
  const instant = resolveInstant(value);
  if (isNaN(instant.getTime())) return '';
  return instant.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Record date + time together (e.g. an entry's created/submitted instant):
 * "Jul 3, 2:00 PM".
 */
export function formatEntryDateTime(value?: string | Date | null): string {
  if (!value) return '';
  const instant = resolveInstant(value);
  if (isNaN(instant.getTime())) return '';
  return instant
    .toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    .replace(/\u202f/g, ' ');
}

/**
 * Full record date + time where the year matters (printable receipts,
 * audit-like output): "Jul 3, 2026, 2:00 PM".
 */
export function formatRecordDateTime(value?: string | Date | null): string {
  if (!value) return '';
  const instant = resolveInstant(value);
  if (isNaN(instant.getTime())) return '';
  return instant
    .toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/\u202f/g, ' ');
}

/**
 * Clock time for an instant: "8:30 AM". Pass the trial's IANA zone from
 * `getTrialTimezone(trial)` so show-day times read in ring-local time;
 * without one it falls back to the viewer's timezone.
 */
export function formatTime(value?: string | Date | null, timeZone?: string): string {
  if (!value) return '';
  const instant = value instanceof Date ? value : new Date(value);
  if (isNaN(instant.getTime())) return '';
  return instant
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    })
    .replace(/\u202f/g, ' ');
}
