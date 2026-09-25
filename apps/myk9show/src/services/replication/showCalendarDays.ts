import { toLocalDateOnly } from '@/utils/date-format';
import { toEntryCloseDay } from '@/features/payments/entryCloseDeadline';

/**
 * MYK9-716: the rule for writing a show's date columns.
 *
 * `start_date`, `end_date`, `entry_open_date` and `entry_close_date` are
 * timestamptz holding midnight UTC of a calendar day, and every server guard
 * reads `(col AT TIME ZONE 'UTC')::date`. Two kinds of value reach a write:
 *
 * - A date the user just TYPED is a picker instant (local midnight, or an
 *   evening time) that can sit on a different UTC day. It becomes its local
 *   calendar day through `toLocalDateOnly`, the same helper and semantics as
 *   the wizard's online create (buildCreateShowPayload).
 * - A date the row already STORED (read back from the server, or typed and
 *   normalized earlier) keeps the UTC calendar day the guards read. Reading it
 *   through `toLocalDateOnly` instead would move a legacy non-midnight value a
 *   day in some timezones (Codex P2); migration 20260925023700 also rewrites
 *   any such value to midnight UTC.
 */
const SHOW_DATE_FIELDS = ['startDate', 'endDate', 'entryOpenDate', 'entryCloseDate'] as const;

type ShowDateField = (typeof SHOW_DATE_FIELDS)[number];
type ShowDates = Partial<Record<ShowDateField, string | undefined>>;

/**
 * Normalize the dates in `values` that the user typed: every date field
 * present, except one equal to the value already `stored` for it (a full-row
 * save re-sends untouched dates, which must keep their stored day).
 */
export function withTypedDays<T extends ShowDates>(values: T, stored: ShowDates = {}): T {
  const result: T = { ...values };
  for (const field of SHOW_DATE_FIELDS) {
    if (!(field in values)) continue;
    const value = values[field];
    if (!value || value === stored[field]) continue;
    result[field] = toLocalDateOnly(value) as T[ShowDateField];
  }
  return result;
}

/** The calendar day a stored value names, as the server guards read it. */
export function withStoredDays<T extends ShowDates>(show: T): T {
  const result: T = { ...show };
  for (const field of SHOW_DATE_FIELDS) {
    const value = show[field];
    if (value) result[field] = (toEntryCloseDay(value) ?? value) as T[ShowDateField];
  }
  return result;
}
