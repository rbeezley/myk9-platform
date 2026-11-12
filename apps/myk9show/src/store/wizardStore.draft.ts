import { resolvePremiumStyle } from '@/types/premium-types';
import type { WizardState } from './wizardStore';

/** The part of the wizard that is written to this device: the resumable draft. */
export type PersistedWizardDraft = Pick<
  WizardState,
  | 'currentStep'
  | 'completedSteps'
  | 'lastSaved'
  | 'show'
  | 'trials'
  | 'judgeAssignments'
  | 'judgeDetails'
  | 'editBaselineJudgeIds'
>;

export function pickPersistedDraft(state: WizardState): PersistedWizardDraft {
  return {
    currentStep: state.currentStep,
    completedSteps: state.completedSteps,
    lastSaved: state.lastSaved,
    show: state.show,
    trials: state.trials,
    judgeAssignments: state.judgeAssignments,
    judgeDetails: state.judgeDetails,
    // Kept with the draft it describes: a draft restored without it could only
    // add judges, never remove them.
    editBaselineJudgeIds: state.editBaselineJudgeIds,
  };
}

/**
 * What goes to disk. Add trials / Add classes rebuild their draft from the show on every
 * visit, so they have nothing worth resuming; while one is open the disk keeps the new-show
 * draft that was set aside for it (MYK9-1794). Writing the edit draft instead is how opening
 * Add classes on one show used to destroy a half-built new show, and how backing out of it
 * left an existing show where Add Show would offer to resume it.
 */
export function draftToPersist(state: WizardState): PersistedWizardDraft {
  return state.parkedCreateDraft ?? pickPersistedDraft(state);
}

/**
 * Backfill canonical defaults onto persisted/loaded show state. Handles
 * `officials` (each role array missing or non-array → `[]`) and `style`
 * (missing → DEFAULT_PREMIUM_STYLE) so older drafts and manually-edited
 * storage still produce a well-formed wizard state.
 */
export function ensureShowDefaults<T extends { show: WizardState['show'] }>(state: T): T {
  const o = state.show.officials as Partial<WizardState['show']['officials']> | undefined;
  const secretary = Array.isArray(o?.secretary) ? o!.secretary : [];
  const chairman = Array.isArray(o?.chairman) ? o!.chairman : [];
  const steward = Array.isArray(o?.steward) ? o!.steward : [];
  const style = resolvePremiumStyle(state.show.style);
  if (
    o &&
    o.secretary === secretary &&
    o.chairman === chairman &&
    o.steward === steward &&
    state.show.style === style
  ) {
    return state;
  }
  return {
    ...state,
    show: {
      ...state.show,
      officials: { secretary, chairman, steward },
      style,
    },
  };
}
