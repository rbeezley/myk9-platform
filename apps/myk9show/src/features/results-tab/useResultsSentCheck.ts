import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import { getClassScoreAudits } from '@/services/database/entries/scoreAudit';
import type { WhatIsLeftInput } from '@/features/show-closeout/whatIsLeft';
import type { ResultsClassRow } from './buildResultsClassRows';

/**
 * What the Finish the show list needs to say whether the results file still matches the scores
 * (MYK9-2078): the send records, and the newest score change per class from the score history.
 * The history is the same online-only read the judge review packet uses (`getClassScoreAudits`),
 * and is read only once a file the app sent exists. `latestScoreChangeByClass` is `null` when the
 * history could not be read (failed, or paused offline), so the list says it cannot tell rather
 * than ticking a file that may be out of date; `undefined` while it loads or when nothing was sent.
 */
export function useResultsSentCheck(
  showId: string,
  rows: readonly ResultsClassRow[]
): Pick<WhatIsLeftInput, 'submissions' | 'latestScoreChangeByClass'> {
  const submissionsQuery = useResultSubmissions(showId);
  const submissions = submissionsQuery.data ?? null;
  const hasSent = submissions?.some(row => row.status === 'sent') ?? false;
  const classIds = useMemo(() => rows.map(row => row.id), [rows]);
  const audits = useQuery({
    queryKey: ['results-sent-audits', showId, classIds],
    queryFn: () => getClassScoreAudits(classIds),
    enabled: hasSent && classIds.length > 0,
    staleTime: 0,
    retry: false,
  });
  const latestScoreChangeByClass = useMemo(() => {
    if (!hasSent) return undefined;
    if (audits.isError || (audits.fetchStatus === 'paused' && !audits.data)) return null;
    if (!audits.data) return undefined;
    const latest = new Map<string, string>();
    for (const history of audits.data.values()) {
      for (const item of history) {
        const seen = latest.get(item.classId);
        if (!seen || Date.parse(item.changedAt) > Date.parse(seen)) {
          latest.set(item.classId, item.changedAt);
        }
      }
    }
    return latest;
  }, [audits.data, audits.fetchStatus, audits.isError, hasSent]);
  return { submissions, latestScoreChangeByClass };
}
