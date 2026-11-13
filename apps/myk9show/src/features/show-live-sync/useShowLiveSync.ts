/**
 * Show-scoped live-update nudge.
 *
 * Broadcast carries no row data. It only asks ReplicationSyncProvider to run
 * its existing incremental sync, keeping the offline-first replica authoritative.
 * The provider's poll cannot be the fallback for a show's entries: it has no
 * show scope and never downloads them (MYK9-1923). This hook polls the show's
 * scoped entries and classes itself (`showFallbackPoll`), briskly while the
 * channel is down and slowly as a safety net while it is SUBSCRIBED.
 */

import { useEffect } from 'react';
import { markRealtimeReconnected } from '@myk9/replication';
import { features } from '@/config/features';
import {
  clearShowChannel,
  isCadenceOnline,
  markShowChannel,
  registerShowChannelMount,
} from '@/providers/syncCadence';
import { replicatedClassesTable, replicatedTrialsTable } from '@/services/replication';
import type { UploadSyncTarget } from '@/providers/ringsideUploadSyncTargets';
import {
  subscribeToShowChanges,
  type ShowChangeSignal,
  type ShowChangeTable,
} from './showChangeSignal';
import { isShowPollSlow, showFallbackPollDelayMs } from './showFallbackPoll';
import { scheduleShowNudge } from './showNudgeGate';

const NUDGE_DEBOUNCE_MS = 400;

/**
 * The scoped sync targets for the tables a broadcast (or the poll) named. Classes
 * replicate per trial, so a classes change is one target per trial of the show.
 * The entries and paperwork targets never depend on the classes lookup: a device
 * with no trials in its replica (cold, partly synced) still gets its entries pass.
 * `fullPass` is true when a classes change could not be named (no trials in the
 * replica, or the lookup failed): a scoped pass would sync none of it, so the
 * caller also asks for the bare full pass. paperwork_prints is scoped by show id.
 */
async function targetsForTables(
  showId: string,
  tables: ReadonlySet<ShowChangeTable>
): Promise<{ targets: UploadSyncTarget[]; fullPass: boolean }> {
  const targets: UploadSyncTarget[] = [];
  let fullPass = false;
  if (tables.has('entries')) targets.push({ name: 'entries', scopeId: showId });
  if (tables.has('paperwork_prints')) targets.push({ name: 'paperwork_prints', scopeId: showId });
  if (tables.has('classes')) {
    try {
      const trials = await replicatedTrialsTable.getTrialsByShow(showId);
      for (const trial of trials) targets.push({ name: 'classes', scopeId: trial.id });
      fullPass = !trials.length;
    } catch {
      fullPass = true;
    }
  }
  return { targets, fullPass: fullPass || !targets.length };
}

/**
 * The one fire for the nudge gate, shared by broadcasts and the poll (the gate keeps only the
 * latest fire, so two different ones would let a poll tick replace a pending broadcast's
 * fallback). The scoped pass goes out for what could be named; the bare full pass goes out when
 * nothing could be named or a classes change had no trial to scope to.
 */
function fireScopedPass(showId: string, tables: ReadonlySet<ShowChangeTable>): void {
  void targetsForTables(showId, tables)
    .catch(() => ({ targets: [] as UploadSyncTarget[], fullPass: true }))
    .then(({ targets, fullPass }) => {
      if (targets.length)
        window.dispatchEvent(
          new CustomEvent('replication:sync-requested', { detail: { targets } })
        );
      if (fullPass) window.dispatchEvent(new Event('replication:sync-requested'));
    });
}

/**
 * A scoped pass only syncs `classes:{trialId}` for trials already in the
 * replica, so a signal naming a class this device has not got (just created, or
 * moved into an unsynced trial) needs the full pass.
 */
async function namesUnknownClass(signal: ShowChangeSignal): Promise<boolean> {
  if (signal.table !== 'classes' || !signal.classIds?.length) return false;
  for (const classId of signal.classIds)
    if (!(await replicatedClassesTable.getClassById(classId))) return true;
  return false;
}

export function showLiveSyncEnabled(): boolean {
  return features.showLiveSync || import.meta.env?.VITE_SHOW_LIVE_SYNC === 'true';
}

export function useShowLiveSync(showId: string | undefined): void {
  const enabled = showLiveSyncEnabled();

  useEffect(() => {
    if (!enabled || !showId) return undefined;

    const mountToken = registerShowChannelMount(showId);
    let unmounted = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let hasConnected = false;
    let explicitPending = false;
    let subscribed = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    // MYK9-1304: a change broadcast syncs only what changed, spaced per show by
    // the gate. The fire is show-level and mount-independent (it reads the
    // replica and dispatches a window event), so one of two mounts for a show
    // unmounting never drops the other's pending nudge. The deferred reconnect
    // path below is deliberately separate.
    const scopedChange = (table: ShowChangeTable) => {
      scheduleShowNudge(showId, new Set([table]), tables => fireScopedPass(showId, tables));
    };

    // MYK9-1923: fallback poll. A hidden tab or an offline device skips its tick (no request) and
    // the next tick catches it up. Rides the nudge gate with the same fire as a broadcast, so it
    // is spaced, coalesced and never displaces a pending broadcast's fallback. A status change
    // re-arms only when the new delay is EARLIER than the pending timer, so a status flapping
    // faster than the interval cannot starve the poll.
    let pollDueAt = 0;
    const armPoll = (onlyIfEarlier: boolean) => {
      const delay = showFallbackPollDelayMs(isShowPollSlow(subscribed));
      const dueAt = performance.now() + delay;
      if (onlyIfEarlier && pollTimer && dueAt >= pollDueAt) return;
      if (pollTimer) clearTimeout(pollTimer);
      pollDueAt = dueAt;
      pollTimer = setTimeout(() => {
        if (unmounted) return;
        if (document.visibilityState !== 'hidden' && isCadenceOnline()) {
          scheduleShowNudge(showId, new Set<ShowChangeTable>(['entries', 'classes']), tables =>
            fireScopedPass(showId, tables)
          );
        }
        armPoll(false);
      }, delay);
    };
    armPoll(false);

    // A change nudge is explicit: run now. A reconnect nudge is `deferred`:
    // events may have been missed while the channel was down, so a pass is owed,
    // but the provider must not full-sync on every reconnect (MYK9-1054).
    const nudgeSync = (deferred = false) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      // A change in the same window as a reconnect keeps the prompt pass.
      explicitPending ||= !deferred;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        const isDeferred = !explicitPending;
        explicitPending = false;
        window.dispatchEvent(
          isDeferred
            ? new CustomEvent('replication:sync-requested', { detail: { deferred: true } })
            : new Event('replication:sync-requested')
        );
      }, NUDGE_DEBOUNCE_MS);
    };

    const unsubscribe = subscribeToShowChanges(
      showId,
      signal => {
        // A `reconcile:{classId}` envelope (signal.id) means a full sync that
        // can remove a hard-deleted class, which a scoped delta never sees.
        if (!features.replicationScopedNudges || signal.id) return nudgeSync();
        // No class lookup to wait for: schedule in the same tick.
        if (signal.table !== 'classes' || !signal.classIds?.length)
          return scopedChange(signal.table);
        void namesUnknownClass(signal)
          .catch(() => true)
          .then(needsFullPass => {
            if (unmounted) return;
            if (needsFullPass) nudgeSync();
            else scopedChange(signal.table);
          });
      },
      status => {
        // MYK9-1305: the 3-5 min poll holds only while the channel is SUBSCRIBED.
        markShowChannel(mountToken, status === 'SUBSCRIBED');
        if (subscribed !== (status === 'SUBSCRIBED')) {
          subscribed = status === 'SUBSCRIBED';
          armPoll(true);
        }
        if (status !== 'SUBSCRIBED') return;
        if (hasConnected) {
          // MYK9-1301: events may have been missed, so the next count pass runs
          // even when a change coalesces this reconnect into a bare nudge.
          markRealtimeReconnected();
          nudgeSync(true);
        }
        hasConnected = true;
      }
    );

    return () => {
      unmounted = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (pollTimer) clearTimeout(pollTimer);
      unsubscribe();
      clearShowChannel(mountToken);
    };
  }, [enabled, showId]);
}
