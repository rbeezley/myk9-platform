import { useEffect, useRef, useState } from 'react';

export interface CountdownValue {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  closed: boolean;
  /** false when targetIso is null — distinguishes "no date set" from "counting down" */
  hasTarget: boolean;
}

/**
 * RAF-driven countdown to a target ISO date string (in a given IANA timezone).
 *
 * Updates at most once per second by comparing the previous digit set —
 * avoids redundant re-renders on every animation frame. Returns `closed: true`
 * once the target date has passed, `hasTarget: false` when no date is provided.
 */
export function useCountdown(targetIso: string | null, _timezone: string): CountdownValue {
  const compute = (): CountdownValue => {
    if (!targetIso)
      return { days: 0, hours: 0, minutes: 0, seconds: 0, closed: false, hasTarget: false };
    const diff = new Date(targetIso).getTime() - Date.now();
    if (diff <= 0)
      return { days: 0, hours: 0, minutes: 0, seconds: 0, closed: true, hasTarget: true };
    const totalSeconds = Math.floor(diff / 1000);
    return {
      days: Math.floor(totalSeconds / 86400),
      hours: Math.floor((totalSeconds % 86400) / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
      closed: false,
      hasTarget: true,
    };
  };

  const [value, setValue] = useState<CountdownValue>(compute);
  const rafRef = useRef<number | null>(null);
  const prevSecondsRef = useRef<number>(-1);

  useEffect(() => {
    if (!targetIso) return;
    prevSecondsRef.current = -1; // reset so first tick of new target always fires

    const tick = () => {
      const next = compute();
      if (next.seconds !== prevSecondsRef.current) {
        prevSecondsRef.current = next.seconds;
        setValue(next);
      }
      if (!next.closed) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [targetIso]); // eslint-disable-line react-hooks/exhaustive-deps

  return value;
}
