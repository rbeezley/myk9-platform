/**
 * Which trial each side of a class change request is in (MYK9-2129).
 *
 * An exhibitor may ask for a class in another trial, and two trials can hold a
 * class with the same name, so a cross-trial request names the requested
 * class's trial next to it. A same-trial request adds nothing.
 */
import { formatTrialLabel } from './management/entryFormTrialSummary';

export interface TrialFacts {
  date: string | null;
  number: string | null;
}

export function trialFactsById(
  trials: ReadonlyArray<Record<string, unknown>>
): Record<string, TrialFacts> {
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  return Object.fromEntries(
    trials.map(trial => [
      String(trial.id),
      { date: text(trial.date), number: text(trial.trial_number) },
    ])
  );
}

export interface RequestTrialLabels {
  /** The trial the dog is in now: "Mon, Nov 9 · Trial 1". */
  fromTrial: string | null;
  /**
   * The requested class's trial, only when it is another trial: "Trial 4", or
   * "Tue, Nov 10 · Trial 4" when that trial is on another day.
   */
  requestedTrial: string | null;
}

export function requestTrialLabels(
  trials: Record<string, TrialFacts>,
  fromTrialId: string,
  requestedTrialId: string | null | undefined
): RequestTrialLabels {
  const from = trials[fromTrialId];
  const fromTrial = from ? formatTrialLabel(from.date, from.number) || null : null;
  const to = requestedTrialId ? trials[requestedTrialId] : undefined;
  if (!to || requestedTrialId === fromTrialId) return { fromTrial, requestedTrial: null };
  const sameDay = from?.date != null && from.date === to.date;
  return {
    fromTrial,
    requestedTrial: formatTrialLabel(sameDay ? null : to.date, to.number) || null,
  };
}
