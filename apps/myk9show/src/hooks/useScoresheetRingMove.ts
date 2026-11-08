import { useEffect, useMemo, useRef } from 'react';
import type { CheckInStatus } from '@myk9/core';
import { restoreFromInRing, transitionToInRing, type RingMove } from '@/utils/checkInTransitions';

interface OpenedEntry {
  id: string;
  checkInStatus?: CheckInStatus | undefined;
  ring_entry_time?: string | undefined;
}

export interface ScoresheetRingMove {
  /** The sheet opened for this entry: move it in-ring and remember what that replaced. */
  opened: (entry: OpenedEntry) => void;
  /** A score was saved: leaving must not put the dog back. */
  scored: () => void;
}

/**
 * MYK9-1762: opening a scoresheet moves the dog in-ring; leaving it without a saved
 * score (Cancel, Up, back gesture, or the next dog) puts the dog back where it was.
 * Shared by the ringside and secretary scoresheets. A page reload runs no cleanup,
 * so a dog genuinely mid-run stays in the ring and its Resume still works.
 */
export function useScoresheetRingMove(entryId: string | undefined): ScoresheetRingMove {
  const moveRef = useRef<RingMove | null>(null);
  // The entry whose sheet is open now. A load that finishes after its sheet was left (a
  // fast Cancel or back gesture during the reads) must not move the dog in-ring with
  // nothing left to undo it.
  const liveEntryIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    liveEntryIdRef.current = entryId;
    return () => {
      liveEntryIdRef.current = undefined;
      const move = moveRef.current;
      moveRef.current = null;
      if (move) void restoreFromInRing(move);
    };
  }, [entryId]);

  return useMemo(
    () => ({
      opened: entry => {
        if (liveEntryIdRef.current !== entry.id) return;
        const move = transitionToInRing(entry.id, entry.checkInStatus, entry.ring_entry_time);
        if (move) moveRef.current = move;
      },
      scored: () => {
        moveRef.current = null;
      },
    }),
    []
  );
}
