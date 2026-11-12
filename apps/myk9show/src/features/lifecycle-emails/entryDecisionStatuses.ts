import type { EntryDecisionEmailJob, EntryDecisionEmailStatus } from './api';
import type { LifecycleEmailJobSummaryRow } from './readModel';
import type { DecisionStepType as DecisionEmailStepType } from './decisionEmail';
import { coveredEntryIds } from './decisionEmail';

export interface EntryDecisionJobRow {
  id: string;
  entry_id: string | null;
  batch_key: string | null;
  step_type: DecisionEmailStepType;
  status: LifecycleEmailJobSummaryRow['status'];
  subject: string | null;
  body: string | null;
  secretary_note: string | null;
  due_at: string | null;
  prepared_at: string | null;
  sent_at: string | null;
  correction_for_job_id: string | null;
}

function mapEntryDecisionJob(
  row: EntryDecisionJobRow,
  entryId: string,
  coveredEntryIds: string[]
): EntryDecisionEmailJob {
  return {
    id: row.id,
    entryId,
    stepType: row.step_type,
    status: row.status,
    subject: row.subject ?? '',
    body: row.body ?? '',
    secretaryNote: row.secretary_note ?? '',
    dueAt: row.due_at,
    preparedAt: row.prepared_at,
    sentAt: row.sent_at,
    correctionForJobId: row.correction_for_job_id,
    coveredEntryIds,
  };
}

function pickLatestJob(
  current: EntryDecisionEmailJob | null,
  next: EntryDecisionEmailJob,
  timestampKey: 'preparedAt' | 'sentAt'
): EntryDecisionEmailJob {
  if (!current) return next;
  const currentTime = current[timestampKey] ? Date.parse(current[timestampKey]) : 0;
  const nextTime = next[timestampKey] ? Date.parse(next[timestampKey]) : 0;
  return nextTime >= currentTime ? next : current;
}

/** Folds job rows into one status per entry; a job covering several entries is read by each. */
export function foldEntryDecisionStatuses(
  rows: EntryDecisionJobRow[]
): Record<string, EntryDecisionEmailStatus> {
  const statuses: Record<string, EntryDecisionEmailStatus> = {};
  for (const row of rows) {
    const covered = coveredEntryIds(row.batch_key, row.entry_id);
    for (const entryId of covered) {
      const job = mapEntryDecisionJob(row, entryId, covered);
      const status = (statuses[entryId] ??= {
        entryId,
        readyJob: null,
        sentDecisionJob: null,
        sentCorrectionJob: null,
      });
      if (job.status === 'ready') {
        status.readyJob = pickLatestJob(status.readyJob, job, 'preparedAt');
      }
      if (job.status === 'sent' && job.correctionForJobId) {
        status.sentCorrectionJob = pickLatestJob(status.sentCorrectionJob, job, 'sentAt');
      }
      if (job.status === 'sent' && !job.correctionForJobId) {
        status.sentDecisionJob = pickLatestJob(status.sentDecisionJob, job, 'sentAt');
      }
    }
  }
  return statuses;
}
