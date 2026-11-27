import { useCallback, useEffect, useRef } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { actualTimeChanged, trialStatusChanged } from '@/store/trial-store-helpers';

// MYK9-2450: the fields another device can change under an open Edit Trial form.
export interface TrialOpenBaseline {
  status: string | undefined;
  timeStarted: string | undefined;
  timeEnded: string | undefined;
  autoCompleteStaleClasses: boolean | null | undefined;
}

export function trialOpenBaseline(trial: Partial<Trial>): TrialOpenBaseline {
  return {
    status: trial.status,
    timeStarted: trial.timeStarted,
    timeEnded: trial.timeEnded,
    autoCompleteStaleClasses: trial.autoCompleteStaleClasses,
  };
}

/**
 * The trial as it was when the panel opened. `initialTrialData` is the live store row, so
 * it moves when replication delivers a change from another device while the form is open;
 * this does not follow it.
 */
export function useTrialOpenBaseline(
  open: boolean,
  trial: Partial<Trial>
): () => TrialOpenBaseline {
  const baseline = useRef(trialOpenBaseline(trial));
  const latest = useRef(trial);
  useEffect(() => {
    latest.current = trial;
  });
  useEffect(() => {
    if (open) baseline.current = trialOpenBaseline(latest.current);
  }, [open]);
  return useCallback(() => baseline.current, []);
}

/**
 * Drops status, the actual times and the stale-class switch from a submitted trial unless
 * the form changed them from the open-time baseline. The host then spreads the live row,
 * so a closure another device made is carried through instead of overwritten by the old
 * form values.
 */
export function withoutUntouchedLiveFields(
  trialData: Partial<Trial>,
  baseline: TrialOpenBaseline,
  askAboutStaleClasses: boolean
): Partial<Trial> {
  const next = { ...trialData };
  if (!trialStatusChanged(next.status, baseline.status)) delete next.status;
  if (!actualTimeChanged(next.timeStarted, baseline.timeStarted)) delete next.timeStarted;
  if (!actualTimeChanged(next.timeEnded, baseline.timeEnded)) delete next.timeEnded;
  if (askAboutStaleClasses === (baseline.autoCompleteStaleClasses !== false)) {
    delete next.autoCompleteStaleClasses;
  }
  return next;
}
