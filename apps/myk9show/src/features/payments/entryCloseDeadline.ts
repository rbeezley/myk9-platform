/**
 * The "by when" half of an exhibitor's amount due.
 *
 * My Payments used to answer only "how much": a total, a show name, and a pay
 * button, with no deadline anywhere. These helpers turn `shows.entry_close_date`
 * into the deadline phrase the amount-due card renders.
 *
 * **Timezone contract (the whole reason this is its own module).**
 * `shows.entry_close_date` is a `timestamptz`, but it stores a *calendar day*:
 * a close day typed as "2026-09-14" lands as `2026-09-14 00:00:00+00`. The
 * server-side entry-close guard (`submit_show_entries`, `stripe-checkout`)
 * therefore reads the intended day as `(entry_close_date AT TIME ZONE 'UTC')::date`
 * and never as a UTC instant. Every helper here does the same: the day is read
 * from the value's **UTC** parts and carried onward as a bare `YYYY-MM-DD`
 * string, so nothing downstream can re-convert it through a timezone and roll
 * it back a day (`new Date('2026-09-14T00:00:00Z')` is Sep 13 in every US zone
 * — that day-shift is a real, repeatedly-hit bug on other surfaces).
 *
 * This deliberately does NOT reuse `toLocalDateOnly`: its non-midnight branch
 * falls back to local getters, which is the wrong rule for a column whose day
 * is defined in UTC.
 */

import { formatDateLocal } from '@/utils/dateLocal';

/** A bare calendar day, `YYYY-MM-DD`. */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read the intended close *day* from a raw `entry_close_date` value.
 *
 * Accepts the timestamptz PostgREST and the replication store both return
 * ("2026-09-14T00:00:00+00:00") and a bare date-only string, which is what the
 * column looked like historically and what some fixtures still carry. Returns
 * `null` for absent or unparseable values — a show with no close date has no
 * deadline to state, which is a normal state, not an error.
 */
export function toEntryCloseDay(value: string | null | undefined): string | null {
  if (!value) return null;
  if (DAY_PATTERN.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // `toISOString` renders UTC parts — the intended day, per the contract above.
  return parsed.toISOString().slice(0, 10);
}

/**
 * The deadline phrase for a close day, or `null` when there is nothing safe to
 * say.
 *
 * `null` covers two cases the card must not render:
 *  - **No close date.** Nothing to promise.
 *  - **Close day already past.** "pay by Sep 14" printed on Sep 20 reads as an
 *    accusation the app cannot back up: entries close, but a balance owed on a
 *    closed show is settled with the club, not by a missed deadline. Saying
 *    nothing is honest; a red overdue banner would be alarming and, since
 *    "today" here is the *viewer's* calendar day rather than the show's
 *    timezone (which the balance summary does not carry), it could also be a
 *    day wrong. Suppression fails safe in a way an assertion does not.
 *
 * The year is appended only when it differs from the current year, so the
 * common near-term show reads "Sep 14" and a distant one is never ambiguous.
 */
export function formatEntryCloseDeadline(
  day: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!day || !DAY_PATTERN.test(day)) return null;

  // Both sides are `YYYY-MM-DD`, so a lexical compare IS a calendar compare.
  // `formatDateLocal` gives the viewer's own day, matching how the rest of the
  // balance summary decides what counts as past.
  const today = formatDateLocal(now);
  if (!today || today > day) return null;

  const [year, month, date] = day.split('-').map(Number);
  const asUtc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date)));
  if (Number.isNaN(asUtc.getTime())) return null;

  // `timeZone: 'UTC'` pins the formatter to the same parts we just built, so
  // the rendered day can never differ from the stored one.
  return asUtc.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(Number(year) === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/**
 * A show name carrying its deadline: "Spring Trial - pay by Sep 14", falling
 * back to the bare name when there is no deadline to state.
 *
 * Single composer for every place the card names a show, so the three call
 * sites cannot drift into three different separators or phrasings.
 */
export function formatShowWithEntryCloseDeadline(
  showName: string,
  day: string | null | undefined,
  now: Date = new Date()
): string {
  const deadline = formatEntryCloseDeadline(day, now);
  return deadline ? `${showName} - pay by ${deadline}` : showName;
}
