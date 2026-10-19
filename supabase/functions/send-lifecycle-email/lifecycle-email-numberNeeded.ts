import { HttpError } from '../_shared/http/responses.ts';
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
  type EmailText,
  type LifecycleEmailJobRow,
  type LifecycleEmailSupabaseClient,
  type QueryResult,
  type SendLifecycleEmailDeps,
  type SendLifecycleEmailPayload,
} from './lifecycle-email-shared.ts';

/** What `claim_registration_number_needed_job` decided for one send request. */
export type NumberNeededClaim =
  | { outcome: 'busy' }
  | { outcome: 'sent'; jobId: string }
  | { outcome: 'send'; jobId: string; attemptId: string; recovered: boolean };

const nonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

/** Reads the RPC's jsonb answer; anything unexpected is a server error, never a guess. */
export function parseNumberNeededClaim(data: unknown): NumberNeededClaim {
  const row = (data ?? {}) as {
    outcome?: unknown;
    job_id?: unknown;
    attempt_id?: unknown;
    recovered?: unknown;
  };
  if (row.outcome === 'busy') return { outcome: 'busy' };
  if (row.outcome === 'sent' && nonEmptyString(row.job_id)) {
    return { outcome: 'sent', jobId: row.job_id };
  }
  // A `send` without the attempt it owns could never record its outcome.
  if (row.outcome === 'send' && nonEmptyString(row.job_id) && nonEmptyString(row.attempt_id)) {
    return {
      outcome: 'send',
      jobId: row.job_id,
      attemptId: row.attempt_id,
      recovered: row.recovered === true,
    };
  }
  throw new HttpError(500, 'Failed to save lifecycle email');
}

/**
 * Supabase Edge Functions' wall-clock limit on the paid plan (the larger of the two:
 * free is 150 s). Source: https://supabase.com/docs/guides/functions/limits
 * ("Maximum Duration (Wall clock limit)"). No invocation, and so no attempt, can still
 * be running after this long.
 */
export const EDGE_FUNCTION_WALL_CLOCK_LIMIT_MS = 400 * 1000;

/**
 * An attempt's lease. It must exceed EDGE_FUNCTION_WALL_CLOCK_LIMIT_MS: an expired
 * lease is treated as an abandoned attempt, which is only true if no invocation can
 * outlive it (a test pins the inequality).
 */
export const NUMBER_NEEDED_STALE_SEND_MS = 10 * 60 * 1000;

/** The attempt lease the claim stamps on the job it answers `send` for. */
export function numberNeededClaimWindow(now = Date.now()) {
  return { p_lease_until: new Date(now + NUMBER_NEEDED_STALE_SEND_MS).toISOString() };
}

interface HeldEntryRow {
  id?: string;
  handler?: string | null;
  show_id: string | null;
  dog_id: string | null;
  class_id: string | null;
  entry_status: string | null;
  deleted_at: string | null;
}

type HeldVerdict = 'held' | 'not_held' | 'unverified';

const NO_ROWS_CODE = 'PGRST116';

function errorCode(error: unknown): string | null {
  return error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code)
    : null;
}

/**
 * "Registration number needed" must never reach an exhibitor after the number is on
 * file. "Held" is the server's verdict: `entry_awaiting_registration_number`, the one
 * SQL definition the entry-results views and the score guard use. It is asked
 * directly, with the entry's own facts, because this handler runs with the
 * service-role client: the entry-results views gate rows on the CALLER
 * (`auth.uid()`), which a service-role read does not have.
 *
 * A lookup or rpc ERROR is `unverified` (never a guess in either direction); an entry
 * that is gone or belongs to another show is `not_held`.
 */
async function loadHeldEntry(
  supabase: LifecycleEmailSupabaseClient,
  showId: string,
  entryId: string
): Promise<{ verdict: HeldVerdict; entry: HeldEntryRow | null }> {
  const { data: entry, error } = (await supabase
    .from('entries')
    .select('id, show_id, dog_id, class_id, entry_status, deleted_at, handler')
    .eq('id', entryId)
    .single()) as QueryResult<HeldEntryRow>;
  if (error && errorCode(error) !== NO_ROWS_CODE) return { verdict: 'unverified', entry: null };
  if (!entry || entry.show_id !== showId || !entry.dog_id || !entry.class_id) {
    return { verdict: 'not_held', entry: null };
  }
  const { data: held, error: heldError } = await supabase.rpc(
    'entry_awaiting_registration_number',
    {
      p_dog_id: entry.dog_id,
      p_class_id: entry.class_id,
      p_entry_status: entry.entry_status,
      p_deleted_at: entry.deleted_at,
    }
  );
  if (heldError) return { verdict: 'unverified', entry };
  return { verdict: held === true ? 'held' : 'not_held', entry };
}

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The request key for one Send request of this step. Keyed by the browser's
 * per-preview request id: a retry of the same preview (a response that never
 * arrived) is the same email, while a new Send reminder click is a new one.
 */
function buildNumberNeededRequestKey(showId: string, entryId: string, requestId: string) {
  return `show-lifecycle-email:${showId}:registration_number_needed:entry:request-${requestId.toLowerCase()}:${entryId}`;
}

export type NumberNeededOutcome =
  | { status: 'sent' | 'failed'; jobId: string; recovered?: true }
  | { status: 'skipped'; reason: 'not_held' | 'unverified' | 'no_email' }
  | { status: 'busy' };

/**
 * One server-side step for "Registration number needed" (MYK9-1162): the browser sends only
 * the reviewed text. Authorization (by the caller), the step switch, the held check and the
 * recipient are all decided here, at send time, so nothing stale from a browser can reach
 * an exhibitor. This is the ONLY path that sends this step (MYK9-1212).
 */
export async function sendRegistrationNumberNeeded(args: {
  deps: SendLifecycleEmailDeps;
  payload: SendLifecycleEmailPayload;
  supabase: LifecycleEmailSupabaseClient;
  userId: string;
}): Promise<NumberNeededOutcome> {
  const { payload, supabase, userId } = args;
  const showId = payload.show_id as string;
  if (!payload.entry_id) throw new HttpError(400, 'entry_id is required');
  const entryId = payload.entry_id;
  const requestId = payload.request_id ?? '';
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new HttpError(400, 'request_id is required');

  const { data: step, error: stepError } = (await supabase
    .from('show_lifecycle_email_steps')
    .select('id, is_enabled')
    .eq('show_id', showId)
    .eq('step_type', 'registration_number_needed')
    .single()) as QueryResult<{ id: string; is_enabled?: boolean | null }>;
  if (stepError) throw new HttpError(500, 'Failed to load lifecycle email step');
  if (!step) throw new HttpError(404, 'Lifecycle email step not found');
  if (step.is_enabled === false) {
    throw new HttpError(409, 'Registration number emails are turned off for this show');
  }

  const { verdict, entry } = await loadHeldEntry(supabase, showId, entryId);
  if (verdict !== 'held' || !entry) {
    return { status: 'skipped', reason: verdict === 'unverified' ? 'unverified' : 'not_held' };
  }

  const owner = entry.dog_id ? await fetchDogOwner(supabase, entry.dog_id) : null;
  const recipientEmail = owner?.email?.trim() || null;
  if (!recipientEmail) return { status: 'skipped', reason: 'no_email' };
  const recipientName = formatPersonName(owner) ?? entry.handler ?? null;

  // One atomic claim decides what this request sends and mints the attempt that owns
  // it (see claim_registration_number_needed_job): a new attempt on its own job, a
  // recovered earlier job, a replacement for a changed address, or a first email.
  const { data: claim, error: claimError } = await supabase.rpc(
    'claim_registration_number_needed_job',
    {
      p_show_id: showId,
      p_entry_id: entryId,
      p_step_id: step.id,
      p_request_key: buildNumberNeededRequestKey(showId, entryId, requestId),
      p_recipient_email: recipientEmail,
      p_recipient_name: recipientName,
      p_subject: payload.subject?.trim() || 'Registration number needed',
      p_body: payload.body ?? null,
      p_secretary_note: payload.secretary_note ?? null,
      p_user_id: userId,
      ...numberNeededClaimWindow(),
    }
  );
  // Another writer holds this entry's one outstanding email: busy, as before.
  if (claimError) {
    if (isUniqueViolation(claimError)) return { status: 'busy' };
    throw new HttpError(500, getErrorMessage(claimError) ?? 'Failed to save lifecycle email');
  }
  const outcome = parseNumberNeededClaim(claim);
  if (outcome.outcome === 'busy') return { status: 'busy' };
  if (outcome.outcome === 'sent') return { status: 'sent', jobId: outcome.jobId };

  const [job] = await fetchJobs(supabase, showId, [outcome.jobId]);
  if (!job) return { status: 'busy' };
  const status = await sendNumberNeededAttempt({
    deps: args.deps,
    supabase,
    job,
    attemptId: outcome.attemptId,
    userId,
  });
  return outcome.recovered ? { status, jobId: job.id, recovered: true } : { status, jobId: job.id };
}

/**
 * Sends one owned attempt. The job is always sent with ITS OWN stored text under ITS
 * OWN Idempotency-Key (per job, not per attempt): the provider collapses a replay and
 * refuses a changed payload under a key it has seen. Every outcome is audited
 * (email_log + attempt row); the job row changes only through the owner-only finish.
 * A finish that loses ownership is logged, and the provider's real result is returned.
 */
async function sendNumberNeededAttempt(args: {
  deps: SendLifecycleEmailDeps;
  supabase: LifecycleEmailSupabaseClient;
  job: LifecycleEmailJobRow;
  attemptId: string;
  userId: string;
}): Promise<'sent' | 'failed'> {
  const { job } = args;
  const text: EmailText = {
    subject: job.subject || 'Update from myK9Show',
    body: job.body || '',
    secretaryNote: job.secretary_note || '',
  };

  // An earlier attempt may have delivered and died before recording it: never send twice.
  const existing = await findExistingDelivery(args.supabase, job.id);
  if (existing) {
    await insertAttempt(args, existing.id, existing.resend_message_id ?? null, 'sent', null);
    await finishAttempt(args, 'sent', existing.id, text);
    return 'sent';
  }

  const result: Awaited<ReturnType<typeof deliverViaResend>> = job.recipient_email
    ? await deliverViaResend(args.deps, job, text)
    : { ok: false, error: 'Missing recipient email' };
  const status = result.ok ? 'sent' : 'failed';
  const messageId = result.ok ? result.messageId : null;
  const error = result.ok ? null : result.error;
  const emailLogId = await insertEmailLog(args, messageId, status, error);
  await insertAttempt(args, emailLogId, messageId, status, error);
  await finishAttempt(args, status, emailLogId ?? null, text);
  return status;
}

async function finishAttempt(
  args: {
    supabase: LifecycleEmailSupabaseClient;
    job: LifecycleEmailJobRow;
    attemptId: string;
    userId: string;
  },
  status: 'sent' | 'failed',
  emailLogId: string | null,
  text: EmailText
) {
  const { data, error } = await args.supabase.rpc('finish_registration_number_needed_attempt', {
    p_job_id: args.job.id,
    p_attempt_id: args.attemptId,
    p_status: status,
    p_email_log_id: emailLogId,
    p_rendered_subject: text.subject,
    p_rendered_body: text.body,
    p_rendered_secretary_note: text.secretaryNote,
    p_user_id: args.userId,
  });
  if (error || data !== true) {
    // The delivery already happened (or failed) at the provider; the audit rows hold
    // it. Another attempt owns the job now, or the write was lost: an expired lease
    // lets the next claim recover the job, and findExistingDelivery stops a resend.
    console.warn('send-lifecycle-email: attempt outcome not recorded', {
      lost_ownership: !error,
      job_id: args.job.id,
      attempt_id: args.attemptId,
      status,
      ...(error ? { error: getErrorMessage(error) } : {}),
    });
  }
}
