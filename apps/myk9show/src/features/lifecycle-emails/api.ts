import {
  buildLifecycleEmailScheduledSummary,
  type LifecycleEmailReceiptSource,
  type LifecycleEmailScheduledSummary,
  type LifecycleEmailStepSetting,
  type LifecycleEmailJobSummaryRow,
  type LifecycleEmailReceiptLogRow,
} from './readModel';
import type { LifecycleEmailStepType } from './types';

interface QueryResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

interface QueryBuilder<T> extends PromiseLike<QueryResult<T>> {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: readonly unknown[]): QueryBuilder<T>;
  update(values: Record<string, unknown>): QueryBuilder<T>;
}

export interface LifecycleEmailSupabaseClient {
  from<T = unknown>(table: string): QueryBuilder<T>;
}

interface StepRow {
  step_type: LifecycleEmailStepType;
  is_enabled: boolean;
}

interface JobRow {
  step_type: LifecycleEmailStepType;
  status: LifecycleEmailJobSummaryRow['status'];
  preview_warnings: string[] | null;
}

interface ReceiptLogRow {
  related_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface JobReviewRow {
  id: string;
  step_type: LifecycleEmailStepType;
  status: LifecycleEmailJobSummaryRow['status'];
  recipient_email: string | null;
  recipient_name: string | null;
  subject: string | null;
  body: string | null;
  secretary_note: string | null;
  preview_warnings: string[] | null;
}

type DecisionEmailStepType = Extract<LifecycleEmailStepType, 'accepted' | 'waitlisted'>;

interface EntryDecisionJobRow {
  id: string;
  entry_id: string | null;
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

export interface LifecycleEmailJobReview {
  id: string;
  stepType: LifecycleEmailStepType;
  status: LifecycleEmailJobSummaryRow['status'];
  recipientEmail: string | null;
  recipientName: string | null;
  subject: string;
  body: string;
  secretaryNote: string;
  previewWarnings: string[];
}

export interface EntryDecisionEmailJob {
  id: string;
  entryId: string;
  stepType: DecisionEmailStepType;
  status: LifecycleEmailJobSummaryRow['status'];
  subject: string;
  body: string;
  secretaryNote: string;
  dueAt: string | null;
  preparedAt: string | null;
  sentAt: string | null;
  correctionForJobId: string | null;
}

export interface EntryDecisionEmailStatus {
  entryId: string;
  readyJob: EntryDecisionEmailJob | null;
  sentDecisionJob: EntryDecisionEmailJob | null;
  sentCorrectionJob: EntryDecisionEmailJob | null;
}

export interface LifecycleEmailFunctionsClient {
  functions: {
    invoke: (
      name: string,
      options: { body: Record<string, unknown> }
    ) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
  };
}

export function entryDecisionLifecycleEmailQueryKey(showId: string, entryIds: readonly string[]) {
  return ['entry-decision-lifecycle-emails', showId, [...entryIds].sort().join(',')] as const;
}

export async function fetchShowLifecycleEmailSummary(args: {
  supabase: LifecycleEmailSupabaseClient;
  showId: string;
  receiptSources?: readonly LifecycleEmailReceiptSource[];
}): Promise<LifecycleEmailScheduledSummary> {
  const receiptRegistrationIds = [
    ...new Set((args.receiptSources ?? []).map(source => source.registrationId).filter(Boolean)),
  ] as string[];

  const [stepsResult, jobsResult, receiptsResult] = await Promise.all([
    args.supabase
      .from<StepRow[]>('show_lifecycle_email_steps')
      .select('step_type, is_enabled')
      .eq('show_id', args.showId),
    args.supabase
      .from<JobRow[]>('show_lifecycle_email_jobs')
      .select('step_type, status, preview_warnings')
      .eq('show_id', args.showId),
    receiptRegistrationIds.length > 0
      ? args.supabase
          .from<ReceiptLogRow[]>('email_log')
          .select('related_id, status, error_message, created_at')
          .in('related_id', receiptRegistrationIds)
          .eq('email_type', 'registration_confirmation')
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (stepsResult.error) throw new Error(stepsResult.error.message ?? 'Failed to load email steps');
  if (jobsResult.error) throw new Error(jobsResult.error.message ?? 'Failed to load email jobs');
  if (receiptsResult.error) {
    throw new Error(receiptsResult.error.message ?? 'Failed to load receipt history');
  }

  return buildLifecycleEmailScheduledSummary({
    steps: (stepsResult.data ?? []).map(mapStepRow),
    jobs: (jobsResult.data ?? []).map(mapJobRow),
    receiptSources: args.receiptSources ?? null,
    receiptLogs: (receiptsResult.data ?? []).map(mapReceiptLogRow),
  });
}

export async function updateLifecycleEmailStepEnabled(args: {
  supabase: LifecycleEmailSupabaseClient;
  showId: string;
  stepType: LifecycleEmailStepType;
  isEnabled: boolean;
}): Promise<void> {
  const result = await args.supabase
    .from('show_lifecycle_email_steps')
    .update({ is_enabled: args.isEnabled })
    .eq('show_id', args.showId)
    .eq('step_type', args.stepType);

  if (result.error) {
    throw new Error(result.error.message ?? 'Failed to update email step');
  }
}

export async function fetchLifecycleEmailJobsForReview(args: {
  supabase: LifecycleEmailSupabaseClient;
  showId: string;
  stepType: LifecycleEmailStepType;
}): Promise<LifecycleEmailJobReview[]> {
  const result = (await args.supabase
    .from<JobReviewRow[]>('show_lifecycle_email_jobs')
    .select(
      'id, step_type, status, recipient_email, recipient_name, subject, body, secretary_note, preview_warnings'
    )
    .eq('show_id', args.showId)
    .eq('step_type', args.stepType)
    .in('status', ['ready', 'failed'])) as QueryResult<JobReviewRow[]>;

  if (result.error) {
    throw new Error(result.error.message ?? 'Failed to load lifecycle email recipients');
  }

  return (result.data ?? []).map(row => ({
    id: row.id,
    stepType: row.step_type,
    status: row.status,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name,
    subject: row.subject ?? '',
    body: row.body ?? '',
    secretaryNote: row.secretary_note ?? '',
    previewWarnings: row.preview_warnings ?? [],
  }));
}

export async function fetchEntryDecisionEmailStatuses(args: {
  supabase: LifecycleEmailSupabaseClient;
  showId: string;
  entryIds: readonly string[];
}): Promise<Record<string, EntryDecisionEmailStatus>> {
  if (args.entryIds.length === 0) return {};

  const result = (await args.supabase
    .from<EntryDecisionJobRow[]>('show_lifecycle_email_jobs')
    .select(
      'id, entry_id, step_type, status, subject, body, secretary_note, due_at, prepared_at, sent_at, correction_for_job_id'
    )
    .eq('show_id', args.showId)
    .in('entry_id', args.entryIds)
    .in('step_type', ['accepted', 'waitlisted'])) as QueryResult<EntryDecisionJobRow[]>;

  if (result.error) {
    throw new Error(result.error.message ?? 'Failed to load entry decision email status');
  }

  const statuses: Record<string, EntryDecisionEmailStatus> = {};
  for (const row of result.data ?? []) {
    if (!row.entry_id) continue;
    const job = mapEntryDecisionJob(row, row.entry_id);
    const status = (statuses[row.entry_id] ??= {
      entryId: row.entry_id,
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

  return statuses;
}

export async function sendLifecycleEmailJobs(args: {
  supabase: LifecycleEmailFunctionsClient;
  showId: string;
  jobIds: string[];
  subject: string;
  body: string;
  secretaryNote: string;
}): Promise<void> {
  const { error } = await args.supabase.functions.invoke('send-lifecycle-email', {
    body: {
      action: 'send',
      show_id: args.showId,
      job_ids: args.jobIds,
      subject: args.subject,
      body: args.body,
      secretary_note: args.secretaryNote,
    },
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to send lifecycle email');
  }
}

export async function saveLifecycleEmailJobForLater(args: {
  supabase: LifecycleEmailFunctionsClient;
  showId: string;
  stepType: LifecycleEmailStepType;
  recipientScope: 'entry' | 'enrollment' | 'show_recipient';
  entryId?: string | null;
  enrollmentId?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  subject: string;
  body: string;
  secretaryNote: string;
  idempotencyKey: string;
  dueAt?: string;
  correctionForJobId?: string | null;
}): Promise<string | null> {
  const { data, error } = await args.supabase.functions.invoke('send-lifecycle-email', {
    body: {
      action: 'save_ready',
      show_id: args.showId,
      step_type: args.stepType,
      recipient_scope: args.recipientScope,
      entry_id: args.entryId ?? null,
      enrollment_id: args.enrollmentId ?? null,
      recipient_email: args.recipientEmail ?? null,
      recipient_name: args.recipientName ?? null,
      subject: args.subject,
      body: args.body,
      secretary_note: args.secretaryNote,
      idempotency_key: args.idempotencyKey,
      correction_for_job_id: args.correctionForJobId ?? null,
      due_at: args.dueAt ?? new Date().toISOString(),
    },
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to save lifecycle email');
  }

  if (data && typeof data === 'object' && 'jobId' in data) {
    const jobId = (data as { jobId?: unknown }).jobId;
    return typeof jobId === 'string' ? jobId : null;
  }

  return null;
}

function mapStepRow(row: StepRow): LifecycleEmailStepSetting {
  return {
    stepType: row.step_type,
    isEnabled: row.is_enabled,
  };
}

function mapJobRow(row: JobRow): LifecycleEmailJobSummaryRow {
  return {
    stepType: row.step_type,
    status: row.status,
    previewWarnings: row.preview_warnings ?? [],
  };
}

function mapReceiptLogRow(row: ReceiptLogRow): LifecycleEmailReceiptLogRow {
  return {
    relatedId: row.related_id,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function mapEntryDecisionJob(row: EntryDecisionJobRow, entryId: string): EntryDecisionEmailJob {
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
