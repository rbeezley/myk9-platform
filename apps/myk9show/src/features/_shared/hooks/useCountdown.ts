import { useEffect, useRef, useState } from 'react';
import { toLocalDate } from '@/utils/date-format';

/**
 * A bare `entry_close_date` is a DATE column with no timezone — parsing it
 * with `new Date('YYYY-MM-DD')` reads as UTC midnight and reports "closed"
 * up to a day early for western-hemisphere viewers. Treat a date-only value
 * as open through local end-of-day (23:59:59.999), matching the "Closes
 * Today!" inclusive-close convention in `utils/entryStatusUtils.ts`. A value
 * that already carries a time component is a real instant and is used as-is.
 */
function resolveTargetInstant(targetIso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(targetIso)) {
    const endOfDay = toLocalDate(targetIso);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay;
  }
  return new Date(targetIso);
}

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
 *
 * Shared across premium landing pages — heritage, monogram, banner, etc. all
 * surface "entries close in X days" countdowns.
 */
export function useCountdown(targetIso: string | null, _timezone: string): CountdownValue {
  const compute = (): CountdownValue => {
    if (!targetIso)
      return { days: 0, hours: 0, minutes: 0, seconds: 0, closed: false, hasTarget: false };
    const diff = resolveTargetInstant(targetIso).getTime() - Date.now();
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
    prevSecondsRef.current = -1;

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
