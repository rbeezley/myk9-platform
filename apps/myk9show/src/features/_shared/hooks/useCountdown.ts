import { useEffect, useRef, useState } from 'react';

/**
 * The UTC instant at which `Y-M-D 23:59:59` occurs in `timeZone` — computed
 * without a date library via the standard "format, then re-interpret,
 * measure the offset, correct once" trick. IANA offsets are constant across
 * a single instant, so one correction is exact (the only failure mode would
 * be a DST transition landing on this exact second, which no show's close
 * time does in practice).
 */
function endOfDayInTimeZone(year: number, month: number, day: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, 23, 59, 59);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(guess)).map(p => [p.type, p.value]));
  const observed = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const target = Date.UTC(year, month - 1, day, 23, 59, 59);
  return new Date(guess + (target - observed) + 999);
}

/**
 * A bare `entry_close_date` is a DATE column with no timezone — the calendar
 * day it names is in the SHOW's timezone, not the viewer's. Parsing it with
 * `new Date('YYYY-MM-DD')` (UTC midnight) or the viewer's local end-of-day
 * both misreport "closed" by hours for a viewer in a different zone than the
 * show. Resolve DATE-only values as open through end-of-day in `timeZone`,
 * matching the inclusive "Closes Today!" convention in
 * `utils/entryStatusUtils.ts` — just computed in the show's zone, not the
 * browser's. A value that already carries a time component is a real
 * instant and is used as-is.
 */
function resolveTargetInstant(targetIso: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetIso);
  if (match) {
    const [, y, m, d] = match;
    return endOfDayInTimeZone(Number(y), Number(m), Number(d), timeZone);
  }
  return new Date(targetIso);
}

export function isCountdownTargetClosed(
  targetIso: string | null,
  timeZone: string,
  nowMs: number = Date.now()
): boolean {
  if (!targetIso) return false;
  return resolveTargetInstant(targetIso, timeZone).getTime() - nowMs <= 0;
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
export function useCountdown(targetIso: string | null, timezone: string): CountdownValue {
  const compute = (): CountdownValue => {
    if (!targetIso)
      return { days: 0, hours: 0, minutes: 0, seconds: 0, closed: false, hasTarget: false };
    const diff = resolveTargetInstant(targetIso, timezone).getTime() - Date.now();
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
  const prevClosedRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!targetIso) return;
    prevSecondsRef.current = -1;
    prevClosedRef.current = null;

    const tick = () => {
      const next = compute();
      if (next.seconds !== prevSecondsRef.current || next.closed !== prevClosedRef.current) {
        prevSecondsRef.current = next.seconds;
        prevClosedRef.current = next.closed;
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
  }, [targetIso, timezone]); // eslint-disable-line react-hooks/exhaustive-deps

  return value;
}
