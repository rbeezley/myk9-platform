/**
 * Whether Add Trials mode knows the show's CURRENT trials (MYK9-758).
 *
 * The trial store confirms a snapshot after any successful read of the local
 * replica, which proves IndexedDB answered, not that this show's trials ever
 * arrived. On a cold device that snapshot is empty for the show, and the step
 * offered an enabled "Add First Trial" (with first-trial copy) for a show that
 * already had trials. Known here means: this show's trials scope has a
 * server-derived expected row count, the device holds at least that many rows
 * (the rule offline readiness uses), and the store has re-read the replica
 * since. Online it syncs first, so a count cached on an earlier visit cannot
 * stand in for a show that has since gained trials; offline, or when the sync
 * fails or stalls, the cached count still counts, so the step works offline.
 * A scope never synced stays unknown and reports an error to retry.
 *
 * @module ShowCreationWizard/useAddTrialsExistingTrials
 */

import { useCallback, useEffect, useState } from 'react';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { useTrialStore } from '@/store/trialStore';
import type { ReplicatedReadStatus } from '@/store/trial-store-types';
import { isTrialSnapshotReady } from '@/components/shows/wizard/steps/TrialConfigurationStep.helpers';

/** A stalled network (venue wifi, captive portal) must end in Retry, not a spinner. */
export const SCOPE_SYNC_TIMEOUT_MS = 12_000;

const SCOPE_UNAVAILABLE =
  "We couldn't load this show's current trials. Check your connection, then try again.";

type ScopeResult = { status: 'ready' } | { status: 'error'; error: string };
type ScopeState = ScopeResult & { showId: string; attempt: number };

async function scopeCovered(showId: string): Promise<boolean> {
  const [meta, rows] = await Promise.all([
    replicatedTrialsTable.getSyncMetadata(showId) as Promise<{
      expectedRemoteRows?: number;
    } | null>,
    replicatedTrialsTable.getTrialsByShow(showId),
  ]);
  return meta?.expectedRemoteRows !== undefined && rows.length >= meta.expectedRemoteRows;
}

/** Resolves when the sync settles or the timeout passes, whichever is first; never rejects. */
function syncWithin(showId: string, timeoutMs: number): Promise<void> {
  const sync = replicatedTrialsTable.sync(showId).then(
    () => undefined,
    () => undefined
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>(resolve => {
    timer = setTimeout(resolve, timeoutMs);
  });
  return Promise.race([sync, timeout]).finally(() => clearTimeout(timer));
}

/** Make this show's trials known on the device, then have the store re-read them. */
async function resolveScope(
  showId: string,
  reload: () => Promise<void>,
  timeoutMs: number
): Promise<ScopeResult> {
  try {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      await syncWithin(showId, timeoutMs);
    }
    if (!(await scopeCovered(showId))) return { status: 'error', error: SCOPE_UNAVAILABLE };
    // Re-read the replica so the store holds the rows the scope now covers,
    // not a snapshot confirmed before they landed.
    await reload();
    return { status: 'ready' };
  } catch {
    return { status: 'error', error: SCOPE_UNAVAILABLE };
  }
}

export interface AddTrialsExistingTrials {
  /** True outside Add Trials mode, and in it once the current trials are known. */
  ready: boolean;
  readStatus: ReplicatedReadStatus | undefined;
  readError: string | null | undefined;
  retry: (() => Promise<void>) | undefined;
}

/** @param showId the show being extended; undefined outside Add Trials mode. */
export function useAddTrialsExistingTrials(
  showId: string | undefined,
  syncTimeoutMs = SCOPE_SYNC_TIMEOUT_MS
): AddTrialsExistingTrials {
  const { trialsReadStatus, trialsReadError, trialsHasConfirmedSnapshot, loadTrials } =
    useTrialStore();
  const [scope, setScope] = useState<ScopeState | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!showId) return;
    let live = true;
    void resolveScope(showId, loadTrials, syncTimeoutMs).then(result => {
      if (live) setScope({ ...result, showId, attempt });
    });
    return () => {
      live = false;
    };
  }, [showId, attempt, loadTrials, syncTimeoutMs]);

  const retry = useCallback(async () => {
    setAttempt(value => value + 1);
  }, []);

  if (!showId) {
    return { ready: true, readStatus: undefined, readError: undefined, retry: undefined };
  }

  // A result for another show or an earlier attempt means this one is loading.
  const scopeStatus = scope?.showId === showId && scope.attempt === attempt ? scope : null;
  const ready =
    scopeStatus?.status === 'ready' &&
    isTrialSnapshotReady(trialsReadStatus, trialsHasConfirmedSnapshot);
  // A retry in flight reads as loading, even over a store error it may clear.
  if (!scopeStatus) {
    return { ready: false, readStatus: 'loading', readError: null, retry };
  }
  if (trialsReadStatus === 'error') {
    return { ready: false, readStatus: 'error', readError: trialsReadError, retry };
  }
  if (scopeStatus?.status === 'error') {
    return { ready: false, readStatus: 'error', readError: scopeStatus.error, retry };
  }
  return { ready, readStatus: ready ? 'ready' : 'loading', readError: null, retry };
}
