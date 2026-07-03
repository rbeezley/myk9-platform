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
 * - Compact table/record date (e.g. a row's created/submitted date, no
 *   competition-day significance): "Jul 3, 2026" — via {@link formatShortDate}.
 * - Record date + time together (e.g. a row's created/submitted instant):
 *   "Jul 3, 2:00 PM" — via {@link formatEntryDateTime}.
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

function isRenderableDate(isoStr: string): boolean {
  return !isNaN(toLocalDate(isoStr).getTime());
}

/** Compact show date range: "Aug 1–3, 2026" (single day: "Aug 1, 2026"). */
export function formatShowDateRange(
  startDate?: string | null,
  endDate?: string | null
): string {
  if (!startDate) return '';
  const end = endDate || startDate;
  if (!isRenderableDate(startDate) || !isRenderableDate(end)) return '';
  return formatDateRange(startDate, end, 'short', true);
}

export type EntryDateStyle = 'weekday' | 'long';

/**
 * A single competition day: "Sat, Aug 1, 2026" (weekday, default) or
 * "Saturday, August 1, 2026" (long — detail/confirmation headers).
 */
export function formatEntryDate(
  date?: string | null,
  opts: { style?: EntryDateStyle } = {}
): string {
  if (!date || !isRenderableDate(date)) return '';
  const parsed = toLocalDate(date);
  const style = opts.style ?? 'weekday';
  return parsed.toLocaleDateString(
    'en-US',
    style === 'long'
      ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
      : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
  );
}

/**
 * Compact record date, no weekday, no competition-day significance
 * (e.g. an entry's created/submitted date in a table row): "Jul 3, 2026".
 */
export function formatShortDate(value?: string | Date | null): string {
  if (!value) return '';
  const instant = value instanceof Date ? value : new Date(value);
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
  const instant = value instanceof Date ? value : new Date(value);
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
