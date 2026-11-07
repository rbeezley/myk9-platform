import type { DatedRingClass } from './orderRingClassesByDay';

export interface YourRingTrialGroup {
  /** The trial id; a card with none falls back to its heading so it still groups. */
  key: string;
  /** "<trial label> · <date>" (`formatAtShowTrialHeading`). */
  label: string;
  classes: DatedRingClass[];
  /** The trial's own date is today (a live class sorting as today does not count). */
  isToday: boolean;
  /** A live class or a today trial: the group is today's work. */
  hasTodayWork: boolean;
  hasUpcoming: boolean;
}

/**
 * Groups Your ring's cards by trial (MYK9-1739). Cards arrive already ordered
 * by `orderRingClassesByDay` (today, upcoming soonest-first, past
 * most-recent-first, MYK9-1224), so groups keep first-appearance order and
 * each group's cards keep their order: the group order IS the day order.
 */
export function groupYourRingByTrial(cards: readonly DatedRingClass[]): YourRingTrialGroup[] {
  const groups = new Map<string, YourRingTrialGroup>();
  for (const card of cards) {
    const label = card.trialHeading ?? '';
    const key = card.trialId ?? label;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label,
        classes: [],
        isToday: false,
        hasTodayWork: false,
        hasUpcoming: false,
      };
      groups.set(key, group);
    }
    group.classes.push(card);
    if (card.isToday) group.isToday = true;
    if (card.dayBucket === 'today') group.hasTodayWork = true;
    if (card.dayBucket === 'upcoming') group.hasUpcoming = true;
  }
  return [...groups.values()];
}

/**
 * Which groups start open: every group with today's work; with none, the next
 * upcoming trial (the first upcoming group, soonest-first); with neither (a
 * show that is entirely over), the most recent past trial so the list is never
 * a wall of closed headers.
 */
export function defaultOpenYourRingGroupKeys(groups: readonly YourRingTrialGroup[]): Set<string> {
  const today = groups.filter(group => group.hasTodayWork);
  if (today.length > 0) return new Set(today.map(group => group.key));
  const next = groups.find(group => group.hasUpcoming) ?? groups[0];
  return new Set(next ? [next.key] : []);
}
