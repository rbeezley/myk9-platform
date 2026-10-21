/**
 * Show-scoped live-update nudge.
 *
 * Broadcast carries no row data. It only asks ReplicationSyncProvider to run
 * its existing incremental sync, keeping the offline-first replica authoritative.
 * The provider's poll remains the correctness fallback: 60 s, or 3-5 min while
 * the show channel is SUBSCRIBED (MYK9-1305).
 */

import { useEffect } from 'react';
import { markRealtimeReconnected } from '@myk9/replication';
import { features } from '@/config/features';
import {
  clearShowChannel,
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
import { scheduleShowNudge } from './showNudgeGate';

const NUDGE_DEBOUNCE_MS = 400;

/**
 * The scoped sync targets for the tables a broadcast named. Classes replicate
 * per trial, so a classes change is one target per trial of the show. Returns
 * null when no target can be named (a classes change on a replica with no
 * trials): a scoped pass with no target would sync nothing, so the caller falls
 * back to the bare full pass. paperwork_prints is scoped by show id.
 */
async function targetsForTables(
  showId: string,
  tables: ReadonlySet<ShowChangeTable>
): Promise<UploadSyncTarget[] | null> {
  const targets: UploadSyncTarget[] = [];
  if (tables.has('entries')) targets.push({ name: 'entries', scopeId: showId });
  if (tables.has('paperwork_prints')) targets.push({ name: 'paperwork_prints', scopeId: showId });
  if (tables.has('classes')) {
    const trials = await replicatedTrialsTable.getTrialsByShow(showId);
    if (!trials.length) return null;
    for (const trial of trials) targets.push({ name: 'classes', scopeId: trial.id });
  }
  return targets.length ? targets : null;
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

    // MYK9-1304: a change broadcast syncs only what changed, spaced per show by
    // the gate. The fire is show-level and mount-independent (it reads the
    // replica and dispatches a window event), so one of two mounts for a show
    // unmounting never drops the other's pending nudge. The deferred reconnect
    // path below is deliberately separate.
    const scopedChange = (table: ShowChangeTable) => {
      scheduleShowNudge(showId, new Set([table]), tables => {
        void targetsForTables(showId, tables)
          .catch(() => null)
          .then(targets => {
            window.dispatchEvent(
              targets
                ? new CustomEvent('replication:sync-requested', { detail: { targets } })
                : new Event('replication:sync-requested')
            );
          });
      });
    };

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
      unsubscribe();
      clearShowChannel(mountToken);
    };
  }, [enabled, showId]);
}
