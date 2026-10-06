import type { ScoreData } from '@myk9/scoring-ui';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { dbSecondsToInputFormat } from '@/utils/scoringMappings';

/** Saved `result_status` -> the short code the live scoresheets select on. */
const RESULT_STATUS_TO_SHEET_CODE: Record<string, string> = {
  qualified: 'Q',
  nq: 'NQ',
  excused: 'EX',
  absent: 'ABS',
};

/**
 * Rebuild the scoresheet's `existingScore` from the saved replicated entry row,
 * so reopening a scored dog ("Correct this score") shows what was saved instead
 * of a blank form (MYK9-1025). Inverse of the write in `useOptimisticScoring`.
 *
 * Returns undefined for an unscored entry (blank form) and for a result the
 * sheet has no code for (withdrawn), so those still open blank.
 */
export function toExistingScore(entry: ReplicatedEntry): ScoreData | undefined {
  const resultStatus = entry.result_status || entry.resultStatus || '';
  const resultText = RESULT_STATUS_TO_SHEET_CODE[resultStatus];
  if (!resultText) return undefined;

  const totalSeconds = entry.search_time_seconds ?? entry.searchTimeSeconds ?? 0;
  const areaSeconds = [
    entry.area1_time_seconds,
    entry.area2_time_seconds,
    entry.area3_time_seconds,
    entry.area4_time_seconds,
  ];
  // A row scored before the per-area columns existed only has the total; show
  // it in Area 1 rather than hiding the saved time.
  if (areaSeconds.every(s => !s) && totalSeconds) areaSeconds[0] = totalSeconds;

  const areaTimes = areaSeconds.map(s => dbSecondsToInputFormat(s));
  while (areaTimes.length > 1 && !areaTimes[areaTimes.length - 1]) areaTimes.pop();

  // Per-area found/correct flags are not stored, only totals. A qualified area
  // with a time was found and called correctly; honor the saved correct-find
  // total when it is lower (multi-area classes with a missed hide).
  const timedAreas = areaTimes.filter(Boolean).length;
  const correctCount = entry.total_correct_finds ?? (resultText === 'Q' ? timedAreas : 0);
  const areas: Record<string, string> = {};
  let correctRemaining = correctCount;
  areaTimes.forEach((time, i) => {
    const credited = resultText === 'Q' && !!time && correctRemaining > 0;
    if (credited) correctRemaining -= 1;
    areas[`area ${i + 1}`] =
      `${time}${credited ? ' FOUND' : ' NOT FOUND'}${credited ? ' CORRECT' : ' INCORRECT'}`;
  });

  return {
    resultText,
    searchTime: dbSecondsToInputFormat(totalSeconds) || '0.00',
    areas,
    areaTimes,
    correctCount,
    incorrectCount: entry.total_incorrect_finds ?? 0,
    faultCount: entry.total_faults ?? entry.totalFaults ?? 0,
    finishCallErrors: entry.no_finish_count ?? 0,
    points: entry.points_earned ?? 0,
    ...(entry.disqualification_reason
      ? { nonQualifyingReason: entry.disqualification_reason }
      : {}),
  };
}
