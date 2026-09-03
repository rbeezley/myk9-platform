import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { requireEmailLogWrite } from '../_shared/emailLog.ts';

export interface SendLifecycleEmailPayload {
  action?: 'preview' | 'save_ready' | 'send';
  show_id?: string;
  job_ids?: string[];
  step_type?: string;
  recipient_scope?: string;
  entry_id?: string | null;
  enrollment_id?: string | null;
  recipient_email?: string | null;
  recipient_name?: string | null;
  idempotency_key?: string;
  correction_for_job_id?: string | null;
  due_at?: string;
  subject?: string;
  body?: string;
  secretary_note?: string;
}

interface QueryResult<T = unknown> {
  data: T | null;
  error: unknown;
}

interface Query<T = unknown> extends PromiseLike<QueryResult<T>> {
  select(columns: string): Query<T>;
  eq(column: string, value: unknown): Query<T>;
  in(column: string, values: readonly unknown[]): Query<T>;
  order(column: string, options?: { ascending?: boolean }): Query<T>;
  insert(values: unknown): Query<T>;
  update(values: unknown): Query<T>;
  single(): Promise<QueryResult<T>>;
}

export interface LifecycleEmailSupabaseClient {
  from(table: string): Query;
}

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

interface DogOwnerRow {
  owner_id: string | null;
}

interface PersonRecipientRow {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface SaveReadyRecipient {
  entryId: string | null;
  enrollmentId: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
}

interface LifecycleEmailJobRow {
  id: string;
  show_id: string;
  step_type: string;
  status: string;
  recipient_email: string | null;
  recipient_name: string | null;
  subject: string | null;
  body: string | null;
  secretary_note: string | null;
  rendered_subject: string | null;
  rendered_body: string | null;
  rendered_secretary_note: string | null;
  email_log_id: string | null;
  idempotency_key: string;
}

interface EmailLogRow {
  id: string;
  resend_message_id?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface SendLifecycleEmailContext {
  body: SendLifecycleEmailPayload;
  user?: { id: string };
  supabase: LifecycleEmailSupabaseClient;
}

export interface SendLifecycleEmailDeps {
  fetch: typeof fetch;
  resendApiKey?: string | null;
  fromEmail?: string;
}

export function createSendLifecycleEmailHandler(deps: SendLifecycleEmailDeps) {
  return async ({ body: payload, user, supabase }: SendLifecycleEmailContext) => {
    if (!user) throw new HttpError(401, 'Unauthorized');
    if (
      payload.action !== 'preview' &&
      payload.action !== 'save_ready' &&
      payload.action !== 'send'
    ) {
      throw new HttpError(400, 'Unsupported lifecycle email action');
    }
    if (!payload.show_id) throw new HttpError(400, 'show_id is required');

    const show = await fetchShow(supabase, payload.show_id);
    await assertCanSendForShow(supabase, user.id, show);

    if (payload.action === 'save_ready') {
      return saveReadyJob({ payload, supabase, userId: user.id });
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
      results.push(await sendOneJob({ deps, job, payload, supabase, userId: user.id }));
    }

    return {
      attempted: results.length,
      sent: results.filter(result => result.status === 'sent').length,
      failed: results.filter(result => result.status === 'failed').length,
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

async function fetchDogOwner(
  supabase: LifecycleEmailSupabaseClient,
  dogId: string
): Promise<PersonRecipientRow | null> {
  const { data: dog, error: dogError } = (await supabase
    .from('dogs')
    .select('owner_id')
    .eq('id', dogId)
    .single()) as QueryResult<DogOwnerRow>;

  if (dogError) throw new HttpError(500, 'Failed to load lifecycle email dog');
  if (!dog?.owner_id) return null;

  const { data: owner, error: ownerError } = (await supabase
    .from('people')
    .select('first_name, last_name, email')
    .eq('id', dog.owner_id)
    .single()) as QueryResult<PersonRecipientRow>;

  if (ownerError) throw new HttpError(500, 'Failed to load lifecycle email recipient');
  return owner ?? null;
}

function formatPersonName(person: PersonRecipientRow | null): string | null {
  const name = [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

function getErrorMessage(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
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

async function fetchJobs(
  supabase: LifecycleEmailSupabaseClient,
  showId: string,
  jobIds: string[]
): Promise<LifecycleEmailJobRow[]> {
  const { data, error } = (await supabase
    .from('show_lifecycle_email_jobs')
    .select(
      'id, show_id, step_type, status, recipient_email, recipient_name, subject, body, secretary_note, rendered_subject, rendered_body, rendered_secretary_note, email_log_id, idempotency_key'
    )
    .eq('show_id', showId)
    .in('id', jobIds)) as QueryResult<LifecycleEmailJobRow[]>;
  if (error) throw new HttpError(500, 'Failed to load lifecycle email jobs');
  return (data ?? []).filter(job => job.status === 'ready' || job.status === 'failed');
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

  let response: Response;
  try {
    response = await sendResendEmailWithRetry(
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${args.deps.resendApiKey}`,
          'Idempotency-Key': args.job.idempotency_key,
        },
        body: JSON.stringify({
          from: args.deps.fromEmail ?? 'myK9Show <notifications@myk9show.com>',
          to: args.job.recipient_email,
          subject,
          html: renderHtmlEmail(subject, body, secretaryNote),
        }),
      },
      { fetchImpl: args.deps.fetch }
    );
  } catch {
    await recordFailure(args, subject, body, secretaryNote, 'email_delivery_error');
    return { jobId: args.job.id, status: 'failed', error: 'Email delivery failed' };
  }

  if (!response.ok) {
    await response.text();
    const error = `provider_http_${response.status}`;
    await recordFailure(args, subject, body, secretaryNote, error);
    return { jobId: args.job.id, status: 'failed', error: 'Email delivery failed' };
  }

  const resend = (await response.json()) as { id?: string };
  const emailLogId = await insertEmailLog(args, resend.id ?? null, 'sent', null);
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
  await insertAttempt(args, emailLogId, resend.id ?? null, 'sent', null);
  return { jobId: args.job.id, status: 'sent', emailLogId };
}

async function findExistingDelivery(
  supabase: LifecycleEmailSupabaseClient,
  jobId: string
): Promise<EmailLogRow | null> {
  const { data } = (await supabase
    .from('email_log')
    .select('id, resend_message_id, status, created_at')
    .eq('related_id', jobId)
    .in('status', ['sent', 'delivered'])
    .order('created_at', { ascending: false })) as QueryResult<EmailLogRow[]>;
  return data?.[0] ?? null;
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

async function insertEmailLog(
  args: { supabase: LifecycleEmailSupabaseClient; job: LifecycleEmailJobRow },
  resendMessageId: string | null,
  status: string,
  errorMessage: string | null
): Promise<string | undefined> {
  const { data, error } = (await args.supabase
    .from('email_log')
    .insert({
      recipient_email: args.job.recipient_email,
      email_type: 'show_lifecycle_email',
      related_id: args.job.id,
      resend_message_id: resendMessageId,
      status,
      error_message: errorMessage,
      show_id: args.job.show_id,
    })
    .select('id')
    .single()) as QueryResult<EmailLogRow>;
  requireEmailLogWrite(error, 'send-lifecycle-email');
  return data?.id;
}

async function insertAttempt(
  args: { supabase: LifecycleEmailSupabaseClient; job: LifecycleEmailJobRow; userId: string },
  emailLogId: string | null | undefined,
  resendMessageId: string | null,
  status: string,
  errorMessage: string | null
) {
  await args.supabase.from('show_lifecycle_email_attempts').insert({
    job_id: args.job.id,
    email_log_id: emailLogId,
    resend_message_id: resendMessageId,
    status,
    error_message: errorMessage,
    attempted_by: args.userId,
  });
}

function renderHtmlEmail(subject: string, body: string, secretaryNote: string): string {
  const note = secretaryNote
    ? `<div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:6px;padding:16px;margin-top:16px;"><p style="margin:0 0 4px;font-weight:600;color:#1e40af;">From the show secretary</p>${paragraphs(secretaryNote)}</div>`
    : '';
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;background:#f3f4f6;margin:0;padding:20px;"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;"><div style="background:#1f2937;padding:20px 24px;"><p style="margin:0;color:#fff;font-size:20px;font-weight:700;">myK9Show</p></div><div style="padding:28px 24px;"><h1 style="margin:0 0 16px;font-size:22px;">${escapeHtml(subject)}</h1>${paragraphs(body)}${note}</div></div></body></html>`;
}

function paragraphs(value: string): string {
  return value
    .split(/\n{2,}/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(
      line =>
        `<p style="margin:0 0 12px;line-height:1.6;">${escapeHtml(line).replace(/\n/g, '<br>')}</p>`
    )
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
