/**
 * Which search area the clock is timing on a multi-area scoresheet (MYK9-1098).
 *
 * As in myK9Q, the clock times the first area with no recorded time, against that
 * area's own max. The area is fixed when the clock starts from zero, so recording
 * or expiring one area does not re-target a clock that is still showing its time;
 * recording or resetting releases it for the next area.
 *
 * `timedAreaRef` exists for the stopwatch's expiry callback, which is captured
 * from the first render and would otherwise read a stale area.
 */
import { useEffect, useRef, useState } from 'react';

export function useTimedArea(areaTimes: string[]) {
  const nextEmptyArea = Math.max(
    0,
    areaTimes.findIndex(time => !time)
  );
  const [startedArea, setStartedArea] = useState<number | null>(null);
  const timedArea = startedArea ?? nextEmptyArea;
  const timedAreaRef = useRef(timedArea);
  useEffect(() => {
    timedAreaRef.current = timedArea;
  }, [timedArea]);

  return {
    timedArea,
    timedAreaRef,
    /** Call when the clock starts; pins the area only on a start from zero. */
    pinOnStart: (elapsedMs: number) => {
      if (elapsedMs === 0) setStartedArea(nextEmptyArea);
    },
    /** Call when the clock is reset or its time recorded. */
    release: () => setStartedArea(null),
  };
}
