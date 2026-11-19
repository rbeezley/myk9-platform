import { useEffect, useState } from 'react';
import { msUntilEntryOpenBoundary } from '@/features/_shared/landing/entryOpenBoundary';

/**
 * Re-renders the caller when the entry window's opening boundary passes, so a page left open
 * while entries are pending re-evaluates `getEntryStatus` (reason, copy and Enter action
 * together) without a reload. One timeout at a time, aimed at the next boundary; a long wait
 * for a far-off date simply chains one wake per local day.
 */
export function useEntryOpenBoundaryTick(
  entryOpenDate: string | null | undefined,
  timezone: string
): void {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const wait = msUntilEntryOpenBoundary(entryOpenDate, timezone, new Date());
    if (wait === null) return;
    const id = setTimeout(() => setTick(value => value + 1), wait + 250);
    return () => clearTimeout(id);
  }, [entryOpenDate, timezone, tick]);
}
