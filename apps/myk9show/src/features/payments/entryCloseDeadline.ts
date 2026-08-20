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
 * The other half of the guard's rule is what counts as "today": the server
 * compares against `(now() AT TIME ZONE show_tz)::date`, the show's own
 * calendar day, NOT the viewer's. `todayInTimeZone` below mirrors the
 * `calendarDateInTz` helper in the `stripe-checkout` edge function so the card
 * and the checkout gate agree at the boundary — otherwise an exhibitor in
 * Hawaii still reads "pay by Sep 14" after an Eastern show has rolled to
 * Sep 15 and checkout is already refusing them.
 *
 * This deliberately does NOT reuse `toLocalDateOnly`: its non-midnight branch
 * falls back to local getters, which is the wrong rule for a column whose day
 * is defined in UTC.
 */

/**
 * Same fallback the server guard and `getTrialTimezone` use, so an unknown
 * show timezone lands on the same day both sides of the wire.
 */
export const DEFAULT_SHOW_TIMEZONE = 'America/New_York';

/** A bare calendar day, `YYYY-MM-DD`. */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar day `instant` falls on in `timeZone`, as `YYYY-MM-DD`.
 *
 * `en-CA` renders exactly that shape, which is why the edge-function guard
 * uses it too. An unresolvable zone would make `Intl` throw, so callers pass a
 * zone already validated by `getTrialTimezone`; the catch is a last resort
 * that degrades to the viewer's day rather than blanking the card.
 */
function todayInTimeZone(instant: Date, timeZone: string): string | null {
  if (Number.isNaN(instant.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  }
}

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
 *    nothing is honest, and a red overdue banner would be alarming.
 *    Suppression fails safe in a way an assertion does not.
 *
 * "Past" is decided in the SHOW's timezone, matching the server guard — see
 * the module comment. Entries stay open through the whole of the close day, so
 * the close day itself is not past.
 *
 * The year is appended only when it differs from the current year, so the
 * common near-term show reads "Sep 14" and a distant one is never ambiguous.
 */
export function formatEntryCloseDeadline(
  day: string | null | undefined,
  now: Date = new Date(),
  timeZone: string = DEFAULT_SHOW_TIMEZONE
): string | null {
  if (!day || !DAY_PATTERN.test(day)) return null;

  // Both sides are `YYYY-MM-DD`, so a lexical compare IS a calendar compare.
  const today = todayInTimeZone(now, timeZone);
  if (!today || today > day) return null;

  const [year, month, date] = day.split('-').map(Number);
  const asUtc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date)));
  if (Number.isNaN(asUtc.getTime())) return null;

  // Compare against the show's current year for the same reason "past" uses
  // the show's day: on Dec 31 / Jan 1 the viewer and the show can disagree
  // about what year it is, and the year suffix would flicker between them.
  const currentYear = Number(today.slice(0, 4));

  // `timeZone: 'UTC'` pins the formatter to the same parts we just built, so
  // the rendered day can never differ from the stored one.
  return asUtc.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(Number(year) === currentYear ? {} : { year: 'numeric' }),
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
  now: Date = new Date(),
  timeZone: string = DEFAULT_SHOW_TIMEZONE
): string {
  const deadline = formatEntryCloseDeadline(day, now, timeZone);
  return deadline ? `${showName} - pay by ${deadline}` : showName;
}
