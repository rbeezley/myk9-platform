import { currentDateInTimeZone } from '@/pages/judgeStatsUtils';
import type { YourRingClass } from './atShowClassListSort';

export type RingDayBucket = 'today' | 'upcoming' | 'past';

export type DatedRingClass = YourRingClass & { dayBucket: RingDayBucket };

const BUCKET_RANK: Record<RingDayBucket, number> = { today: 0, upcoming: 1, past: 2 };

/**
 * Orders Your ring cards: today first, then upcoming days, then past days last
 * (MYK9-1224). "Today" reuses the judge dashboard's `currentDateInTimeZone`
 * (MYK9-1194): the trial date is compared against the calendar date in the
 * trial's own timezone, never UTC. Order inside a bucket is the caller's order
 * (stable), except days: upcoming runs soonest-first, past most-recent-first.
 * Cards with no known trial date stay in the upcoming bucket, so an unknown
 * day is never quieted as past. Dog ordering is untouched (runQueue.ts).
 */
export function orderRingClassesByDay(classes: YourRingClass[], nowMs: number): DatedRingClass[] {
  const dated = classes.map((c, index) => {
    const today = currentDateInTimeZone(nowMs, c.trialTimeZone);
    // A live class (scanPriority 0, `yourRingScanPriority`) is today's work
    // whatever its date: a class running past midnight must stay on top.
    const dayBucket: RingDayBucket =
      c.scanPriority === 0
        ? 'today'
        : !c.trialDate
          ? 'upcoming'
          : c.trialDate === today
            ? 'today'
            : c.trialDate > today
              ? 'upcoming'
              : 'past';
    return { card: { ...c, dayBucket }, index };
  });
  dated.sort((a, b) => {
    const rank = BUCKET_RANK[a.card.dayBucket] - BUCKET_RANK[b.card.dayBucket];
    if (rank !== 0) return rank;
    const ad = a.card.trialDate ?? '';
    const bd = b.card.trialDate ?? '';
    if (ad !== bd) {
      if (a.card.dayBucket === 'past') return ad < bd ? 1 : -1;
      if (a.card.dayBucket === 'upcoming') return ad < bd ? -1 : 1;
    }
    return a.index - b.index;
  });
  return dated.map(d => d.card);
}
