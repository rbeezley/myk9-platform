/**
 * One row of the Scores not sent list (MYK9-2011): the dog, the class, the score itself and
 * why, read from this device only. The score is read from the queued write, not the replica, so
 * the row shows exactly what was saved; that is what lets the secretary key it at the desk from
 * the judge's phone.
 *
 * Every saved score field the write carries is shown, in the read-back's own words (the result
 * words from `resultLabel`, the area and total time rows from `timeRows`), so the list and the
 * judge's read-back can never disagree. `SCORE_FIELD_ROWS` is the one table for the rest.
 */
import { resultLabel, timeRows } from '@myk9/scoring-ui';
import { formatSecondsAsMSSCC } from '@/lib/format/searchTime';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import type { ScoreUnitState, UnsentScore } from '@/services/replication/unsentWork';
import { unsentScoreReason } from './unsentScoreReason';

/** The read-back's result codes, from the `result_status` the write stores. */
const RESULT_CODES: Record<string, string> = {
  qualified: 'Q',
  nq: 'NQ',
  excused: 'EX',
  absent: 'ABS',
  disqualified: 'DQ',
  withdrawn: 'Withdrawn',
};

/** Count fields, in the order the judge writes them down. Shown whenever the write carries them. */
const SCORE_FIELD_ROWS: ReadonlyArray<{ field: string; label: string }> = [
  { field: 'total_correct_finds', label: 'Correct finds' },
  { field: 'total_incorrect_finds', label: 'Incorrect finds' },
  { field: 'total_faults', label: 'Faults' },
  { field: 'no_finish_count', label: 'Finish-call errors' },
  { field: 'points_earned', label: 'Points' },
];

const AREA_TIME_FIELDS = [
  'area1_time_seconds',
  'area2_time_seconds',
  'area3_time_seconds',
  'area4_time_seconds',
] as const;

export interface ScoreDetailRow {
  label: string;
  value: string;
}

export interface UnsentScoreRow {
  entryId: string;
  /** "100 Willow". */
  dogLabel: string;
  className: string | null;
  /** Every saved score field: result, times (each area and the total), finds, faults, points. */
  scoreRows: ScoreDetailRow[];
  /** The rows as one line, for the removal question: "Result Qualified · Time 0:04.35 · …". */
  scoreText: string;
  /** The reason she chose (an NQ or excusal reason), when there is one. */
  scoreReason: string | null;
  /** Why it has not reached myK9Show, in plain words. */
  why: string;
  state: ScoreUnitState;
  /** Try again resends exactly these; Remove deletes exactly those. */
  retryIds: string[];
  removeIds: string[];
  hasOtherRefusedChange: boolean;
}

function seconds(value: unknown): string | null {
  return typeof value === 'number' && value > 0 ? formatSecondsAsMSSCC(value) : null;
}

export function describeScoreFields(fields: Record<string, unknown>): {
  scoreRows: ScoreDetailRow[];
  scoreReason: string | null;
} {
  const result = typeof fields.result_status === 'string' ? fields.result_status : '';
  const rows: ScoreDetailRow[] = [
    { label: 'Result', value: resultLabel(RESULT_CODES[result] ?? result) || 'Scored' },
  ];
  // Area names are not stored with the score, so areas read "Area 1", "Area 2" as on the
  // class requirements line.
  const areas = AREA_TIME_FIELDS.flatMap((field, i) => {
    const time = seconds(fields[field]);
    return time ? [{ areaName: `Area ${i + 1}`, time }] : [];
  });
  const total = seconds(fields.search_time_seconds);
  if (total || areas.length > 0) {
    for (const row of timeRows(areas, total ?? '--')) {
      rows.push({ label: row.label, value: String(row.value) });
    }
  }
  for (const { field, label } of SCORE_FIELD_ROWS) {
    const value = fields[field];
    if (typeof value === 'number') rows.push({ label, value: String(value) });
  }
  const reason = fields.disqualification_reason;
  return {
    scoreRows: rows,
    scoreReason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
  };
}

export function scoreLine(rows: readonly ScoreDetailRow[]): string {
  return rows.map(row => `${row.label} ${row.value}`).join(' · ');
}

export function dogLabelOf(entry: ReplicatedEntry | undefined): string {
  if (!entry) return 'A dog not saved on this device';
  const armband = entry.armband ?? entry.armbandNumber ?? entry.armband_number;
  const name = entry.dogCallName ?? entry.dog_call_name;
  return [armband, name].filter(Boolean).join(' ') || 'This dog';
}

export function toUnsentScoreRow(score: UnsentScore, className: string | null): UnsentScoreRow {
  const { scoreRows, scoreReason } = describeScoreFields(score.mutation.rpc?.fields ?? {});
  return {
    entryId: score.entryId,
    dogLabel: dogLabelOf(score.entry),
    className,
    scoreRows,
    scoreText: scoreLine(scoreRows),
    scoreReason,
    why: unsentScoreReason(score),
    state: score.state,
    retryIds: score.retryIds,
    removeIds: score.removeIds,
    hasOtherRefusedChange: score.hasOtherRefusedChange,
  };
}

/** The removal question's body: names the dog, the class and the score, since removing deletes it. */
export function removeScoreDescription(row: UnsentScoreRow): string {
  const score = row.scoreReason ? `${row.scoreText} · Reason ${row.scoreReason}` : row.scoreText;
  const where = row.className ? ` in ${row.className}` : '';
  const other = row.hasOtherRefusedChange
    ? ' The check-in or ring change for this dog that was not sent is kept.'
    : '';
  return `${row.dogLabel}${where}: ${score}. This score has not reached myK9Show. Removing it deletes it from this phone for good, so write it down or show it to the secretary first.${other}`;
}
