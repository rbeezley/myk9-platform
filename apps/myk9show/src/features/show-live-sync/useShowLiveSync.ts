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
 * (RLS-authorized, offline-first) is what writes the cache, so offline-first
 * authority stays with the replication layer (CLAUDE.md). We do NOT stand up a
 * parallel realtime engine (the PR #576 mistake) or a second poll — the existing
 * ReplicationSyncProvider 60s poll remains the fallback when this is off or
 * disconnected; the nudge only makes the existing freshness faster.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
 * on change. Mounted once per show via ShowPresenceProvider. Re-renders its host
 * only when the show's trial SET actually changes (React Query structural
 * sharing dedupes equal refetches), so it stays effectively render-free.
 */
export function useShowLiveSync(showId: string | undefined): void {
  const enabled = showLiveSyncEnabled();

  // Reactive trial IDs from the OFFLINE-FIRST replicated cache. `classes` has no
  // `show_id` (FK is `trial_id`), so the classes subscription is scoped to this
  // show's trials. Keyed under 'trials' so the replication sync's ['trials']
  // invalidation refetches it: on a COLD START (fresh device, cache not yet
  // synced) `getTrialsByShow` returns [] and we bind entries-only; when the
  // startup sync fills the cache and invalidates ['trials'], this refetches, the
  // `trialIdKey` below changes, and the effect REBINDS with the class
  // subscriptions — instead of stranding the mount entries-only until remount.
  const { data: trials, isFetched } = useQuery({
    queryKey: ['trials', 'live-sync', showId],
    queryFn: () => replicatedTrialsTable.getTrialsByShow(showId!),
    enabled: enabled && !!showId,
  });

  // Stable, order-independent key. A refetch that returns the same trials (new
  // array reference, same ids) must NOT re-run the subscribe effect — only an
  // actual change to the trial set does (e.g. the cold-start fill, or a trial
  // added mid-session).
  const trialIdKey = (trials ?? [])
    .map(trial => trial.id)
    .sort()
    .join(',');

  useEffect(() => {
    // Kill switch (plan §12 sibling): when off (or no show) the hook is a
    // complete no-op — it opens no channel at all. Also wait for the trials query
    // to settle (`isFetched`) before subscribing, so a warm mount opens ONE
    // channel with its class bindings rather than an entries-only channel that
    // immediately rebinds. On cold start `isFetched` is true with an empty list,
    // so we still bind entries-only and let the refetch add classes later.
    if (!enabled || !showId || !isFetched) return undefined;

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

    const channel: RealtimeChannel = supabase.channel(liveSyncChannelName(showId));
    // High-volume signal: check-ins, scores, placements are all denormalized on
    // `entries` (migration 003), and `entries` has `show_id` for a tight filter.
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'entries', filter: `show_id=eq.${showId}` },
      nudgeSync
    );
    // One binding per trial. `eq` is universally supported; `trial_id=in.(…)` is
    // unverifiable server-side (the client passes `filter` through verbatim) so
    // we avoid it (see plan). Empty until the trials cache fills on cold start —
    // the query above rebinds us when it does.
    const trialIds = trialIdKey ? trialIdKey.split(',') : [];
    for (const trialId of trialIds) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classes', filter: `trial_id=eq.${trialId}` },
        nudgeSync
      );
    }
    channel.subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      if (hasConnected) nudgeSync(); // reconnect catch-up
      hasConnected = true;
    });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [enabled, showId, isFetched, trialIdKey]);
}
