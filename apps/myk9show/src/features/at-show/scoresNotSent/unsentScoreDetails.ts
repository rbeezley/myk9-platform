/**
 * One row of the Scores not sent list (MYK9-2011): the dog, the class, the score itself and
 * why, read from this device only. The score is read from the queued write, not the replica, so
 * the row shows exactly what was saved even if the replica moved on; that is what lets the
 * secretary key it at the desk from the judge's phone.
 */
import type { PendingMutation } from '@myk9/replication';
import { formatSecondsAsMSSCC } from '@/lib/format/searchTime';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import type { UnsentScore } from '@/services/replication/unsentWork';
import { unsentScoreReason } from './unsentScoreReason';

const RESULT_LABELS: Record<string, string> = {
  qualified: 'Qualified',
  nq: 'Not qualified',
  excused: 'Excused',
  absent: 'Absent',
  disqualified: 'Disqualified',
  withdrawn: 'Withdrawn',
};

export interface UnsentScoreRow {
  entryId: string;
  /** "100 Willow". */
  dogLabel: string;
  className: string | null;
  /** The score as the judge reads it: "Qualified · 0:04.35 · 0 faults". */
  scoreText: string;
  /** The reason she chose (an NQ or excusal reason), when there is one. */
  scoreReason: string | null;
  /** Why it has not reached the server, in plain words. */
  why: string;
  refused: boolean;
  /** Refused queue rows for this dog; Try again and Remove act on all of them. */
  failedMutationIds: string[];
}

function fieldsOf(mutation: PendingMutation): Record<string, unknown> {
  return mutation.rpc?.fields ?? {};
}

export function describeScoreFields(fields: Record<string, unknown>): {
  scoreText: string;
  scoreReason: string | null;
} {
  const parts: string[] = [];
  const result = typeof fields.result_status === 'string' ? fields.result_status : '';
  parts.push(RESULT_LABELS[result] ?? (result ? result : 'Scored'));
  const seconds = fields.search_time_seconds;
  if (typeof seconds === 'number' && seconds > 0) parts.push(formatSecondsAsMSSCC(seconds));
  const faults = fields.total_faults;
  if (typeof faults === 'number') parts.push(`${faults} ${faults === 1 ? 'fault' : 'faults'}`);
  const reason = fields.disqualification_reason;
  return {
    scoreText: parts.join(' · '),
    scoreReason: typeof reason === 'string' && reason.trim() ? reason.trim() : null,
  };
}

export function dogLabelOf(entry: ReplicatedEntry | undefined): string {
  if (!entry) return 'A dog not saved on this device';
  const armband = entry.armband ?? entry.armbandNumber ?? entry.armband_number;
  const name = entry.dogCallName ?? entry.dog_call_name;
  return [armband, name].filter(Boolean).join(' ') || 'This dog';
}

export function toUnsentScoreRow(
  score: UnsentScore,
  entry: ReplicatedEntry | undefined,
  className: string | null
): UnsentScoreRow {
  return {
    entryId: score.entryId,
    dogLabel: dogLabelOf(entry),
    className,
    ...describeScoreFields(fieldsOf(score.mutation)),
    why: unsentScoreReason(score.mutation),
    refused: score.refused,
    failedMutationIds: score.failedMutationIds,
  };
}
