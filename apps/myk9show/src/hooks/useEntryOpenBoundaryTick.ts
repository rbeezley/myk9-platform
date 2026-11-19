import { useEffect, useState } from 'react';
import {
  MAX_TIMEOUT_MS,
  msUntilEntryDayBoundary,
} from '@/features/_shared/landing/entryOpenBoundary';

/**
 * Re-renders the caller at each trial-local midnight while the entry window can still change
 * (through the day after it closes), so a page left open re-evaluates `getEntryStatus` (the
 * opening, the closing countdown and the close, with the copy and Enter action) without a
 * reload. One timeout at a time; each wake re-arms the next.
 */
export function useEntryOpenBoundaryTick(
  entryOpenDate: string | null | undefined,
  entryCloseDate: string | null | undefined,
  timezone: string
): void {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const wait = msUntilEntryDayBoundary(entryOpenDate, entryCloseDate, timezone, new Date());
    if (wait === null) return;
    const id = setTimeout(() => setTick(value => value + 1), Math.min(wait + 250, MAX_TIMEOUT_MS));
    return () => clearTimeout(id);
  }, [entryOpenDate, entryCloseDate, timezone, tick]);
}
