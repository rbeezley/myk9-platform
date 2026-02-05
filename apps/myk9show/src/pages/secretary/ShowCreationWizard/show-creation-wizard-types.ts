/**
 * Type definitions for the Show Creation Wizard
 */

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
