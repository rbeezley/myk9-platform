/**
 * eventSelection — decides WHICH events a show's feed carries.
 *
 * Pure (no Deno APIs) so vitest covers it directly, same as icsBuilder.ts.
 * This is the half of MYK9-506 that mattered: the builder could always render
 * a trial-day block, but nothing ever asked it to, so a show whose classes
 * carry no times produced a valid and entirely empty calendar.
 *
 * The rule, per trial the exhibitor has entries in:
 *   1. Any class with a real time  -> those class events, as before.
 *   2. Otherwise, a trial start    -> ONE block covering the trial day,
 *                                     actual if the day began, else planned.
 *   3. Neither                     -> nothing, and the subscribe dialog says so.
 *
 * Step 1 asks `hasResolvableTime` rather than re-reading start_time itself.
 * Two places deciding "is this timeable" is exactly how a feed comes to promise
 * an event it never emits.
 */

import {
  hasResolvableTime,
  type CalendarClassEvent,
  type CalendarEvent,
  type CalendarTrialEvent,
} from './icsBuilder.ts';

/** Zone of last resort when a trial predates the timezone column. */
export const FALLBACK_TIME_ZONE = 'America/New_York';

export interface TrialForFeed {
  id: string;
  name: string | null;
  date: string;
  timezone: string | null;
  /** Free text as the secretary typed it, e.g. "8:00 AM". */
  plannedStartTime: string | null;
  /** Same shape, recorded once the day actually began; wins over the plan. */
  actualStartTime: string | null;
  plannedEndTime: string | null;
}

/** A per-class event together with the trial it belongs to. */
export interface ClassEventForFeed {
  trialId: string;
  event: CalendarClassEvent;
}

export interface FeedSelectionInput {
  trials: TrialForFeed[];
  classEvents: ClassEventForFeed[];
  /** The exhibitor's distinct armbands per trial, before per-class dedup. */
  armbandsByTrialId: Map<string, Set<number>>;
  showName: string | null;
  venue: string | null;
}

export function resolveTrialZone(trial: TrialForFeed): string {
  return trial.timezone?.trim() || FALLBACK_TIME_ZONE;
}

export function selectFeedEvents(input: FeedSelectionInput): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const trial of input.trials) {
    const mine = input.classEvents.filter(candidate => candidate.trialId === trial.id);
    if (mine.length === 0) continue; // Nothing of the exhibitor's that day.

    const timed = mine.map(candidate => candidate.event).filter(hasResolvableTime);
    if (timed.length > 0) {
      // The secretary published times for this day. Untimed siblings stay
      // omitted rather than being guessed at the trial's start hour.
      events.push(...timed);
      continue;
    }

    const block: CalendarTrialEvent = {
      kind: 'trial',
      trialId: trial.id,
      trialName: trial.name,
      showName: input.showName,
      trialDate: trial.date,
      plannedStartTime: trial.plannedStartTime,
      actualStartTime: trial.actualStartTime,
      plannedEndTime: trial.plannedEndTime,
      timeZone: resolveTrialZone(trial),
      venue: input.venue,
      classNames: [...new Set(mine.map(candidate => candidate.event.className))].sort(),
      armbands: [...(input.armbandsByTrialId.get(trial.id) ?? [])].sort((a, b) => a - b),
    };
    if (hasResolvableTime(block)) events.push(block);
  }

  return events;
}
