/**
 * How My Shows orders the exhibitor's shows: today's first, then upcoming soonest first, then past
 * (most recent first). Pure, so the page's order is pinned without rendering it.
 *
 * "Past" is the trial-zone rule (`isShowPastInTrialZones`), the same one the check-in gate reads; "today" is a not-yet-past
 * show whose first day has arrived, so a multi-day show that began yesterday is today's.
 *
 * @module MyEntriesPage/modules/myShowSections
 */

import type { MyShowGroup } from './groupEntriesByShow';
import { isShowPastInTrialZones } from './dayCheckIn';
import { startOfLocalDay } from './myEntriesStats.helpers';

/** The URL parameter that names a show's group key; the page scrolls to that show. */
export const SELECTED_SHOW_PARAM = 'show';

export interface MyShowSections {
  today: MyShowGroup[];
  upcoming: MyShowGroup[];
  past: MyShowGroup[];
}

function startTime(group: MyShowGroup): number {
  // An undated show (unreadable draft) sorts after every dated one.
  return group.showDate ? startOfLocalDay(group.showDate).getTime() : Number.POSITIVE_INFINITY;
}

export function splitShowsIntoSections(groups: readonly MyShowGroup[], now: Date): MyShowSections {
  const today: MyShowGroup[] = [];
  const upcoming: MyShowGroup[] = [];
  const past: MyShowGroup[] = [];
  const todayStart = startOfLocalDay(now).getTime();
  for (const group of groups) {
    if (isShowPastInTrialZones(group, now)) past.push(group);
    else if (startTime(group) <= todayStart) today.push(group);
    else upcoming.push(group);
  }
  // Array.prototype.sort is stable, so shows that tie keep the order they arrived in.
  today.sort((a, b) => startTime(a) - startTime(b));
  upcoming.sort((a, b) => startTime(a) - startTime(b));
  past.sort((a, b) => startTime(b) - startTime(a));
  return { today, upcoming, past };
}
