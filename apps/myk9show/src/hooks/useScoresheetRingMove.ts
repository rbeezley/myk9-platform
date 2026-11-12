import { useEffect, useMemo, useRef } from 'react';
import { restoreFromInRing, transitionToInRing, type RingMove } from '@/utils/checkInTransitions';

export interface ScoresheetRingMove {
  /** Remember the loaded entry without changing its status. */
  opened: (id: string) => void;
  /** Start the live run and remember the state to restore if it is abandoned. */
  start: () => void;
  /** A score was saved: leaving must not put the dog back. */
  scored: () => void;
}

/**
 * Starting the timer moves the dog in-ring; leaving it without a saved
 * score (Cancel, Up, back gesture, or the next dog) puts the dog back where it was.
 * Shared by the ringside and secretary scoresheets. A page reload runs no cleanup,
 * so a dog genuinely mid-run stays in the ring and its Resume still works.
 */
export function useScoresheetRingMove(entryId: string | undefined): ScoresheetRingMove {
  const moveRef = useRef<RingMove | null>(null);
  const loadedEntryIdRef = useRef<string | undefined>(undefined);
  // Ignore a late load if navigation has already left that entry.
  const liveEntryIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    liveEntryIdRef.current = entryId;
    return () => {
      liveEntryIdRef.current = undefined;
      loadedEntryIdRef.current = undefined;
      const move = moveRef.current;
      moveRef.current = null;
      if (move) void restoreFromInRing(move);
    };
  }, [entryId]);

  return useMemo(
    () => ({
      opened: id => {
        if (liveEntryIdRef.current === id) loadedEntryIdRef.current = id;
      },
      start: () => {
        const id = loadedEntryIdRef.current;
        if (!id || id !== liveEntryIdRef.current || moveRef.current) return;
        moveRef.current = transitionToInRing(id);
      },
      scored: () => {
        loadedEntryIdRef.current = undefined;
        moveRef.current = null;
      },
    }),
    []
  );
}
