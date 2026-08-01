import { useEffect, useState } from 'react';

export interface ContainmentState {
  /** True while the replication layer is holding ringside score uploads. */
  active: boolean;
  /** Epoch ms the pause is expected to lift, or null when not contained. */
  until: number | null;
}

/**
 * Tracks the replication layer's MYK9-115 containment pause.
 *
 * INTENT: this is a REPORTING hook, not a control. Scores are already saved
 * locally and the outbox resumes on its own; the only thing missing without a
 * banner is the judge knowing why the queue stopped draining — and a queue that
 * silently stops looks exactly like lost work. Do not add retry controls here:
 * the server asked this device to wait, and a "retry now" button would let a
 * worried judge hammer the breaker that is protecting the show.
 *
 * Listens on `window` directly, matching how the replication layer broadcasts.
 */
export function useReplicationContainment(): ContainmentState {
  const [until, setUntil] = useState<number | null>(null);

  useEffect(() => {
    const onContainment = (event: Event) => {
      const detail = (event as CustomEvent<{ until?: unknown }>).detail;
      const next = detail?.until;
      // A malformed event must be inert. The alternative — trusting the payload
      // — puts a banner on screen that no timer will ever clear.
      if (typeof next !== 'number' || !Number.isFinite(next)) return;
      // Reject an already-elapsed deadline HERE rather than letting the effect
      // below clear it. Setting state synchronously inside an effect trips
      // react-hooks/set-state-in-effect and causes a cascading render; filtering
      // at the source means the effect only ever schedules a timer.
      if (next <= Date.now()) return;
      // Re-arms extend, never shorten: take the later deadline so a second
      // RS429 mid-pause cannot cut the banner short while uploads are still held.
      setUntil(current => (current === null || next > current ? next : current));
    };

    window.addEventListener('replication:containment', onContainment);
    return () => window.removeEventListener('replication:containment', onContainment);
  }, []);

  useEffect(() => {
    if (until === null) return;
    // Always a timer, never a synchronous clear — a 0ms timeout still defers to
    // the next tick, so the state update never happens during the effect.
    const timer = setTimeout(() => setUntil(null), Math.max(until - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [until]);

  return { active: until !== null, until };
}
