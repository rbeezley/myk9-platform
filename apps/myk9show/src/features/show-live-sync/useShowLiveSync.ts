/**
 * useShowLiveSync — Phase 2 of docs/plan-show-presence.md (live-update nudge).
 *
 * Opens a show-scoped Supabase Realtime channel on `entries` + `classes` and,
 * on any change, debounces then dispatches `replication:sync-requested` — the
 * event ReplicationSyncProvider already listens for to run an INCREMENTAL sync
 * (upload pending mutations, fan out `table.sync()`, invalidate React Query).
 * This makes in-show surfaces refresh live (~1-2s) instead of waiting for the
 * 60s background poll.
 *
 * Deliberately reads NOTHING from the realtime payload: the replication sync
 * (RLS-authorized, offline-first) is what writes the cache. We do NOT stand up a
 * parallel realtime engine (the PR #576 mistake) or a second poll — the existing
 * ReplicationSyncProvider 60s poll remains the fallback when this is off or
 * disconnected; the nudge only makes the existing freshness faster.
 */

import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/supabaseClient';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { features } from '@/config/features';

/** Collapse a burst of row changes (e.g. a bulk check-in) into one sync nudge. */
const NUDGE_DEBOUNCE_MS = 400;

/**
 * Kill switch (plan §Kill switch). Off by default via `features.showLiveSync`;
 * an env override (`VITE_SHOW_LIVE_SYNC=true`) enables it for E2E / live
 * validation without editing the const. Evaluated at call time so the flag can
 * be toggled in tests.
 */
export function showLiveSyncEnabled(): boolean {
  return features.showLiveSync || import.meta.env?.VITE_SHOW_LIVE_SYNC === 'true';
}

/** Realtime channel name for a show's live-sync subscription. One per show per tab. */
export function liveSyncChannelName(showId: string): string {
  return `show-live:${showId}`;
}

/**
 * Subscribe to the show's live data and nudge the incremental replication sync
 * on change. Pure side effect — returns nothing and holds no React state, so it
 * never re-renders its host. Mounted once per show via ShowPresenceProvider.
 */
export function useShowLiveSync(showId: string | undefined): void {
  useEffect(() => {
    // Kill switch (plan §12 sibling): when off (or no show) the hook is a
    // complete no-op — it opens no channel at all.
    if (!showLiveSyncEnabled() || !showId) return undefined;

    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    // The first SUBSCRIBED is the initial connect — provider startup sync already
    // covers mount, so we don't nudge. A later SUBSCRIBED is a reconnect: catch
    // up on anything missed during the gap.
    let hasConnected = false;

    // Debounced bare nudge. No detail: the sync, not the payload, writes the
    // cache, so offline-first authority stays with the replication layer.
    const nudgeSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        window.dispatchEvent(new Event('replication:sync-requested'));
      }, NUDGE_DEBOUNCE_MS);
    };

    void (async () => {
      // Local read of the already-synced replicated trials (IndexedDB, not a
      // network call). `classes` has no `show_id` (FK is `trial_id`), so we scope
      // the classes subscription to this show's trials.
      let trialIds: string[] = [];
      try {
        const trials = await replicatedTrialsTable.getTrialsByShow(showId);
        trialIds = trials.map(trial => trial.id);
      } catch {
        // A trials-read failure must never crash the host subtree — fall back to
        // entries-only; the 60s poll keeps class-status fresh until next remount.
        trialIds = [];
      }
      // The effect may have been torn down (StrictMode double-mount / navigation)
      // while the async read was in flight — never open a channel after cleanup.
      if (cancelled) return;

      const ch = supabase.channel(liveSyncChannelName(showId));
      // High-volume signal: check-ins, scores, placements are all denormalized on
      // `entries` (migration 003), and `entries` has `show_id` for a tight filter.
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries', filter: `show_id=eq.${showId}` },
        nudgeSync
      );
      // One binding per trial. `eq` is universally supported; `trial_id=in.(…)` is
      // unverifiable server-side (the client passes `filter` through verbatim) so
      // we avoid it (see plan). Typical shows have 1-6 trials.
      for (const trialId of trialIds) {
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'classes', filter: `trial_id=eq.${trialId}` },
          nudgeSync
        );
      }
      ch.subscribe(status => {
        if (status !== 'SUBSCRIBED') return;
        if (hasConnected) nudgeSync(); // reconnect catch-up
        hasConnected = true;
      });
      channel = ch;
    })();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [showId]);
}
