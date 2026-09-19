import type { ReportPhase } from './types';

/**
 * Where a show sits relative to a given day, for ordering the report picker's
 * four phase groups. `'unknown'` when the show has no usable start date — a
 * show still being built, or a read that has not landed.
 */
export type ShowTimePhase = 'before' | 'during' | 'after' | 'unknown';

/** The order the groups take when the show's own phase cannot be resolved. */
export const DEFAULT_REPORT_PHASE_ORDER: readonly ReportPhase[] = [
  'before',
  'during',
  'after',
  'anytime',
];

/**
 * `YYYY-MM-DD` for a Date, in LOCAL time.
 *
 * Deliberately not `toISOString()`, which converts to UTC first: west of
 * Greenwich that turns the evening of show day into the next calendar day, and
 * a secretary closing out at 7pm would watch the During group drop below After.
 * Show dates are stored as plain dates, so the comparison is string-on-string.
 */
function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Is this show upcoming, running, or over on `today`?
 *
 * Both bounds are INCLUSIVE: the first and last day of a show are show days.
 * A missing `endDate` means a one-day show, so the start date is also the end.
 * Only the first 10 characters of each value are compared, so a `date` and a
 * `timestamptz` both read as the calendar day they name.
 */
export function resolveShowTimePhase(
  show: { startDate?: string | null; endDate?: string | null } | null | undefined,
  today: Date = new Date()
): ShowTimePhase {
  const start = show?.startDate?.slice(0, 10);
  if (!start) return 'unknown';
  const end = show?.endDate?.slice(0, 10) || start;
  // A malformed range has no trustworthy phase. Without this guard, a date
  // before the start but after an earlier end is incorrectly reported as
  // `after`, which can put the report picker in the wrong operational order.
  if (end < start) return 'unknown';
  const now = toLocalDateKey(today);
  if (now < start) return 'before';
  if (now > end) return 'after';
  return 'during';
}

/**
 * The four groups, ordered NEAREST-IN-TIME FIRST.
 *
 * Richard's ruling (2026-09-18) was about the headings, not the order, and
 * nothing here is gated — every report stays listed under its own heading in
 * every state. But a fixed before/during/after order has a show-day cost the
 * regroup would otherwise have shipped silently: `before` is the largest bucket
 * (13 of 37; 11 of 25 on an AKC show), so Check-in Sheet and Score Sheet — the
 * two sheets a secretary prints all day — fell from positions 1 and 2 on
 * `origin/main` to 12 and 13, below the fold at 375px. That is a direct cost
 * against show-day reliability (REV-2341 lens Q, P2-Q2).
 *
 * So the group the secretary is standing in leads, then the other two by how
 * close they are to now, and `anytime` is always last because it is the
 * catch-all rather than a moment:
 *
 * - upcoming show → before · during · after · anytime
 * - running show  → during · after · before · anytime
 * - finished show → after · during · before · anytime
 * - unknown       → the default order
 *
 * Membership and headings are identical in all four cases.
 */
export function orderReportPhases(phase: ShowTimePhase): readonly ReportPhase[] {
  switch (phase) {
    case 'during':
      return ['during', 'after', 'before', 'anytime'];
    case 'after':
      return ['after', 'during', 'before', 'anytime'];
    case 'before':
    case 'unknown':
      return DEFAULT_REPORT_PHASE_ORDER;
  }
}
