import { realignTrialsToShowDates } from '@/utils/wizardTrialDates';
import type { WizardState } from './wizardStore';

/**
 * Draft trials realigned to the current show dates, or undefined when nothing
 * applies: edit modes (they set `editBaselineJudgeIds`) never move existing
 * trials, and with no show start there is nothing to align to. Run once on
 * the forward move off Basics, not per date write: the range picker writes start and end
 * separately, so intermediate ranges are wrong (MYK9-884).
 */
function alignedTrialsPatch(
  state: Pick<WizardState, 'show' | 'trials' | 'editBaselineJudgeIds'>
): Pick<WizardState, 'trials' | 'trialsMovedCount'> | undefined {
  if (state.editBaselineJudgeIds !== null || !state.show.startDate) return undefined;
  const trials = realignTrialsToShowDates(state.trials, state.show.startDate, state.show.endDate);
  if (trials === state.trials) return undefined;
  return {
    trials,
    trialsMovedCount: trials.filter((trial, i) => trial !== state.trials[i]).length,
  };
}

/** The wizard's Trials step (index in the step list). */
const TRIAL_STEP = 1;

/**
 * The one step transition, shared by setCurrentStep and goToStep (the step
 * header). Only the forward move off Basics realigns trials; Back must not undo
 * a chosen date. Leaving the trial step clears the moved-dates notice.
 */
export function stepTransitionPatch(state: WizardState, step: number): Partial<WizardState> {
  const aligned = state.currentStep === 0 && step > 0 ? alignedTrialsPatch(state) : undefined;
  const leavingTrials = state.currentStep === TRIAL_STEP && step !== TRIAL_STEP;
  return {
    ...aligned,
    ...(!aligned && leavingTrials ? { trialsMovedCount: 0 } : {}),
    // Moved dates land on the Trials step so the notice is seen, not skipped.
    currentStep: aligned ? TRIAL_STEP : step,
  };
}
