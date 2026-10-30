/**
 * Count of overlapping async writes (MYK9-1531).
 *
 * `useMutation` reports only its most recent mutation, so two check-ins whose
 * order of settling is reversed opened the return-refresh hold early. `track`
 * wraps a write; `inFlight` stays above 0 until every wrapped write settles.
 */

import { useCallback, useRef, useState } from 'react';

export function useInFlightCount<Args extends unknown[], Result>(
  write: (...args: Args) => Promise<Result>
): { track: (...args: Args) => Promise<Result>; inFlight: number } {
  const [inFlight, setInFlight] = useState(0);
  const writeRef = useRef(write);
  writeRef.current = write;

  const track = useCallback(async (...args: Args): Promise<Result> => {
    setInFlight(n => n + 1);
    try {
      return await writeRef.current(...args);
    } finally {
      setInFlight(n => n - 1);
    }
  }, []);

  return { track, inFlight };
}
