import { formatWeekdayLong } from '@/lib/format/dates';

import { getTrialPacketHref } from './cockpitRoutes';
import type {
  NextTrialNote,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';
import {
  classRunState,
  orderTrials,
  trialFinishedByRunning,
  trialLabelOf,
  type OrderableTrial,
} from './trialStanding';

/** The sheets a trial prints before its classes run (classChecklist.ts). */
const PRE_SHOW_SHEETS: ReadonlySet<string> = new Set(['check-in-sheet', 'scoresheet']);

const orderable = (trial: SecretaryCockpitTrial): OrderableTrial => ({
  id: trial.id,
  date: trial.date,
  number: trial.number,
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
  if (!trialFinishedByRunning(trialStates(previous.id, input.classes))) return null;

  const sheets = input.classes
    .filter(cls => cls.trialId === input.trial.id)
    .flatMap(cls => cls.paperwork)
    .filter(row => PRE_SHOW_SHEETS.has(row.reportId));
  if (sheets.length === 0 || sheets.some(row => row.state === 'unknown')) return null;
  if (sheets.every(row => row.state === 'current')) return null;

  const all = ordered.map(orderable);
  const finished = trialLabelOf(orderable(previous), all);
  const next = trialLabelOf(orderable(input.trial), all);
  const newDay = previous.date !== input.trial.date ? formatWeekdayLong(input.trial.date) : '';
  return {
    text: `${finished} is finished. ${next}'s paperwork is ready to print.${
      newDay ? ` ${newDay}'s armband labels are ready too.` : ''
    }`,
    linkLabel: `Print ${next}'s paperwork`,
    href: getTrialPacketHref(input.showId, input.trial),
  };
}
