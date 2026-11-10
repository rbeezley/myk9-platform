import { useEffect, useRef } from 'react';

interface EntryAgreementScopeArgs {
  /** Dogs selected for this entry. */
  dogCount: number;
  /** Classes across every dog in the entry. */
  entryCount: number;
  untick: () => void;
}

/**
 * The entry agreement belongs to the entry being built. Stepping back from Payment to look
 * at Classes or Dogs keeps the tick (owner decision, MYK9-1799). Emptying the entry does
 * not: once the last dog or the last class is gone, what she builds next is a different
 * entry and is agreed to afresh, on whichever step she emptied it.
 *
 * It keys on a count FALLING to zero, not on being zero: a restored draft can mount with
 * its selections still on the way, and that is not a removal.
 */
export function useEntryAgreementScope({
  dogCount,
  entryCount,
  untick,
}: EntryAgreementScopeArgs): void {
  const previous = useRef({ dogCount, entryCount });
  useEffect(() => {
    const before = previous.current;
    previous.current = { dogCount, entryCount };
    const emptied =
      (before.dogCount > 0 && dogCount === 0) || (before.entryCount > 0 && entryCount === 0);
    if (emptied) untick();
  }, [dogCount, entryCount, untick]);
}
