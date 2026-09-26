import { useEffect, useMemo, useState, type DependencyList } from 'react';

const REFRESH_INTERVAL_MS = 60_000;

/**
 * One `now` for a page to hand to every time-based count and filter, so a
 * view's badge and the rows it actually shows are always computed against
 * the same clock (Codex P2, UserListToolbar.tsx). Recomputed during render
 * whenever `deps` change (roster data, filters) — a plain `useMemo`, never an
 * effect that calls `setState` off of `deps`, which would loop forever if a
 * caller ever hands in a value that isn't reference-stable across renders —
 * plus on a coarse timer, so a boundary crossed while the page sits open
 * still gets picked up.
 */
export function useRefreshingNow(deps: DependencyList): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick(t => t + 1), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is the caller's own list; tick drives the periodic refresh
  return useMemo(() => Date.now(), [...deps, tick]);
}
