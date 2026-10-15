import { useCallback, useEffect, useState } from 'react';
import {
  adoptHeldRingsideScores,
  countHeldRingsideScores,
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
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void countHeldRingsideScores().then(next => {
        if (!cancelled) setCount(next);
      });
    };
    refresh();
    for (const name of REFRESH_EVENTS) window.addEventListener(name, refresh);
    return () => {
      cancelled = true;
      for (const name of REFRESH_EVENTS) window.removeEventListener(name, refresh);
    };
  }, []);

  const adopt = useCallback(async () => (await adoptHeldRingsideScores()) > 0, []);
  return { count, adopt };
}
