/**
 * LiveUpdateIndicator — Phase 2.1 of docs/plan-show-presence-phase2.md.
 *
 * An ambient, positive-only freshness signal for show-day live-sync. It sits
 * beside the presence stack and quietly shows when THIS show's data last
 * actually refreshed.
 *
 * Honesty (Codex PR #591 review, P2): the `replication:sync-requested` nudge is
 * only a *pre-sync* signal — `triggerSync` can skip (offline / unauthenticated /
 * already syncing) or fail mid-download. So the nudge alone is NOT proof the
 * cache refreshed. We therefore treat the nudge as "a change was DETECTED"
 * (arm `pending`) and only show "Updated" once a sync has truly COMPLETED — the
 * provider advances `status.lastSyncAt` on success only, never on skip/failure.
 * A pure 60s poll also advances lastSyncAt, but with no pending nudge we ignore
 * it, so the badge stays scoped to THIS show's live activity.
 *
 * INTENT: calm, not noisy (docs/INTENT.md §3 "Calm Over Clever" / "No
 * notification overload"; §4 litmus — nothing reads as broken on show day).
 * Deliberately NOT a toast and NOT a sync/offline/error status:
 *  - appears only after a real, CONFIRMED refresh (never claims fresh data the
 *    cache does not actually have, and an idle show shows nothing),
 *  - positive-only — offline / error / "syncing…" belong in the global sync
 *    dashboard (components/sync/*), not on the show-day surface.
 * Relative-time bucketing keeps the string at "just now" through a burst, so the
 * role="status" region never spams screen readers. Do not "upgrade" this into a
 * spinner or a red error badge — that would break the show-day calm.
 */

import { useContext, useEffect, useState } from 'react';
import { formatRelativeTime } from '@/utils/format';
import { ReplicationSyncContext } from '@/context/ReplicationSyncContext';
import { showLiveSyncEnabled } from './useShowLiveSync';

const SYNC_EVENT = 'replication:sync-requested';
/** Re-render cadence so "Updated just now" decays to "N minutes ago" over time. */
const TICK_MS = 20_000;

export function LiveUpdateIndicator() {
  // Read the sync context NON-throwingly (vs. the useReplicationSync hook, which
  // throws): this ambient widget degrades to nothing outside the provider rather
  // than crashing a host that doesn't supply it.
  const sync = useContext(ReplicationSyncContext);
  const syncedAt = sync?.status.lastSyncAt ? sync.status.lastSyncAt.getTime() : null;

  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  // A show-scoped change was DETECTED (the realtime nudge) — not proof of a
  // refresh on its own, so confirmed only on a real sync completion below.
  const [pending, setPending] = useState(false);
  // Previous completed-sync time, tracked in state for the adjust-during-render
  // comparison (React's "adjust state when a value changes" pattern).
  const [prevSyncedAt, setPrevSyncedAt] = useState<number | null>(syncedAt);
  // Tick only forces the relative-time string to recompute; its value is unused.
  const [, setTick] = useState(0);

  useEffect(() => {
    // Kill switch: inert when live-sync is off. Independent of presence — this is
    // about data, not people.
    if (!showLiveSyncEnabled()) return undefined;
    const onNudge = () => setPending(true);
    window.addEventListener(SYNC_EVENT, onNudge);
    return () => window.removeEventListener(SYNC_EVENT, onNudge);
  }, []);

  // Confirm freshness ONLY when a sync actually completed (syncedAt advanced) for
  // a pending change. Adjust-state-during-render (not an effect): guarded by the
  // comparison so it runs once per advance and never loops.
  if (syncedAt !== prevSyncedAt) {
    setPrevSyncedAt(syncedAt);
    if (syncedAt !== null && pending) {
      setPending(false);
      setLastUpdate(syncedAt);
    }
  }

  // Decay timer runs only once there is something to show.
  useEffect(() => {
    if (lastUpdate === null) return undefined;
    const id = setInterval(() => setTick(n => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [lastUpdate]);

  // INTENT: nothing until a real, confirmed refresh — an idle show shows nothing.
  if (lastUpdate === null) return null;

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title="This show's data updates live"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Updated {formatRelativeTime(new Date(lastUpdate))}
    </span>
  );
}
