import { useCallback, useEffect, useRef } from 'react';
import type { Trial } from '@/components/trials/types/trial.types';
import { trialStatusChanged } from '@/store/trial-store-helpers';
import { isoToClock } from '@/components/trials/trialDateTime';
import { getTrialTimezone } from '@/features/registries';

// MYK9-2450: the fields another device can change under an open Edit Trial form. The actual
// times are the clock text the form showed, so they are compared as the form holds them: a
// stored instant on another day than the trial date does not round-trip through the clock.
export interface TrialOpenBaseline {
  status: string | undefined;
  timeStarted: string | undefined;
  timeEnded: string | undefined;
  autoCompleteStaleClasses: boolean | null | undefined;
}

export function trialOpenBaseline(trial: Partial<Trial>): TrialOpenBaseline {
  const timeZone = getTrialTimezone(trial);
  return {
    status: trial.status,
    timeStarted: isoToClock(trial.timeStarted, timeZone),
    timeEnded: isoToClock(trial.timeEnded, timeZone),
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

const sameClock = (a: string | undefined, b: string | undefined) =>
  (a ?? '').trim() === (b ?? '').trim();

/** The actual-time clock fields as the form submitted them. */
export interface SubmittedClocks {
  timeStarted: string | undefined;
  timeEnded: string | undefined;
  askAboutStaleClasses: boolean;
}

/**
 * Drops status, the actual times and the stale-class switch from a submitted trial unless
 * the form changed them from the open-time baseline. The store then never sees them, so a
 * closure another device made is carried through instead of overwritten by the old form
 * values. Times are judged on the clock text, not the converted instant.
 */
export function withoutUntouchedLiveFields(
  trialData: Partial<Trial>,
  submitted: SubmittedClocks,
  baseline: TrialOpenBaseline
): Partial<Trial> {
  const next = { ...trialData };
  if (!trialStatusChanged(next.status, baseline.status)) delete next.status;
  if (sameClock(submitted.timeStarted, baseline.timeStarted)) delete next.timeStarted;
  if (sameClock(submitted.timeEnded, baseline.timeEnded)) delete next.timeEnded;
  if (submitted.askAboutStaleClasses === (baseline.autoCompleteStaleClasses !== false)) {
    delete next.autoCompleteStaleClasses;
  }
  return next;
}
