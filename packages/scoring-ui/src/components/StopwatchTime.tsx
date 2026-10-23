/**
 * StopwatchTime -- the running clock, and the only subscriber to its 100ms paint
 * (MYK9-1364).
 *
 * `useStopwatch` keeps the live time behind `subscribeTime`/`getTimeMs` instead
 * of in React state, so the scoresheet that hosts the hook renders only on
 * start, stop, pause, expiry and the 30-second warning. This component reads the
 * live value, so a run costs one tiny re-render ten times a second instead of
 * the whole scoresheet tree competing with touches on the result chips.
 *
 * INTENT: ringside the scoresheet must feel instant -- keep every other element
 * out of this subscription.
 */

import React, { memo, useSyncExternalStore } from 'react';
import type { StopwatchReturn } from '../types';

/** The slice of the stopwatch this display reads. */
export type StopwatchClock = Pick<
  StopwatchReturn,
  'subscribeTime' | 'getTimeMs' | 'formatTime' | 'getMaxTimeMs'
>;

interface StopwatchTimeProps {
  stopwatch: StopwatchClock;
  /** 'elapsed' (default) shows the running time; 'remaining' counts down to the max. */
  mode?: 'elapsed' | 'remaining';
  /**
   * Render something else from the live elapsed ms (a ring, a "Remaining:" line).
   * The function runs on every paint, so keep it to the display.
   */
  children?: (elapsedMs: number) => React.ReactNode;
}

export const StopwatchTime = memo(function StopwatchTime({
  stopwatch,
  mode = 'elapsed',
  children,
}: StopwatchTimeProps) {
  const elapsedMs = useSyncExternalStore(stopwatch.subscribeTime, stopwatch.getTimeMs);
  if (children) return <>{children(elapsedMs)}</>;
  if (mode === 'remaining') {
    return <>{stopwatch.formatTime(Math.max(0, stopwatch.getMaxTimeMs() - elapsedMs))}</>;
  }
  return <>{stopwatch.formatTime(elapsedMs)}</>;
});
