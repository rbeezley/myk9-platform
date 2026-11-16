import { formatWeekdayLong } from '@/lib/format/dates';

import { parseCockpitDays } from './cockpitDayFilter';
import { getShowHomeHref, getTrialPacketHref } from './cockpitRoutes';
import type {
  NextTrialNote,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';
import {
  classRunState,
  dayNumberOf,
  orderTrials,
  trialFinishedByRunning,
  trialLabelOf,
  type OrderableTrial,
} from './trialStanding';

/** The sheets a trial prints before its classes run (classChecklist.ts). */
const ARMBAND_LABELS = 'armband-labels';
const PRE_SHOW_SHEETS: ReadonlySet<string> = new Set(['check-in-sheet', 'scoresheet']);

const orderable = (trial: SecretaryCockpitTrial): OrderableTrial => ({
  id: trial.id,
  date: trial.date,
  number: trial.storedNumber,
  plannedStartTime: trial.plannedStartTime,
  displayOrder: trial.displayOrder,
  name: trial.name,
});

function trialStates(trialId: string, classes: readonly SecretaryCockpitClass[]) {
  return classes
    .filter(cls => cls.trialId === trialId)
    .map(cls =>
      classRunState({
        complete: cls.lifecycle === 'complete',
        cancelled: cls.lifecycle === 'cancelled',
        entryCount: cls.entryCount,
        runListCount: cls.runListCount,
      })
    );
}

/**
 * Decision 6 of the print plan (MYK9-2075): when a trial finishes, the trial after it says so and
 * offers its paperwork, because move-ups settled only now. "After it" is the shared show order
 * (`orderTrials`), so it may be the next day's first trial; then the note names that day's armband
 * labels too. It shows while this trial's check-in or score sheets are not current (never printed,
 * or changed since printing) and goes away once they are. A sheet that cannot be checked shows
 * nothing: no guess either way.
 */
export function nextTrialPaperworkNote(input: {
  showId: string;
  trial: SecretaryCockpitTrial;
  trials: readonly SecretaryCockpitTrial[];
  classes: readonly SecretaryCockpitClass[];
}): NextTrialNote | null {
  const ordered = orderTrials(input.trials, orderable);
  const previous = ordered[ordered.findIndex(item => item.id === input.trial.id) - 1];
  if (!previous || ordered.every(item => item.id !== input.trial.id)) return null;
  const all = ordered.map(orderable);
  // A tie in the day's order means "previous" would be a guess: say nothing.
  if (
    dayNumberOf(orderable(previous), all) === undefined ||
    dayNumberOf(orderable(input.trial), all) === undefined
  ) {
    return null;
  }
  if (!trialFinishedByRunning(trialStates(previous.id, input.classes))) return null;
  // The note prompts the print before this trial runs; once it has started, it has done its job.
  const own = input.classes.filter(
    cls => cls.trialId === input.trial.id && cls.lifecycle !== 'cancelled'
  );
  if (own.some(cls => cls.lifecycle === 'in-progress' || cls.lifecycle === 'complete')) return null;

  const sheets = own.flatMap(cls => cls.paperwork).filter(row => PRE_SHOW_SHEETS.has(row.reportId));
  if (sheets.length === 0 || sheets.some(row => row.state === 'unknown')) return null;
  if (sheets.every(row => row.state === 'current')) return null;

  const finished = trialLabelOf(orderable(previous));
  const next = trialLabelOf(orderable(input.trial));
  const labels = previous.date !== input.trial.date ? dayLabelsDoor(input) : null;
  return {
    text: `${finished} is finished. ${next}'s paperwork is ready to print.${
      labels ? ` ${labels.day}'s armband labels are ready too.` : ''
    }`,
    linkLabel: `Print ${next}'s paperwork`,
    href: getTrialPacketHref(input.showId, input.trial),
    ...(labels ? { labels: { linkLabel: labels.linkLabel, href: labels.href } } : {}),
  };
}

/**
 * The new day's armband labels, named only when some still need printing and none is unknown.
 * They print by day from a class (MYK9-2073), so the door focuses the first class with one.
 */
function dayLabelsDoor(input: {
  showId: string;
  trial: SecretaryCockpitTrial;
  trials: readonly SecretaryCockpitTrial[];
  classes: readonly SecretaryCockpitClass[];
}): { day: string; linkLabel: string; href: string } | null {
  const day = formatWeekdayLong(input.trial.date);
  if (!day) return null;
  const dayTrials = new Set(
    input.trials.filter(trial => trial.date === input.trial.date).map(trial => trial.id)
  );
  const rows = input.classes
    .filter(cls => dayTrials.has(cls.trialId) && cls.lifecycle !== 'cancelled')
    .flatMap(cls =>
      cls.paperwork.filter(row => row.reportId === ARMBAND_LABELS).map(row => ({ cls, row }))
    );
  if (rows.some(({ row }) => row.state === 'unknown')) return null;
  const door = rows.find(
    ({ row }) =>
      (row.labelsToPrint?.notPrinted.length ?? 0) + (row.labelsToPrint?.changed.length ?? 0) > 0
  );
  if (!door) return null;
  return {
    day,
    linkLabel: `Print ${day}'s labels`,
    href: getShowHomeHref({
      showId: input.showId,
      state: {
        statuses: [],
        selectedDays: parseCockpitDays(input.trial.date),
        focusedClassId: door.cls.id,
      },
    }),
  };
}
