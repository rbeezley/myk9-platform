import { getTrialTimezone } from '@/features/registries';
import { mapClassToStage } from '@/features/pipeline/utils/classStageMapping';
import type { Trial, TrialClass } from '@/store/trialStore';

export interface TodayClassCounts {
  live: number;
  notStarted: number;
  closed: number;
}

/** The calendar day (YYYY-MM-DD) it is right now in an IANA timezone. */
function dayKeyInTimezone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Class stage counts for ONE show's trials dated today (in each trial's own
 * timezone). Returns null when that show has no classes to count in the local
 * store yet, so a card can omit the line instead of showing a false 0/0/0.
 * "Today" is decided per trial timezone, while `useMyShows` picks the Today
 * phase on the viewer's local day; where they differ the line is hidden, which
 * is the safe direction.
 */
export function getTodayClassCounts(
  showId: string,
  trials: readonly Trial[],
  trialClasses: Readonly<Record<string, readonly TrialClass[]>>,
  now: Date = new Date()
): TodayClassCounts | null {
  const counts: TodayClassCounts = { live: 0, notStarted: 0, closed: 0 };
  let counted = 0;

  for (const trial of trials) {
    if (trial.showId !== showId) continue;
    if (trial.trialDate?.slice(0, 10) !== dayKeyInTimezone(now, getTrialTimezone(trial))) continue;
    for (const cls of trialClasses[trial.id] ?? []) {
      const stage = mapClassToStage(cls.status, cls.isScoringFinalized ?? false);
      // Only the three shown buckets count; setup/results classes must not
      // turn into a false "0 live · 0 not started · 0 closed".
      if (stage === 'in-progress') counts.live++;
      else if (stage === 'not-started') counts.notStarted++;
      else if (stage === 'closed') counts.closed++;
      else continue;
      counted++;
    }
  }

  return counted === 0 ? null : counts;
}
