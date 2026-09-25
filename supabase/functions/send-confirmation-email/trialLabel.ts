/**
 * Trial display label for confirmation emails (MYK9-713).
 *
 * Mirrors `formatTrialLabel` in packages/core/src/utils/trialLabel.ts, which
 * Deno edge functions cannot import. `trialLabel.test.ts` runs both over the
 * same inputs, so the two copies cannot drift apart silently.
 *
 * Contract (MYK9-704): `trials.name`, else `trial_number` as stored, else
 * 'Trial'. Never prefix "Trial ", never derive a Roman numeral, never change
 * the case: the wizard copies the trial NAME into `trial_number`
 * ('Saturday T 2'), so either value is already a finished label.
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

export interface TrialLabelRow {
  id: string;
  name?: string | null;
  trial_number?: string | null;
}

/** Trial id → display label, for the run rows every email style renders. */
export function buildTrialLabelMap(trials: readonly TrialLabelRow[]): Map<string, string> {
  return new Map(
    trials.map(trial => [
      trial.id,
      formatTrialLabel({ name: trial.name, trialNumber: trial.trial_number }),
    ])
  );
}
