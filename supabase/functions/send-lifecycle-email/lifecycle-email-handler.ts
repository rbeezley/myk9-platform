import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import { sendRegistrationNumberNeeded } from './lifecycle-email-numberNeeded.ts';
import {
  deliverViaResend,
  fetchDogOwner,
  fetchJobs,
  findExistingDelivery,
  formatPersonName,
  getErrorMessage,
  insertAttempt,
  insertEmailLog,
  isUniqueViolation,
  type LifecycleEmailJobRow,
  type LifecycleEmailSupabaseClient,
  type QueryResult,
  type SendLifecycleEmailDeps,
  type SendLifecycleEmailPayload,
} from './lifecycle-email-shared.ts';

export type {
  LifecycleEmailSupabaseClient,
  SendLifecycleEmailDeps,
  SendLifecycleEmailPayload,
} from './lifecycle-email-shared.ts';

interface ShowRow {
  id: string;
  club_id: string | null;
}

interface RoleRow {
  club_id: string | null;
  show_id?: string | null;
  roles?: { name?: string | null } | null;
}

interface SaveReadyEntryRow {
  id: string;
  show_id: string | null;
  registration_id: string | null;
  dog_id: string | null;
  handler: string | null;
}

interface SaveReadyRecipient {
  entryId: string | null;
  enrollmentId: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
}

export interface SendLifecycleEmailContext {
  body: SendLifecycleEmailPayload;
  user?: { id: string };
  supabase: LifecycleEmailSupabaseClient;
}

export function createSendLifecycleEmailHandler(deps: SendLifecycleEmailDeps) {
  return async ({ body: payload, user, supabase }: SendLifecycleEmailContext) => {
    if (!user) throw new HttpError(401, 'Unauthorized');
    if (
      payload.action !== 'preview' &&
      payload.action !== 'save_ready' &&
      payload.action !== 'send' &&
      payload.action !== 'send_registration_number_needed'
    ) {
      throw new HttpError(400, 'Unsupported lifecycle email action');
    }
    if (!payload.show_id) throw new HttpError(400, 'show_id is required');

    const show = await fetchShow(supabase, payload.show_id);
    await assertCanSendForShow(supabase, user.id, show);

    if (payload.action === 'save_ready') {
      return saveReadyJob({ payload, supabase, userId: user.id });
    }

    if (payload.action === 'send_registration_number_needed') {
      if (!deps.resendApiKey) throw new HttpError(503, 'Email service not configured');
      return sendRegistrationNumberNeeded({ deps, payload, supabase, userId: user.id });
    }

    if (!payload.job_ids?.length) throw new HttpError(400, 'job_ids are required');
    const jobs = await fetchJobs(supabase, payload.show_id, payload.job_ids);

    if (payload.action === 'preview') {
      return {
        jobs: jobs.map(job => ({
          id: job.id,
          stepType: job.step_type,
          recipientEmail: job.recipient_email,
          recipientName: job.recipient_name,
          subject: payload.subject?.trim() || job.subject || '',
          body: payload.body?.trim() || job.body || '',
          secretaryNote: payload.secretary_note?.trim() || job.secretary_note || '',
        })),
      };
    }

    if (!deps.resendApiKey) throw new HttpError(503, 'Email service not configured');

    const results = [];
    for (const job of jobs) {
      // MYK9-1212: this step is sent only through send_registration_number_needed,
      // whose claim mints the one attempt that may send it and record its outcome.
      if (job.step_type === 'registration_number_needed') {
        results.push({ jobId: job.id, status: 'skipped' as const, reason: 'send_on_demand' });
        continue;
      }
      results.push(await sendOneJob({ deps, job, payload, supabase, userId: user.id }));
    }

    return {
      attempted: results.length,
      sent: results.filter(result => result.status === 'sent').length,
      failed: results.filter(result => result.status === 'failed').length,
      skipped: results.filter(result => result.status === 'skipped').length,
      results,
    };
  };
}

async function saveReadyJob(args: {
  payload: SendLifecycleEmailPayload;
  supabase: LifecycleEmailSupabaseClient;
  userId: string;
}) {
  if (!args.payload.step_type) throw new HttpError(400, 'step_type is required');
  if (!args.payload.recipient_scope) throw new HttpError(400, 'recipient_scope is required');
  if (!args.payload.idempotency_key) throw new HttpError(400, 'idempotency_key is required');

  const { data: step, error: stepError } = (await args.supabase
    .from('show_lifecycle_email_steps')
    .select('id')
    .eq('show_id', args.payload.show_id)
    .eq('step_type', args.payload.step_type)
    .single()) as QueryResult<{ id: string }>;

  if (stepError) throw new HttpError(500, 'Failed to load lifecycle email step');
  if (!step) throw new HttpError(404, 'Lifecycle email step not found');
  const recipient = await resolveSaveReadyRecipient(args);

  const { data: job, error: jobError } = (await args.supabase
    .from('show_lifecycle_email_jobs')
    .insert({
      show_id: args.payload.show_id,
      step_id: step.id,
      step_type: args.payload.step_type,
      status: 'ready',
      recipient_scope: args.payload.recipient_scope,
      entry_id: recipient.entryId,
      enrollment_id: recipient.enrollmentId,
      recipient_email: recipient.recipientEmail,
      recipient_name: recipient.recipientName,
      subject: args.payload.subject ?? null,
      body: args.payload.body ?? null,
      secretary_note: args.payload.secretary_note ?? null,
      correction_for_job_id: args.payload.correction_for_job_id ?? null,
      idempotency_key: args.payload.idempotency_key,
      due_at: args.payload.due_at ?? new Date().toISOString(),
      created_by: args.userId,
      updated_by: args.userId,
    })
    .select('id')
    .single()) as QueryResult<{ id: string }>;

  if (jobError) {
    const message = getErrorMessage(jobError) ?? 'Failed to save lifecycle email';
    if (isUniqueViolation(jobError)) {
      throw new HttpError(409, 'Lifecycle email is already saved for review', '23505');
    }
    throw new HttpError(500, message);
  }
  if (!job?.id) throw new HttpError(500, 'Failed to save lifecycle email');

  return { jobId: job?.id };
}

async function resolveSaveReadyRecipient(args: {
  payload: SendLifecycleEmailPayload;
  supabase: LifecycleEmailSupabaseClient;
}): Promise<SaveReadyRecipient> {
  if (args.payload.recipient_scope !== 'entry' && args.payload.recipient_scope !== 'enrollment') {
    throw new HttpError(400, 'save_ready requires an entry or enrollment recipient');
  }
  if (!args.payload.entry_id) throw new HttpError(400, 'entry_id is required');

  const { data: entry, error: entryError } = (await args.supabase
    .from('entries')
    .select('id, show_id, registration_id, dog_id, handler')
    .eq('id', args.payload.entry_id)
    .single()) as QueryResult<SaveReadyEntryRow>;

  if (entryError) throw new HttpError(500, 'Failed to load lifecycle email entry');
  if (!entry) throw new HttpError(404, 'Lifecycle email entry not found');
  if (entry.show_id !== args.payload.show_id) {
    throw new HttpError(400, 'Lifecycle email entry does not belong to this show');
  }
  if (
    args.payload.recipient_scope === 'enrollment' &&
    (!args.payload.enrollment_id || entry.registration_id !== args.payload.enrollment_id)
  ) {
    throw new HttpError(400, 'Lifecycle email enrollment does not match this entry');
  }

  const owner = entry.dog_id ? await fetchDogOwner(args.supabase, entry.dog_id) : null;
  return {
    entryId: entry.id,
    enrollmentId: args.payload.recipient_scope === 'enrollment' ? entry.registration_id : null,
    recipientEmail: owner?.email ?? null,
    recipientName: formatPersonName(owner) ?? entry.handler ?? null,
  };
}

function callerRoleAuthorizesLifecycleShow(role: RoleRow, show: ShowRow): boolean {
  const roleName = role.roles?.name;
  if (roleName === 'platform_admin' || roleName === 'site_admin') return true;
  if (roleName !== 'secretary' && roleName !== 'trial_secretary' && roleName !== 'club_admin') {
    return false;
  }
  return role.show_id === show.id || (!!show.club_id && role.club_id === show.club_id);
}

async function fetchShow(supabase: LifecycleEmailSupabaseClient, showId: string): Promise<ShowRow> {
  const { data, error } = (await supabase
    .from('shows')
    .select('id, club_id')
    .eq('id', showId)
    .single()) as QueryResult<ShowRow>;
  if (error) throw new HttpError(500, 'Failed to load show');
  if (!data) throw new HttpError(404, 'Show not found');
  return data;
}

async function assertCanSendForShow(
  supabase: LifecycleEmailSupabaseClient,
  userId: string,
  show: ShowRow
) {
  const { data, error } = (await applyActiveRoleValidity(
    supabase
      .from('user_roles')
      .select('id, club_id, show_id, auth_user_id, is_active, expires_at, roles!inner(name)')
      .eq('auth_user_id', userId)
  )) as QueryResult<RoleRow[]>;
  if (error) throw new HttpError(500, 'Failed to verify sender role');

  const canSend = (data ?? []).some(role => callerRoleAuthorizesLifecycleShow(role, show));
  if (!canSend) throw new HttpError(403, 'Forbidden: show official role required');
}

async function sendOneJob(args: {
  deps: SendLifecycleEmailDeps;
  job: LifecycleEmailJobRow;
  payload: SendLifecycleEmailPayload;
  supabase: LifecycleEmailSupabaseClient;
  userId: string;
}): Promise<{ jobId: string; status: 'sent' | 'failed'; emailLogId?: string; error?: string }> {
  // A non-empty payload subject/body/note is an explicit BROADCAST override: it
  // replaces the stored text on every job in this send. Callers that did not
  // edit must omit these fields so each job keeps its own personalised draft
  // (MYK9-315 — the batch review dialog used to forward the first job's text).
  const subject = args.payload.subject?.trim() || args.job.subject || 'Update from myK9Show';
  const body = args.payload.body?.trim() || args.job.body || '';
  const secretaryNote = args.payload.secretary_note?.trim() || args.job.secretary_note || '';

  if (args.job.status === 'failed') {
    const existingDelivery = await findExistingDelivery(args.supabase, args.job.id);
    if (existingDelivery) {
      await args.supabase
        .from('show_lifecycle_email_jobs')
        .update({
          status: 'sent',
          email_log_id: existingDelivery.id,
          sent_at: new Date().toISOString(),
          updated_by: args.userId,
        })
        .eq('id', args.job.id);
      await insertAttempt(
        args,
        existingDelivery.id,
        existingDelivery.resend_message_id ?? null,
        'sent',
        null
      );
      return { jobId: args.job.id, status: 'sent', emailLogId: existingDelivery.id };
    }
  }

  if (!args.job.recipient_email) {
    await recordFailure(args, subject, body, secretaryNote, 'Missing recipient email');
    return { jobId: args.job.id, status: 'failed', error: 'Email delivery failed' };
  }

  const result = await deliverViaResend(args.deps, args.job, { subject, body, secretaryNote });
  if (!result.ok) {
    await recordFailure(args, subject, body, secretaryNote, result.error);
    return { jobId: args.job.id, status: 'failed', error: 'Email delivery failed' };
  }

  const emailLogId = await insertEmailLog(args, result.messageId, 'sent', null);
  await args.supabase
    .from('show_lifecycle_email_jobs')
    .update({
      status: 'sent',
      rendered_subject: subject,
      rendered_body: body,
      rendered_secretary_note: secretaryNote,
      email_log_id: emailLogId,
      sent_at: new Date().toISOString(),
      updated_by: args.userId,
    })
    .eq('id', args.job.id);
  await insertAttempt(args, emailLogId, result.messageId, 'sent', null);
  return { jobId: args.job.id, status: 'sent', emailLogId };
}

async function recordFailure(
  args: {
    supabase: LifecycleEmailSupabaseClient;
    job: LifecycleEmailJobRow;
    userId: string;
  },
  subject: string,
  body: string,
  secretaryNote: string,
  error: string
) {
  const emailLogId = await insertEmailLog(args, null, 'failed', error);
  await args.supabase
    .from('show_lifecycle_email_jobs')
    .update({
      status: 'failed',
      email_log_id: emailLogId,
      rendered_subject: subject,
      rendered_body: body,
      rendered_secretary_note: secretaryNote,
      updated_by: args.userId,
    })
    .eq('id', args.job.id);
  await insertAttempt(args, emailLogId, null, 'failed', error);
}
