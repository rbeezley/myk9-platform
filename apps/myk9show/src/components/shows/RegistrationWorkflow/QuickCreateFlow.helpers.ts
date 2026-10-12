import type { AddDogSubMode } from '@/components/panels/edit/AddDogPanel/types';

/** The three steps a Quick Create walks through. */
export type QuickCreateStep = 'exhibitor' | 'dogs' | 'review';

/**
 * What the one Quick Create slide-out shows (MYK9-1081): the step screens, or
 * the Person or Dog form in their place. Never a second overlay.
 */
export type QuickCreateView = 'steps' | 'person-form' | 'dog-form';

const STEP_LABELS: Record<QuickCreateStep, { number: number; label: string }> = {
  exhibitor: { number: 1, label: 'Add Person' },
  dogs: { number: 2, label: 'Add Dog(s)' },
  review: { number: 3, label: 'Review & Complete' },
};

/** The panel's title for the view showing now. */
export function quickCreateTitle(view: QuickCreateView, dogSubMode: AddDogSubMode): string {
  if (view === 'person-form') return 'Add Person';
  if (view === 'dog-form') {
    if (dogSubMode === 'registration-add') return 'Add New Registration';
    if (dogSubMode === 'registration-edit') return 'Edit Registration';
    return 'Add Dog';
  }
  return 'Quick Registration Setup';
}

/** The panel's subtitle: where the secretary is in the three steps. */
export function quickCreateStepLabel(step: QuickCreateStep): string {
  const { number, label } = STEP_LABELS[step];
  return `Step ${number} of 3: ${label}`;
}

/** The progress bar's value for a step. */
export function quickCreateProgress(step: QuickCreateStep): number {
  if (step === 'exhibitor') return 25;
  if (step === 'dogs') return 65;
  return 90;
}
