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
  description: string;
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
  { id: 0, label: 'Show Details', description: 'Basic information' },
  { id: 1, label: 'Trials', description: 'Configure trials' },
  { id: 2, label: 'Classes', description: 'Select from templates' },
  { id: 3, label: 'Review', description: 'Final confirmation' },
];
