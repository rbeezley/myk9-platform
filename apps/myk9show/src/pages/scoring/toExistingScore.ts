import type { ScoreData, ScoresheetSportType } from '@myk9/scoring-ui';
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

  // Per-area found/correct flags are not stored, only totals. Seed them unset
  // (what the sheet itself produces) and let the scoresheet hook keep the saved
  // totals until the judge edits a flag. Only the keys matter for the time seed.
  const areas: Record<string, string> = {};
  areaTimes.forEach((time, i) => {
    areas[`area ${i + 1}`] = `${time} NOT FOUND INCORRECT`;
  });

  return {
    resultText,
    searchTime: dbSecondsToInputFormat(totalSeconds) || '0.00',
    areas,
    areaTimes,
    correctCount: entry.total_correct_finds ?? 0,
    incorrectCount: entry.total_incorrect_finds ?? 0,
    faultCount: entry.total_faults ?? entry.totalFaults ?? 0,
    finishCallErrors: entry.no_finish_count ?? 0,
    points: entry.points_earned ?? 0,
    ...(entry.disqualification_reason
      ? { nonQualifyingReason: entry.disqualification_reason }
      : {}),
  };
}

/**
 * Sheets whose every authoritative input is hydrated from `existingScore` (result,
 * area times, faults, reason, and the saved find totals/points through
 * `useScoresheetScoring`). The rest hold extra inputs in local state that start at
 * zero (Rally deductions, Nationals alert counts, FastCAT result, Obedience
 * result, Nosework element time), so a time-only correction would overwrite real
 * saved data. They keep opening blank until each is hydrated.
 */
const PREFILL_SHEETS: ReadonlySet<ScoresheetSportType> = new Set([
  'AKC_SCENT_WORK',
  'ASCA_SCENT_DETECTION',
]);

export function canPrefillSheet(key: ScoresheetSportType | null | undefined): boolean {
  return !!key && PREFILL_SHEETS.has(key);
}
