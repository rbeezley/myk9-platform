/**
 * When each registry wants a show's results (MYK9-2117). One module for the Finish the show list
 * and the deadline reminder email (MYK9-2077), so both name the same date.
 *
 * Deno-safe on purpose: no imports, no DOM, no app code. The app re-exports it through
 * `@/features/registries`.
 *
 * Sources (checked against `docs/rulebooks/`, confirmed by the owner 2026-11-17):
 * - AKC: the results packet must reach AKC within 7 days after the event (Scent Work
 *   Regulations ch. 3 sec. 37). It is an ARRIVAL date; email to eresults@akc.org is allowed.
 * - ASCA: results and event dues within 15 days of the event end date (Gross Receipts Report and
 *   Scent Trial Report forms).
 * - UKC: no deadline appears in our copy of the rules, so none is modelled. A date we have not
 *   verified is never shown.
 */

export interface ResultsDeadlineRule {
  /** Calendar days after the LAST trial day (day 0 is the trial day itself). */
  days: number;
  /** `true` when the paperwork must have ARRIVED by the date, not merely been sent. */
  mustArrive: boolean;
}

export const RESULTS_DEADLINE_RULES: Readonly<Record<string, ResultsDeadlineRule | null>> = {
  AKC: { days: 7, mustArrive: true },
  ASCA: { days: 15, mustArrive: false },
  UKC: null,
};

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * The calendar day (`YYYY-MM-DD`) a trial date falls on in the show's own time zone, or `null`
 * when it cannot be read. A bare date, or the midnight-UTC form a DATE column round-trips as
 * (`2026-08-01T00:00:00+00:00`), already IS the calendar day and is not shifted; any other
 * timestamp is a real instant and is converted into `timeZone`.
 */
export function calendarDayInZone(
  value: string | null | undefined,
  timeZone: string
): string | null {
  if (!value) return null;
  const text = value.trim();
  const dateOnly = /^(\d{4}-\d{2}-\d{2})(?:[T ]00:00:00(?:\.0+)?(?:Z|[+-]00(?::?00)?)?)?$/.exec(
    text
  );
  if (dateOnly?.[1]) return dateOnly[1];
  const instant = new Date(text);
  if (Number.isNaN(instant.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const get = (type: string) => parts.find(part => part.type === type)?.value;
    const [year, month, day] = [get('year'), get('month'), get('day')];
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

/** The latest of the show's trial days, each read in its own time zone; `null` when none reads. */
export function lastTrialDay(
  trials: readonly { date: string | null | undefined; timeZone: string }[]
): string | null {
  let last: string | null = null;
  for (const trial of trials) {
    const day = calendarDayInZone(trial.date, trial.timeZone);
    if (day && (last === null || day > last)) last = day;
  }
  return last;
}

/** `YYYY-MM-DD` plus `days` calendar days (month ends and leap years handled). */
export function addCalendarDays(day: string, days: number): string | null {
  const match = DAY_RE.exec(day);
  if (!match) return null;
  const moment = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

/**
 * The date a registry wants the results by (`YYYY-MM-DD`), counted from the last trial day.
 * `null` when the registry has no verified deadline or the last day is unknown.
 */
export function resultsDeadlineFor(
  registryId: string,
  lastDay: string | null | undefined
): string | null {
  const rule = RESULTS_DEADLINE_RULES[registryId] ?? null;
  if (!rule || !lastDay) return null;
  return addCalendarDays(lastDay, rule.days);
}

/** `Tue, Nov 24`, the weekday and day a secretary reads off a calendar. */
export function formatDeadlineDay(day: string): string | null {
  const match = DAY_RE.exec(day);
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  ).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The line's wording: AKC's date is an arrival date, so it says so. `null` = no date to show. */
export function describeResultsDeadline(
  registryId: string,
  deadline: string | null | undefined
): string | null {
  const rule = RESULTS_DEADLINE_RULES[registryId] ?? null;
  const text = deadline ? formatDeadlineDay(deadline) : null;
  if (!rule || !text) return null;
  return rule.mustArrive ? `Due at ${registryId} by ${text}` : `Due to ${registryId} by ${text}`;
}
