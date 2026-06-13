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
   * Null when the passcode insert failed — the access card falls back to the
   * legacy UUID-derivation in that case so the secretary still gets working
   * codes for the existing-show fallback path.
   */
  passcodes: ShowPasscodes | null;
}

export interface WizardStep {
  id: number;
  label: string;
  description: string;
}

export type EditModeType = 'add-trials' | 'add-classes' | 'edit-show';

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
