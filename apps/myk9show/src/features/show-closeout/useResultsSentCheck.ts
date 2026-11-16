import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { classHasUnsyncedScores } from '@/features/results-tab/useClassUnsyncedScores';
import { useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import { getFileScoreChangesSince } from '@/services/database/entries/scoreAudit';
import { replicatedEntriesTable } from '@/services/replication';
import type { ScoreChangeRead, WhatIsLeftInput } from './whatIsLeft';

/** A burst of replica notices (one per entry written) is one re-read. */
export const SENT_CHECK_DEBOUNCE_MS = 2000;
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
 */
export function useResultsSentCheck(
  showId: string,
  classes: readonly { id: string }[]
): Pick<WhatIsLeftInput, 'submissions' | 'scoreChanges'> {
  const queryClient = useQueryClient();
  const submissionsQuery = useResultSubmissions(showId);
  const submissions = submissionsQuery.data ?? null;
  const since = useMemo(() => {
    const newestByOrg = new Map<string, number>();
    for (const row of submissions ?? []) {
      if (row.status !== 'sent') continue;
      const at = Date.parse(row.submitted_at);
      const org = (row.organization ?? '').toUpperCase();
      if (!Number.isNaN(at) && at > (newestByOrg.get(org) ?? -Infinity)) newestByOrg.set(org, at);
    }
    const oldest = Math.min(...newestByOrg.values());
    return Number.isFinite(oldest) ? new Date(oldest).toISOString() : null;
  }, [submissions]);
  const classKey = useMemo(() => classes.map(cls => cls.id).join(','), [classes]);
  const enabled = since !== null;

  const [queue, setQueue] = useState<{ key: string; state: QueueState } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const ids = classKey ? classKey.split(',') : [];
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recheck = async (fromNotice: boolean) => {
      let state: QueueState;
      try {
        state = (await Promise.all(ids.map(id => classHasUnsyncedScores(id)))).some(Boolean);
      } catch {
        state = 'error';
      }
      if (cancelled) return;
      setQueue({ key: classKey, state });
      if (fromNotice && state === false) {
        void queryClient.invalidateQueries({ queryKey: ['results-sent-check', showId] });
      }
    };
    void recheck(false);
    const unsubscribe = replicatedEntriesTable.subscribe(
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => void recheck(true), SENT_CHECK_DEBOUNCE_MS);
      },
      { emitCurrent: false }
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe();
    };
  }, [classKey, enabled, queryClient, showId]);
  const queueState = enabled && queue?.key === classKey ? queue.state : null;

  const audits = useQuery({
    queryKey: ['results-sent-check', showId, since],
    queryFn: () => getFileScoreChangesSince(showId, since ?? ''),
    enabled: enabled && queueState === false,
    staleTime: 0,
    refetchInterval: SENT_CHECK_REFETCH_MS,
    retry: false,
  });
  const scoreChanges = useMemo<ScoreChangeRead | undefined>(() => {
    if (!enabled) return undefined;
    if (queueState === true || queueState === 'error' || audits.isError) {
      return { status: 'unreadable' };
    }
    if (audits.fetchStatus === 'paused' && !audits.data) return { status: 'unreadable' };
    if (!audits.data) return { status: 'loading' };
    return { status: 'read', latestByClass: audits.data };
  }, [audits.data, audits.fetchStatus, audits.isError, enabled, queueState]);
  return useMemo(() => ({ submissions, scoreChanges }), [submissions, scoreChanges]);
}
