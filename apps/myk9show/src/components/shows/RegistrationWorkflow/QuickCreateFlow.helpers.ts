import type { AddDogSubMode } from '@/components/panels/edit/AddDogPanel/types';
import { addDogSubModeTitle } from '@/components/panels/edit/AddDogPanel/subModeTitle';

/** The three steps a Quick Create walks through. */
export type QuickCreateStep = 'exhibitor' | 'dogs' | 'review';

/**
 * What the one Quick Create slide-out shows (MYK9-1081): the step screens, or
 * the Person or Dog form in their place. Never a second overlay.
 */
export type QuickCreateView =
  | 'steps'
  | 'person-form'
  | 'dog-form'
  // Edit on a record already saved (MYK9-1112): the existing Edit Person / Edit Dog panels.
  | 'person-edit'
  | 'dog-edit';

const STEP_LABELS: Record<QuickCreateStep, { number: number; label: string }> = {
  exhibitor: { number: 1, label: 'Add Person' },
  dogs: { number: 2, label: 'Add Dog(s)' },
  review: { number: 3, label: 'Review & Complete' },
};

/** The panel's title for the view showing now. */
export function quickCreateTitle(view: QuickCreateView, dogSubMode: AddDogSubMode): string {
  if (view === 'person-form') return 'Add Person';
  if (view === 'person-edit') return 'Edit Person';
  if (view === 'dog-edit') return 'Edit Dog';
  if (view === 'dog-form') return addDogSubModeTitle(dogSubMode);
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

/** Marks each step's primary control: focus returns there when a form closes. */
export const QUICK_CREATE_ENTRY_ATTR = 'data-quick-create-entry';
/** Each dog row's Remove: focus moves to the next row's after a removal. */
export const QUICK_CREATE_REMOVE_DOG_ATTR = 'data-remove-dog';

/**
 * Where focus lands on the step screens (MYK9-1081): after a Remove, the Remove
 * of the row that moved into the removed one's place; otherwise the step's
 * primary control (Add Person / Edit Details, Add First / Another Dog, the
 * Review heading); failing both, the step screens themselves.
 */
export function quickCreateStepsFocusTarget(
  steps: HTMLElement | null,
  removedIndex: number | null
): HTMLElement | null {
  if (!steps) return null;
  const nextRemove =
    removedIndex === null
      ? undefined
      : steps.querySelectorAll<HTMLElement>(`[${QUICK_CREATE_REMOVE_DOG_ATTR}]`)[removedIndex];
  return nextRemove ?? steps.querySelector<HTMLElement>(`[${QUICK_CREATE_ENTRY_ATTR}]`) ?? steps;
}
