import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { classHasUnsyncedScores } from '@/features/results-tab/useClassUnsyncedScores';
import { useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import { getFileScoreChangesSince } from '@/services/database/entries/scoreAudit';
import { replicatedEntriesTable } from '@/services/replication';
import { oldestNewestSentAt } from './submissionTimes';
import type { ScoreChangeRead, WhatIsLeftInput } from './whatIsLeft';

/** A burst of replica notices (one per entry written) is one re-read. */
export const SENT_CHECK_DEBOUNCE_MS = 2000;
/** A steady stream of notices cannot postpone the re-check past this. */
export const SENT_CHECK_MAX_WAIT_MS = 10_000;
/** While an app-sent file exists, re-read this often even with no notice (a judge's device scored). */
export const SENT_CHECK_REFETCH_MS = 60_000;

/** `true` = a score change waits in this device's queue; `'error'` = the queue could not be read. */
type QueueState = boolean | 'error';

/**
 * What the Finish the show list, the close step and the send step need to say whether the results
 * file still matches the scores (MYK9-2078): the send records, and the newest change to a score
 * the file carries, from the score history.
 *
 * Fresh by events, not by key: the query key is only the show and the oldest send time, and the
 * history is re-read whenever the replicated entries table reports a change (debounced) and every
 * minute while a sent file exists. It is the online-only admin audit read, taken only once a file
 * the app sent exists. `unreadable` covers a failed or offline read, and a score change still
 * waiting in this device's queue (or a queue that cannot be read): the history cannot describe
 * it, so the screens say they cannot tell instead of ticking a file that may be out of date.
 * `classes` is `null` while the show's schedule has not loaded: with no classes to look at the file
 * would read as current, so that is `loading`, never an all-clear.
 */
export function useResultsSentCheck(
  showId: string,
  classes: readonly { id: string }[] | null
): Pick<WhatIsLeftInput, 'submissions' | 'scoreChanges'> {
  const queryClient = useQueryClient();
  const submissionsQuery = useResultSubmissions(showId);
  const submissions = submissionsQuery.data ?? null;
  const since = useMemo(() => oldestNewestSentAt(submissions), [submissions]);
  const classKey = useMemo(() => (classes ?? []).map(cls => cls.id).join(','), [classes]);
  const ready = classes !== null;
  const enabled = since !== null && ready;

  // `dirtyAt` is when the history last went out of date (a queued change just synced, or the
  // replica reported a change): data read before it is not shown as the answer.
  const [queue, setQueue] = useState<{ key: string; state: QueueState; dirtyAt: number } | null>(
    null
  );
  const stateRef = useRef<QueueState | null>(null);
  const dirtyRef = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const ids = classKey ? classKey.split(',') : [];
    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let maxWait: ReturnType<typeof setTimeout> | undefined;
    const recheck = async (fromNotice: boolean) => {
      clearTimeout(debounce);
      clearTimeout(maxWait);
      debounce = maxWait = undefined;
      let state: QueueState;
      try {
        state = (await Promise.all(ids.map(id => classHasUnsyncedScores(id)))).some(Boolean);
      } catch {
        state = 'error';
      }
      if (cancelled) return;
      const wasClear = stateRef.current === false;
      const firstRead = stateRef.current === null;
      stateRef.current = state;
      // Taken now, not inside the state updater: that runs on the next render, after the re-read
      // this triggers may already have landed, and fresh data would then look older than this.
      if (state === false && (fromNotice || (!wasClear && !firstRead)))
        dirtyRef.current = Date.now();
      setQueue({ key: classKey, state, dirtyAt: dirtyRef.current });
      if (fromNotice && state === false) {
        void queryClient.invalidateQueries({ queryKey: ['results-sent-check', showId] });
      }
    };
    stateRef.current = null;
    void recheck(false);
    const unsubscribe = replicatedEntriesTable.subscribe(
      () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void recheck(true), SENT_CHECK_DEBOUNCE_MS);
        maxWait ??= setTimeout(() => void recheck(true), SENT_CHECK_MAX_WAIT_MS);
      },
      { emitCurrent: false }
    );
    // A queue read that failed, or a change still waiting, is looked at again on the minute.
    const interval = setInterval(() => {
      if (stateRef.current !== false) void recheck(false);
    }, SENT_CHECK_REFETCH_MS);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearTimeout(maxWait);
      clearInterval(interval);
      unsubscribe();
    };
  }, [classKey, enabled, queryClient, showId]);
  const current = enabled && queue?.key === classKey ? queue : null;
  const queueState = current?.state ?? null;

  const audits = useQuery({
    queryKey: ['results-sent-check', showId, since],
    queryFn: () => getFileScoreChangesSince(showId, since ?? ''),
    enabled: enabled && queueState === false,
    staleTime: 0,
    refetchInterval: SENT_CHECK_REFETCH_MS,
    retry: false,
  });
  const scoreChanges = useMemo<ScoreChangeRead | undefined>(() => {
    if (since === null) return undefined;
    if (!ready) return { status: 'loading' };
    if (queueState === true || queueState === 'error' || audits.isError) {
      return { status: 'unreadable' };
    }
    if (audits.fetchStatus === 'paused' && !audits.data) return { status: 'unreadable' };
    if (!audits.data || audits.dataUpdatedAt < (current?.dirtyAt ?? 0))
      return { status: 'loading' };
    return { status: 'read', latestByClass: audits.data };
  }, [
    audits.data,
    audits.dataUpdatedAt,
    audits.fetchStatus,
    audits.isError,
    current,
    queueState,
    ready,
    since,
  ]);
  return useMemo(() => ({ submissions, scoreChanges }), [submissions, scoreChanges]);
}
