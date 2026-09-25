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
 * since. A scope synced on an earlier visit counts, so the step still works
 * offline; a scope never synced stays unknown and reports an error to retry.
 *
 * @module ShowCreationWizard/useAddTrialsExistingTrials
 */

import { useCallback, useEffect, useState } from 'react';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { useTrialStore } from '@/store/trialStore';
import type { ReplicatedReadStatus } from '@/store/trial-store-types';
import { isTrialSnapshotReady } from '@/components/shows/wizard/steps/TrialConfigurationStep.helpers';

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

/** Make this show's trials known on the device, then have the store re-read them. */
async function resolveScope(showId: string, reload: () => Promise<void>): Promise<ScopeResult> {
  try {
    if (await scopeCovered(showId)) {
      // Known from an earlier visit: usable now (and offline); refresh quietly.
      void replicatedTrialsTable.sync(showId);
    } else {
      await replicatedTrialsTable.sync(showId);
      if (!(await scopeCovered(showId))) return { status: 'error', error: SCOPE_UNAVAILABLE };
    }
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
export function useAddTrialsExistingTrials(showId: string | undefined): AddTrialsExistingTrials {
  const { trialsReadStatus, trialsReadError, trialsHasConfirmedSnapshot, loadTrials } =
    useTrialStore();
  const [scope, setScope] = useState<ScopeState | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!showId) return;
    let live = true;
    void resolveScope(showId, loadTrials).then(result => {
      if (live) setScope({ ...result, showId, attempt });
    });
    return () => {
      live = false;
    };
  }, [showId, attempt, loadTrials]);

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
  if (trialsReadStatus === 'error') {
    return { ready: false, readStatus: 'error', readError: trialsReadError, retry };
  }
  if (scopeStatus?.status === 'error') {
    return { ready: false, readStatus: 'error', readError: scopeStatus.error, retry };
  }
  return { ready, readStatus: ready ? 'ready' : 'loading', readError: null, retry };
}
