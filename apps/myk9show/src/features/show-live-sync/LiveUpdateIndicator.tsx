/**
 * LiveUpdateIndicator — Phase 2.1 of docs/plan-show-presence-phase2.md.
 *
 * An ambient, positive-only freshness signal for show-day live-sync. It sits
 * beside the presence stack and quietly shows when THIS show's data last
 * refreshed live (the `replication:sync-requested` nudge from useShowLiveSync).
 *
 * INTENT: calm, not noisy (docs/INTENT.md §3 "Calm Over Clever" / "No
 * notification overload"; §4 litmus — nothing that reads as broken on show day).
 * This is deliberately NOT a toast and NOT a sync/offline/error status:
 *  - it appears only AFTER a real update (never claims "live" without proof),
 *  - it shows only the positive "Updated just now → N ago" freshness,
 *  - offline / error / "syncing…" belong in the global sync dashboard, not here.
 * Do not "upgrade" this into a spinner or a red error badge — that would break
 * the show-day calm. Relative-time bucketing also naturally throttles the
 * aria-live announcement (the string stays "just now" through a burst of
 * updates), so a busy show never spams screen readers.
 */

import { useEffect, useState } from 'react';
import { formatRelativeTime } from '@/utils/format';
import { showLiveSyncEnabled } from './useShowLiveSync';

const SYNC_EVENT = 'replication:sync-requested';
/** Re-render cadence so "Updated just now" decays to "N minutes ago" over time. */
const TICK_MS = 20_000;
/** Brief dot emphasis right after an update — purposeful motion, not decoration. */
const PULSE_MS = 2_000;

export function LiveUpdateIndicator() {
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [pulsing, setPulsing] = useState(false);
  // Tick only forces the relative-time string to recompute; its value is unused.
  const [, setTick] = useState(0);

  useEffect(() => {
    // Kill switch: when live-sync is off the indicator is inert (no listener,
    // never appears). Independent of presence — this is about data, not people.
    if (!showLiveSyncEnabled()) return undefined;

    let pulseTimer: ReturnType<typeof setTimeout> | null = null;
    const onSync = () => {
      setLastUpdate(Date.now());
      setPulsing(true);
      if (pulseTimer) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => setPulsing(false), PULSE_MS);
    };
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync);
      if (pulseTimer) clearTimeout(pulseTimer);
    };
  }, []);

  // Decay timer runs only once there is something to show.
  useEffect(() => {
    if (lastUpdate === null) return undefined;
    const id = setInterval(() => setTick(t => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [lastUpdate]);

  // INTENT: nothing until the first real update — an idle show shows nothing.
  if (lastUpdate === null) return null;

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title="This show's data updates live"
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full bg-emerald-500${pulsing ? ' animate-pulse' : ''}`}
      />
      Updated {formatRelativeTime(new Date(lastUpdate))}
    </span>
  );
}
