/**
 * Whether a just-saved score has reached the server (MYK9-1023): the durable
 * queue state, confirmed by an authenticated readback that matches this exact
 * scored run. Offline-first: a failed or missing read never counts as proof.
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';

export type ScoreSaveState = 'pending' | 'acknowledged' | 'failed';

const SCORE_DETAIL_KEYS = [
  'area1_time_seconds',
  'area2_time_seconds',
  'area3_time_seconds',
  'area4_time_seconds',
  'total_correct_finds',
  'total_incorrect_finds',
  'no_finish_count',
  'points_earned',
  'disqualification_reason',
] as const;

function sameScoredRun(local: ReplicatedEntry, remote: ReplicatedEntry): boolean {
  const localCompletedAt = local.scoringCompletedAt ?? local.scoring_completed_at;
  const remoteCompletedAt = remote.scoringCompletedAt ?? remote.scoring_completed_at;
  return (
    !!localCompletedAt &&
    !!remoteCompletedAt &&
    Date.parse(localCompletedAt) === Date.parse(remoteCompletedAt) &&
    (local.resultStatus ?? local.result_status) === (remote.resultStatus ?? remote.result_status) &&
    (local.searchTimeSeconds ?? local.search_time_seconds) ===
      (remote.searchTimeSeconds ?? remote.search_time_seconds) &&
    (local.totalFaults ?? local.total_faults) === (remote.totalFaults ?? remote.total_faults) &&
    SCORE_DETAIL_KEYS.every(key => (local[key] ?? null) === (remote[key] ?? null))
  );
}

interface ScoreSaveSnapshot {
  entryId: string | undefined;
  state: ScoreSaveState;
  /** A completed check found the score still queued (not just the initial default). */
  sawQueued: boolean;
}

export function useScoreSaveState(entryId: string | undefined): {
  state: ScoreSaveState;
  sawQueued: boolean;
} {
  const [snapshot, setSnapshot] = useState<ScoreSaveSnapshot>({
    entryId,
    state: 'pending',
    sawQueued: false,
  });
  const current = snapshot.entryId === entryId ? snapshot : null;
  const state = current?.state ?? 'pending';
  const sawQueued = current?.sawQueued ?? false;
  const updateState = (next: ScoreSaveState) =>
    setSnapshot(prev => {
      const base =
        prev.entryId === entryId ? prev : { entryId, state: 'pending' as const, sawQueued: false };
      const sawQueued = base.sawQueued || next !== 'acknowledged';
      if (base.state === next && base.sawQueued === sawQueued && prev === base) return prev;
      return { entryId, state: next, sawQueued };
    });

  useEffect(() => {
    if (!entryId || state === 'acknowledged') return;
    let cancelled = false;
    let inFlight = false;
    let local: ReplicatedEntry | null = null;

    const check = async () => {
      // Battery: a phone in a pocket has nothing to show; re-check on return.
      if (inFlight || cancelled || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        local ??= await replicatedEntriesTable.getEntryById(entryId);
        if (!local) return;
        const upload = await replicatedEntriesTable.getScoreUploadState(entryId);
        if (cancelled) return;
        if (navigator.onLine) {
          try {
            const remote = await replicatedEntriesTable.readScoreFromServer(entryId);
            if (cancelled) return;
            // A failed older edit can remain on this row after this score reaches
            // the server. Matching readback is stronger proof than queue state.
            if (remote && sameScoredRun(local, remote)) {
              updateState('acknowledged');
              return;
            }
          } catch {
            // Keep the durable queue state below when readback is unavailable.
          }
        }
        updateState(upload === 'failed' ? 'failed' : 'pending');
      } catch {
        // A failed read is not proof that the server has the score.
        if (!cancelled) updateState('pending');
      } finally {
        inFlight = false;
      }
    };

    // Battery: back off 3s → 6s → 12s → 24s → 30s while unconfirmed. Replica
    // changes, regaining signal and unlocking the phone still check at once.
    let delay = 3000;
    let timer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(() => {
        void check();
        delay = Math.min(delay * 2, 30_000);
        schedule();
      }, delay);
    };
    // Regaining signal or unlocking the phone checks now and restarts the
    // backoff at 3s, so a just-flushed upload is confirmed promptly.
    const restart = () => {
      window.clearTimeout(timer);
      delay = 3000;
      schedule();
      void check();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') restart();
    };

    const unsubscribe = replicatedEntriesTable.subscribe(() => void check());
    window.addEventListener('online', restart);
    document.addEventListener('visibilitychange', onVisible);
    schedule();
    void check();
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener('online', restart);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearTimeout(timer);
    };
  }, [entryId, state]);

  return { state, sawQueued };
}

/** Live `navigator.onLine`, so the offline wording flips when signal returns. */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * MYK9-1023: a score that was queued (not yet on the server) and is later
 * acknowledged gets a brief toast, so a judge who lost signal can see it landed.
 * A score acknowledged on the first check never toasts.
 */
export function useScoresSentToast(saveState: ScoreSaveState, sawQueued: boolean): void {
  const toasted = useRef(false);
  useEffect(() => {
    if (saveState === 'acknowledged' && sawQueued && !toasted.current) {
      toasted.current = true;
      toast.success('Scores sent');
    }
  }, [saveState, sawQueued]);
}
