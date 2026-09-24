/**
 * Display label for a trial (MYK9-704).
 *
 * `trials.name` is the secretary's label and is NOT NULL in the database, so it
 * is the display label. `trial_number` is free text too — the show-creation
 * wizard copies the trial NAME into it ('Saturday T 2', 'Trial 1',
 * 'UKC-Nosework') — so it is only a fallback for objects that did not carry
 * `name`, and it is shown as-is. The literal 'Trial' is the last resort.
 *
 * Never prefix "Trial " and never parse or strip either value: prefixing a
 * stored label rendered "Trial Trial 1" and "Trial Saturday T 2".
 */
export interface TrialLabelSource {
  name?: string | null | undefined;
  trialNumber?: string | number | null | undefined;
}

export const TRIAL_LABEL_FALLBACK = 'Trial';

function present(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value);
  return text.trim() === '' ? undefined : text;
}

export function formatTrialLabel({ name, trialNumber }: TrialLabelSource): string {
  return present(name) ?? present(trialNumber) ?? TRIAL_LABEL_FALLBACK;
}
