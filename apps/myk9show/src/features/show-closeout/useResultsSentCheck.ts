import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { classHasUnsyncedScores } from '@/features/results-tab/useClassUnsyncedScores';
import { useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import { getFileScoreChangesSince } from '@/services/database/entries/scoreAudit';
import { replicatedEntriesTable } from '@/services/replication';
import type { ScoreChangeRead, WhatIsLeftInput } from './whatIsLeft';

export interface SentCheckClass {
  id: string;
  /** Dogs scored, `null` when not read. Part of the key, so a new score re-reads the history. */
  scoredCount?: number | null | undefined;
}

/** Whether any of these classes holds a score change the server has not seen; `null` until read. */
function useAnyUnsyncedScores(classIds: readonly string[], enabled: boolean): boolean | null {
  const [state, setState] = useState<{ key: string; unsynced: boolean } | null>(null);
  const [notices, setNotices] = useState(0);
  const key = classIds.join(',');
  useEffect(
    () =>
      enabled
        ? replicatedEntriesTable.subscribe(() => setNotices(count => count + 1), {
            emitCurrent: false,
          })
        : undefined,
    [enabled]
  );
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const flags = await Promise.all(classIds.map(id => classHasUnsyncedScores(id)));
        if (!cancelled) setState({ key, unsynced: flags.some(Boolean) });
      } catch {
        if (!cancelled) setState(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `classIds` is carried by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, notices]);
  return enabled && state?.key === key ? state.unsynced : null;
}

/**
 * What the Finish the show list and the close step need to say whether the results file still
 * matches the scores (MYK9-2078): the send records, and the newest change to a score the file
 * carries, from the score history. One hook and one query key, so both screens share one read.
 *
 * The history is the online-only admin audit read, taken only once a file the app sent exists, and
 * only for changes after the oldest such send. It re-reads when a class's scored count changes or
 * a score change finishes syncing. `unreadable` covers a failed or offline read AND a score
 * change still waiting in this device's queue: the history cannot describe it, so the screens say
 * they cannot tell instead of ticking a file that may be out of date.
 */
export function useResultsSentCheck(
  showId: string,
  classes: readonly SentCheckClass[]
): Pick<WhatIsLeftInput, 'submissions' | 'scoreChanges'> {
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
  const classIds = useMemo(() => classes.map(cls => cls.id), [classes]);
  const signature = useMemo(
    () => classes.map(cls => `${cls.id}:${cls.scoredCount ?? '?'}`).join(','),
    [classes]
  );
  const unsynced = useAnyUnsyncedScores(classIds, since !== null);
  const audits = useQuery({
    queryKey: ['results-sent-check', showId, since, signature, unsynced],
    queryFn: () => getFileScoreChangesSince(showId, since ?? ''),
    enabled: since !== null && unsynced === false,
    staleTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const scoreChanges = useMemo<ScoreChangeRead | undefined>(() => {
    if (since === null) return undefined;
    if (unsynced === true || audits.isError) return { status: 'unreadable' };
    if (audits.fetchStatus === 'paused' && !audits.data) return { status: 'unreadable' };
    if (!audits.data) return { status: 'loading' };
    return { status: 'read', latestByClass: audits.data };
  }, [audits.data, audits.fetchStatus, audits.isError, since, unsynced]);
  return useMemo(() => ({ submissions, scoreChanges }), [submissions, scoreChanges]);
}
