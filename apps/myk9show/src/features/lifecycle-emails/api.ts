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

export interface LifecycleEmailFunctionsClient {
  functions: {
    invoke: (
      name: string,
      options: { body: Record<string, unknown> }
    ) => Promise<{ data?: unknown; error?: { message?: string } | null }>;
  };
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
    .eq('status', 'ready')) as QueryResult<JobReviewRow[]>;

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
}): Promise<void> {
  const { error } = await args.supabase.functions.invoke('send-lifecycle-email', {
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
      due_at: args.dueAt ?? new Date().toISOString(),
    },
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to save lifecycle email');
  }
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
