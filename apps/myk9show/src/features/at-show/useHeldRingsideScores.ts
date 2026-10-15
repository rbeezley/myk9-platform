import { useCallback, useEffect, useState } from 'react';
import {
  adoptHeldRingsideScores,
  getHeldRingsideScores,
} from '@/services/replication/heldRingsideScores';

// Events after which the held count may have changed: the queue grew, drained,
// or a score moved owners.
const REFRESH_EVENTS = [
  'replication:mutation-queued',
  'replication:upload-complete',
  'replication:recovery',
] as const;

/**
 * Scores an earlier passcode session on this device left queued for the show the
 * current passcode covers (MYK9-1205). `adopt` hands them to this session and
 * requests an upload; it resolves true when scores moved.
 */
export function useHeldRingsideScores(): { count: number; adopt: () => Promise<boolean> } {
  // The show is remembered with the count: "Upload them" adopts for THAT show only.
  const [held, setHeld] = useState<{ count: number; showId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void getHeldRingsideScores().then(next => {
        if (!cancelled) setHeld(next);
      });
    };
    refresh();
    for (const name of REFRESH_EVENTS) window.addEventListener(name, refresh);
    return () => {
      cancelled = true;
      for (const name of REFRESH_EVENTS) window.removeEventListener(name, refresh);
    };
  }, []);

  const showId = held?.showId;
  const adopt = useCallback(
    async () => showId !== undefined && (await adoptHeldRingsideScores(showId)) > 0,
    [showId]
  );
  return { count: held?.count ?? 0, adopt };
}
