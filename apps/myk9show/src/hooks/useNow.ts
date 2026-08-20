import { useEffect, useState } from 'react';

/**
 * A clock that ticks every `intervalMs`.
 *
 * For surfaces that derive staleness or "checked X ago" strings: a `now`
 * frozen at mount can never notice time passing, so a long-lived tab keeps
 * reporting whatever was true when it opened.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
