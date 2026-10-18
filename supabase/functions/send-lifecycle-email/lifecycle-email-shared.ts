import { HttpError } from '../_shared/http/responses.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { requireEmailLogWrite } from '../_shared/emailLog.ts';

/** Types and database/provider helpers shared by the generic send and the number-needed step. */
export interface SendLifecycleEmailPayload {
  action?: 'preview' | 'save_ready' | 'send' | 'send_registration_number_needed';
  show_id?: string;
  job_ids?: string[];
  step_type?: string;
  recipient_scope?: string;
  entry_id?: string | null;
  enrollment_id?: string | null;
  recipient_email?: string | null;
  recipient_name?: string | null;
  idempotency_key?: string;
  /** send_registration_number_needed: one id per preview, stable across its retries. */
  request_id?: string;
  correction_for_job_id?: string | null;
  due_at?: string;
  subject?: string;
  body?: string;
  secretary_note?: string;
}

export interface QueryResult<T = unknown> {
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
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<QueryResult<unknown>>;
}

export interface SendLifecycleEmailDeps {
  fetch: typeof fetch;
  resendApiKey?: string | null;
  fromEmail?: string;
}

export interface LifecycleEmailJobRow {
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
  entry_id: string | null;
}

export interface EmailLogRow {
  id: string;
  resend_message_id?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export interface PersonRecipientRow {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface DogOwnerRow {
  owner_id: string | null;
}

export function getErrorMessage(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

export async function fetchDogOwner(
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

export function formatPersonName(person: PersonRecipientRow | null): string | null {
  const name = [person?.first_name, person?.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

export async function fetchJobs(
  supabase: LifecycleEmailSupabaseClient,
  showId: string,
  jobIds: string[]
): Promise<LifecycleEmailJobRow[]> {
  const { data, error } = (await supabase
    .from('show_lifecycle_email_jobs')
    .select(
      'id, show_id, step_type, status, recipient_email, recipient_name, subject, body, secretary_note, rendered_subject, rendered_body, rendered_secretary_note, email_log_id, idempotency_key, entry_id'
    )
    .eq('show_id', showId)
    .in('id', jobIds)) as QueryResult<LifecycleEmailJobRow[]>;
  if (error) throw new HttpError(500, 'Failed to load lifecycle email jobs');
  return (data ?? []).filter(job => job.status === 'ready' || job.status === 'failed');
}

export async function findExistingDelivery(
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

export interface EmailText {
  subject: string;
  body: string;
  secretaryNote: string;
}

export type ProviderResult = { ok: true; messageId: string | null } | { ok: false; error: string };

/** One provider call under the job's Idempotency-Key. Never throws for a delivery failure. */
export async function deliverViaResend(
  deps: SendLifecycleEmailDeps,
  job: LifecycleEmailJobRow,
  text: EmailText
): Promise<ProviderResult> {
  let response: Response;
  try {
    response = await sendResendEmailWithRetry(
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deps.resendApiKey}`,
          'Idempotency-Key': job.idempotency_key,
        },
        body: JSON.stringify({
          from: deps.fromEmail ?? 'myK9Show <notifications@myk9show.com>',
          to: job.recipient_email,
          subject: text.subject,
          html: renderHtmlEmail(text.subject, text.body, text.secretaryNote),
        }),
      },
      { fetchImpl: deps.fetch }
    );
  } catch {
    return { ok: false, error: 'email_delivery_error' };
  }
  if (!response.ok) {
    await response.text();
    return { ok: false, error: `provider_http_${response.status}` };
  }
  const resend = (await response.json()) as { id?: string };
  return { ok: true, messageId: resend.id ?? null };
}

export async function insertEmailLog(
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

export async function insertAttempt(
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
