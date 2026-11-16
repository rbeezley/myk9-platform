import type { SecretaryCockpitClass, SecretaryCockpitTrial } from './secretaryCockpitTypes';

/** The sheets a trial prints before its classes run (classChecklist.ts). */
const PRE_SHOW_SHEETS: ReadonlySet<string> = new Set(['check-in-sheet', 'scoresheet']);

/** Nothing left to run: every class that is not cancelled is complete. Unknown is not finished. */
function isTrialFinished(classes: readonly SecretaryCockpitClass[]): boolean {
  const running = classes.filter(cls => cls.lifecycle !== 'cancelled');
  return running.length > 0 && running.every(cls => cls.lifecycle === 'complete');
}

/**
 * MYK9-2075: the card of a trial whose earlier same-day trial has finished says its paperwork may
 * need printing again. It reuses the per-class "Changed since printing" state (MYK9-2074) rather
 * than comparing timestamps: a move-up changes the class's entries, which flips a printed sheet
 * stale. So the note shows only when the earlier trial is finished AND a sheet of this trial was
 * printed and has since changed. A trial never printed has nothing to print again.
 */
export function needsReprintAfterEarlierTrial(input: {
  trial: SecretaryCockpitTrial;
  trials: readonly SecretaryCockpitTrial[];
  classes: readonly SecretaryCockpitClass[];
}): boolean {
  const earlierTrials = input.trials.filter(
    other =>
      other.id !== input.trial.id && other.date === input.trial.date && other.order < input.trial.order
  );
  if (earlierTrials.length === 0) return false;
  const finishedBefore = earlierTrials.every(other =>
    isTrialFinished(input.classes.filter(cls => cls.trialId === other.id))
  );
  if (!finishedBefore) return false;
  return input.classes.some(
    cls =>
      cls.trialId === input.trial.id &&
      cls.paperwork.some(row => PRE_SHOW_SHEETS.has(row.reportId) && row.state === 'stale')
  );
}
