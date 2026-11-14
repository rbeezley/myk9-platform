import type { ScoreData, ScoresheetSportType } from '@myk9/scoring-ui';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { formatSecondsAsMSSCC, parseDuration } from '@myk9/core';
import { dbSecondsToInputFormat } from '@/utils/scoringMappings';

/** Saved `result_status` -> the short code the live scoresheets select on. */
const RESULT_STATUS_TO_SHEET_CODE: Record<string, string> = {
  qualified: 'Q',
  nq: 'NQ',
  excused: 'EX',
  disqualified: 'DQ',
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
 * Sheets that reopen a saved score filled in (MYK9-2006): every input a save
 * replaces is hydrated from `existingScore`, so correcting one field leaves the
 * rest as saved. AKC and ASCA read result, area times, faults, reason and the
 * saved find totals; Nationals also seeds its alert totals and finish call errors
 * and recovers its fifth area time; UKC Nosework holds only result, search time,
 * faults and reason. The rest hold extra inputs in local state that start at zero
 * (Rally deductions, FastCAT result, Obedience result), so a time-only correction
 * would overwrite real saved data. They keep opening blank until each is hydrated.
 */
const PREFILL_SHEETS: ReadonlySet<ScoresheetSportType> = new Set([
  'AKC_SCENT_WORK',
  'AKC_SCENT_WORK_NATIONAL',
  'ASCA_SCENT_DETECTION',
  'UKC_NOSEWORK',
]);

export function canPrefillSheet(key: ScoresheetSportType | null | undefined): boolean {
  return !!key && PREFILL_SHEETS.has(key);
}

/** The entry table has four area columns; Nationals scores five (MYK9-2016). */
const STORED_AREA_COLUMNS = 4;

/**
 * Nationals saves five area times but only the first four have a column; the
 * fifth survives only inside the total. Recover it as the part of the saved total
 * the four stored areas do not account for, so reopening and saving again keeps
 * the same total instead of silently dropping the fifth area's time.
 */
export function withNationalsFifthArea(score: ScoreData): ScoreData {
  const total = parseDuration(score.searchTime, 'search');
  if (!total.ok) return score;
  const stored = Array.from({ length: STORED_AREA_COLUMNS }, (_, i) => score.areaTimes[i] ?? '');
  const storedSeconds = stored.reduce((sum, time) => {
    const parsed = time ? parseDuration(time, 'search') : null;
    return parsed?.ok ? sum + parsed.seconds : sum;
  }, 0);
  const remainder = Math.round((total.seconds - storedSeconds) * 100) / 100;
  if (remainder <= 0) return score;
  const fifth = formatSecondsAsMSSCC(remainder);
  return {
    ...score,
    areaTimes: [...stored, fifth],
    areas: { ...score.areas, 'area 5': `${fifth} NOT FOUND INCORRECT` },
  };
}
