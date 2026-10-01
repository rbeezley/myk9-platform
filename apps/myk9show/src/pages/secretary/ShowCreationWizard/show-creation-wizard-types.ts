/**
 * Type definitions for the Show Creation Wizard
 */
import type { ShowPasscodes } from '@myk9/core';

/**
 * A show the wizard just created, used to drive the success overlay before
 * navigating away.
 */
export interface CreatedShow {
  id: string;
  name: string;
  /**
   * Server-generated plaintext passcodes returned from insert_show_passcodes.
   * Null when the passcode insert failed. `passcodeError` keeps the success
   * overlay visible so the secretary can retry generation without losing the
   * route back to passcode management.
   */
  passcodes: ShowPasscodes | null;
  /** Plain-language failure from the one-time server passcode generation. */
  passcodeError: string | null;
}

export interface WizardStep {
  id: number;
  label: string;
}

/**
 * The wizard's edit modes. `edit-show` was removed: nothing in the app ever
 * linked to it, its labels fell through to "Create Show (Unpublished)", and
 * its save wrote `status` from the button -- so a hand-entered URL could
 * unpublish a live show. Real show editing lives in ShowEditPanel.
 */
export type EditModeType = 'add-trials' | 'add-classes';

export interface EditMode {
  showId: string;
  mode: EditModeType;
  /**
   * `add-classes` only: the trial the class picker should open on (the trial the
   * secretary launched from). Unvalidated here -- the picker ignores an id that is
   * not one of the show's trials and falls back to the first trial.
   */
  trialId?: string;
}

export interface JudgeDetailsInfo {
  name: string;
  email: string;
  phone: string;
  certifications?: string[] | undefined;
  notes?: string | undefined;
}

export type JudgeDetailsMap = Record<string, JudgeDetailsInfo>;

export type ShowStatus = 'draft' | 'unpublished' | 'published';

export const WIZARD_STEPS: WizardStep[] = [
  { id: 0, label: 'Show Details' },
  { id: 1, label: 'Trials' },
  { id: 2, label: 'Classes' },
  { id: 3, label: 'Review' },
];

/**
 * The wizard steps (indices into WIZARD_STEPS) an edit mode may visit, or null for "all".
 *
 * `add-classes` works on a FIXED set of trials and a show that already exists, so it lives on
 * Classes (2) and Review (3) only. Show Details (0) and Trials (1) are unreachable: adding or
 * removing trials is the separate `add-trials` mode, and with the trial set fixed the
 * class step's "skip empty-trial checks" rule is correct by construction. Enforced at the
 * store's single step transition, so the indicator, Back, and every in-step link obey it.
 */
const ADD_CLASSES_STEPS: readonly number[] = [2, 3];

export function getAllowedWizardSteps(editMode: EditMode | undefined): readonly number[] | null {
  // A stable reference: callers compare it to the store's copy to decide whether to re-assert.
  return editMode?.mode === 'add-classes' ? ADD_CLASSES_STEPS : null;
}

export function isWizardStepAllowed(
  allowed: readonly number[] | null | undefined,
  step: number
): boolean {
  return allowed == null || allowed.includes(step);
}

/** The step Back goes to from `step`, or null when there is none inside the allowed set. */
export function getPreviousAllowedStep(
  allowed: readonly number[] | null,
  step: number
): number | null {
  for (let candidate = step - 1; candidate >= 0; candidate -= 1) {
    if (isWizardStepAllowed(allowed, candidate)) return candidate;
  }
  return null;
}
