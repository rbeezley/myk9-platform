import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';
import { getClassScoreAudits } from '@/services/database/entries/scoreAudit';

import { findScoreCorrections, type ScoreCorrection } from './judgeReviewCorrections';

const NO_CORRECTIONS: ReadonlyMap<string, readonly ScoreCorrection[]> = new Map();

/**
 * The scores a secretary changed after the judge submitted them, from the score history of the
 * classes that take a judge's sign-off. Shared by the judge review packet and the judge's record,
 * so both mark the same lines. `historySettled` is true once the history is read, has failed, or is
 * paused offline (the packet still prints, without marks: the history is an online-only audit read
 * and the app's query client pauses it with no network), and an empty set of classes has nothing
 * to read. `historyUnavailable` says the marks are missing, so the panel can warn.
 */
export function useJudgeCorrections(rows: readonly ResultsClassRow[]) {
  const classIds = useMemo(
    () => rows.filter(row => row.takesJudgeSignOff).map(row => row.id),
    [rows]
  );
  const audits = useQuery({
    queryKey: ['judge-review-audits', classIds],
    queryFn: () => getClassScoreAudits(classIds),
    enabled: classIds.length > 0,
    staleTime: 0,
    retry: false,
  });
  const correctionsByEntryId = useMemo(() => {
    if (!audits.data) return NO_CORRECTIONS;
    const found = new Map<string, readonly ScoreCorrection[]>();
    for (const [entryId, history] of audits.data) {
      const corrections = findScoreCorrections(history);
      if (corrections.length > 0) found.set(entryId, corrections);
    }
    return found;
  }, [audits.data]);
  const historyPaused = audits.fetchStatus === 'paused' && !audits.data;
  const historySettled =
    audits.isSuccess || audits.isError || historyPaused || classIds.length === 0;
  const historyUnavailable = audits.isError || historyPaused;
  return { audits, correctionsByEntryId, historySettled, historyUnavailable, historyPaused };
}
