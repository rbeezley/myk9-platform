/**
 * ONE rule for "is this a day-of-show entry?" (MYK9-642).
 *
 * Before this module the app made the same judgement twice and disagreed with
 * itself: the class step and `submit_show_entries` priced an entry at the
 * day-of-show tier from the show's start date, while `entries.is_day_of_show`
 * was never written at all by the wizard path, so a mail-in taken at the desk
 * on show day was charged $35 and then certified to UKC as a pre-entry.
 *
 * The predicate follows the registry's own definition, not the fee schedule:
 *
 *   UKC Nose Work rules, "Pre-entry and Pre-entry only" (docs/rulebooks/
 *   ukc-nose-work-rules.txt): "Pre-entries must be submitted by a specific date
 *   and are normally lower in price than day-of-trial entries."
 *   UKC, "Day-of-show entry": "Most clubs allow entries to be taken on the day
 *   of a show or trial."
 *   ASCA scent detection rules 1.5.11 names the same two buckets ("pre-entry
 *   and day-of-show entries").
 *
 * So an entry is a PRE-entry only while the pre-entry deadline has not passed.
 * Once `entry_close_date` is behind us — which for a non-official is the point
 * the server stops accepting entries at all (`submit_show_entries`' entry-close
 * guard) and past which only a secretary can add one — it is a day-of-show
 * entry. The show's start date is the fallback for a show with no close date
 * configured, and matches the fee tier the app has always applied.
 *
 * Boundaries match the server guard exactly (see the migration that rebuilds
 * `submit_show_entries` for MYK9-642):
 *   - `entry_close_date` and `start_date` are timestamptz stored at midnight
 *     UTC (project memory: entry_close/open are timestamptz midnight-UTC), so
 *     both are read as their UTC calendar date, never re-interpreted locally.
 *   - "today" is the calendar date in the show's entry-window timezone when one
 *     is known, exactly as the entry-open/entry-close guards compute it.
 *   - Entries are still OPEN on the close date itself, so day-of starts the day
 *     AFTER close (`>`), while the show's own start date counts (`>=`).
 *
 * Deliberately dependency-free: `getShowEntryFee` cannot import
 * `@/utils/dateLocal` (it drags LoggingService into the tree and many
 * registration tests do not mock it), and calendar dates compare correctly as
 * `YYYY-MM-DD` strings without any Date arithmetic.
 */

export interface DayOfShowEntryContext {
  /** `shows.start_date` — timestamptz at midnight UTC, or a bare `YYYY-MM-DD`. */
  startDate?: string | null | undefined;
  /** `shows.entry_close_date` — timestamptz at midnight UTC, or `YYYY-MM-DD`. */
  entryCloseDate?: string | null | undefined;
  /** IANA zone of the show's first trial. Falls back to the browser's zone. */
  timeZone?: string | null | undefined;
  /** Injectable clock for tests. */
  now?: Date | undefined;
}

/**
 * The UTC calendar date of a show-window timestamp, as `YYYY-MM-DD`.
 * A bare `YYYY-MM-DD` is returned unchanged rather than parsed, so no timezone
 * is ever applied to a value that never carried one.
 */
export function utcCalendarDate(value?: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (!value.includes('T')) {
    const dateOnly = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

/** Today's calendar date in `timeZone` (browser zone when absent), `YYYY-MM-DD`. */
export function currentCalendarDate(
  now: Date = new Date(),
  timeZone?: string | null | undefined
): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find(candidate => candidate.type === type)?.value ?? '';
      const formatted = `${part('year')}-${part('month')}-${part('day')}`;
      if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
    } catch {
      // An invalid IANA zone must not take the fee calculation down; fall
      // through to the browser's own calendar date.
    }
  }
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * True when an entry created right now is a day-of-show entry for the registry.
 *
 * This is the single source for BOTH the fee tier and `entries.is_day_of_show`.
 * Do not re-derive either one from a date comparison written inline.
 */
export function isDayOfShowEntry(context: DayOfShowEntryContext): boolean {
  const today = currentCalendarDate(context.now ?? new Date(), context.timeZone);
  const closeDay = utcCalendarDate(context.entryCloseDate);
  if (closeDay && today > closeDay) return true;
  const startDay = utcCalendarDate(context.startDate);
  if (startDay && today >= startDay) return true;
  return false;
}
