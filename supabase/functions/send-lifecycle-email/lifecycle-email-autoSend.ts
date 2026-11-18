/**
 * The drain for automatic lifecycle email jobs (MYK9-2124, docs/plan-automatic-email-jobs.md).
 *
 * pg_cron calls `drain_auto` every five minutes. The database claims the due, automatic jobs
 * (claim_due_auto_email_jobs: a lease and a fresh attempt_id per job), and this module sends
 * each one: render at SEND time, one provider call under the job's idempotency key, one
 * attempt row, one email_log row (with the show, so Delivery history lists it), then the job
 * is marked sent. Only the attempt that holds the job's attempt_id may record its outcome.
 *
 *   interrupted after the provider accepted   the next drain finds the attempt's
 *                                             resend_message_id and marks the job sent
 *                                             without a second send
 *   provider refused                          attempt recorded, the job waits out a growing
 *                                             delay (5 min, 15 min, 1 h, 3 h); the fifth
 *                                             refusal ends the job at `failed`, which stays
 *                                             visible in Delivery history
 *   show unpublished, or no live entry left   the job is skipped
 *   judge_changed (MYK9-2125)                 same drain; the email names each class whose judge
 *                                             changed, rendered at send time. A class with no
 *                                             judge named yet is told as "not named yet"
 */
import {
  deliverViaResend,
  findExistingDelivery,
  getErrorMessage,
  insertAttempt,
  insertEmailLog,
  type LifecycleEmailJobRow,
  type LifecycleEmailSupabaseClient,
  type QueryResult,
  type SendLifecycleEmailDeps,
} from './lifecycle-email-shared.ts';
import { planJudgeChangedEmail, renderJudgeChangedEmail } from './lifecycle-email-judgeChanged.ts';
import {
  isPublishedShow,
  renderShowChangedEmail,
  type ShowChangedShow,
} from './lifecycle-email-showChanged.ts';

export const AUTO_SEND_BATCH_SIZE = 25;
/** Longer than the function's wall-clock cap, so an attempt cannot still run once its lease ends. */
export const AUTO_SEND_LEASE_MS = 10 * 60 * 1000;
export const AUTO_SEND_MAX_FAILED_ATTEMPTS = 5;
/** One invocation keeps claiming batches until nothing is due or this much wall clock is spent. */
export const AUTO_SEND_TIME_BUDGET_MS = 60_000;
/**
 * How long a job waits after its 1st, 2nd, 3rd and 4th refusal. It is held through
 * claimed_until, so neither this run's loop nor an earlier cron run takes it sooner.
 */
export const AUTO_SEND_RETRY_DELAYS_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
];

const SHOW_SELECT =
  'id, name, status, deleted_at, venue_name, address, city, state, zip_code, trials(name, date, deleted_at)';

interface ClaimedJob {
  job_id: string;
  attempt_id: string;
  show_id: string;
  step_type: string;
  recipient_person_id: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  idempotency_key: string;
  due_at: string;
}

interface AttemptRow {
  attempted_at: string;
  email_log_id: string | null;
  resend_message_id: string | null;
  status: string;
}

export type AutoSendOutcome = 'sent' | 'reconciled' | 'retry' | 'failed' | 'skipped' | 'error';

export interface DrainAutoResult {
  claimed: number;
  sent: number;
  reconciled: number;
  retry: number;
  failed: number;
  skipped: number;
  errors: number;
}

export async function drainAutoEmailJobs(args: {
  deps: SendLifecycleEmailDeps;
  supabase: LifecycleEmailSupabaseClient;
  now?: () => Date;
  timeBudgetMs?: number;
}): Promise<DrainAutoResult> {
  const now = args.now ?? (() => new Date());
  const budgetMs = args.timeBudgetMs ?? AUTO_SEND_TIME_BUDGET_MS;
  const startedAt = now().getTime();
  const result: DrainAutoResult = {
    claimed: 0,
    sent: 0,
    reconciled: 0,
    retry: 0,
    failed: 0,
    skipped: 0,
    errors: 0,
  };
  if (!args.deps.resendApiKey) throw new Error('Email service not configured');

  // Batch after batch until nothing is due or the time budget is spent; whatever is left is
  // claimed by the next run, five minutes later.
  for (;;) {
    const { data, error } = await args.supabase.rpc('claim_due_auto_email_jobs', {
      p_limit: AUTO_SEND_BATCH_SIZE,
      p_lease_until: new Date(now().getTime() + AUTO_SEND_LEASE_MS).toISOString(),
    });
    if (error) {
      console.error('drain_auto: claim failed', getErrorMessage(error));
      throw new Error('Failed to claim automatic emails');
    }

    const jobs = (Array.isArray(data) ? data : []) as ClaimedJob[];
    if (jobs.length === 0) break;
    result.claimed += jobs.length;
    for (const job of jobs) {
      let outcome: AutoSendOutcome;
      try {
        outcome = await processClaimedJob({ ...args, job, now });
      } catch (err) {
        // The lease is left to expire: the next drain after it claims the job again.
        console.error('drain_auto: job left for the next drain', job.job_id, getErrorMessage(err));
        outcome = 'error';
      }
      if (outcome === 'error') result.errors += 1;
      else result[outcome] += 1;
    }
    if (now().getTime() - startedAt >= budgetMs) break;
  }
  return result;
}

async function processClaimedJob(args: {
  deps: SendLifecycleEmailDeps;
  supabase: LifecycleEmailSupabaseClient;
  job: ClaimedJob;
  now: () => Date;
}): Promise<AutoSendOutcome> {
  const { supabase, job } = args;
  const row: LifecycleEmailJobRow = {
    id: job.job_id,
    show_id: job.show_id,
    step_type: job.step_type,
    status: 'ready',
    recipient_email: job.recipient_email,
    recipient_name: job.recipient_name,
    subject: null,
    body: null,
    secretary_note: null,
    rendered_subject: null,
    rendered_body: null,
    rendered_secretary_note: null,
    email_log_id: null,
    idempotency_key: job.idempotency_key,
    entry_id: null,
  };
  const ctx = { supabase, job: row, userId: null };

  const attempts = await loadAttempts(supabase, job.job_id);

  // A provider-accepted send whose outcome was never recorded: finish it, never send again.
  const accepted = attempts.find(attempt => attempt.resend_message_id);
  if (accepted) {
    const existing = await findExistingDelivery(supabase, job.job_id);
    const emailLogId =
      accepted.email_log_id ??
      existing?.id ??
      (await insertEmailLog(ctx, accepted.resend_message_id, 'sent', null));
    await finishJob(args, { status: 'sent', emailLogId: emailLogId ?? null });
    return 'reconciled';
  }

  // Only refusals since the job last became due count: a retry or a new edit starts afresh.
  const failedBefore = attempts.filter(
    attempt =>
      attempt.status === 'failed' && Date.parse(attempt.attempted_at) >= Date.parse(job.due_at)
  ).length;
  if (failedBefore >= AUTO_SEND_MAX_FAILED_ATTEMPTS) {
    await finishJob(args, { status: 'failed' });
    return 'failed';
  }

  const show = await loadShow(supabase, job.show_id);
  if (!show || !isPublishedShow(show) || !job.recipient_person_id) {
    await finishJob(args, { status: 'skipped' });
    return 'skipped';
  }
  // The address on the job is a snapshot from when it was queued: send to the person's
  // CURRENT one, and skip when they have none now.
  const currentEmail = await resolveCurrentEmail(supabase, job.recipient_person_id);
  if (!currentEmail) {
    console.warn('drain_auto: skipped, the recipient has no email now', job.job_id);
    await finishJob(args, { status: 'skipped' });
    return 'skipped';
  }
  row.recipient_email = currentEmail;
  // The secretary may switch the step off during the quiet minutes: honour it at send time.
  if (!(await stepIsEnabled(supabase, job.show_id, job.step_type))) {
    await finishJob(args, { status: 'skipped' });
    return 'skipped';
  }

  let text: { subject: string; body: string };
  if (job.step_type === 'judge_changed') {
    // MYK9-2125: still a recipient means a live entry in a class whose judge really changed.
    const plan = await planJudgeChangedEmail({
      supabase,
      jobId: job.job_id,
      showId: job.show_id,
      personId: job.recipient_person_id,
      now: args.now(),
    });
    if (plan.kind === 'skip') {
      await finishJob(args, { status: 'skipped' });
      return 'skipped';
    }
    // MYK9-2161: record what this email says about each class it names ("not named yet" or a judge),
    // BEFORE it is sent, so the fact survives an interrupted send that a later drain only finishes.
    // The secretary's "email the exhibitors who were told no judge yet" is built from it. Rewritten
    // on every attempt; only a job that ends up sent is ever read.
    const classNotices = Object.fromEntries(
      plan.changes.map(change => [change.classId, change.toJudge ? 'named' : 'unnamed'])
    );
    const recorded = await supabase
      .from('show_lifecycle_email_jobs')
      .update({ class_notices: classNotices })
      .eq('id', job.job_id)
      .eq('attempt_id', job.attempt_id);
    if (recorded.error) throw new Error('Failed to record the email classes');
    text = renderJudgeChangedEmail({
      showId: job.show_id,
      showName: show.name,
      recipientName: job.recipient_name,
      registryId: plan.registryId,
      changes: plan.changes,
    });
  } else {
    if (!(await personHasLiveEntry(supabase, job.show_id, job.recipient_person_id))) {
      await finishJob(args, { status: 'skipped' });
      return 'skipped';
    }
    text = renderShowChangedEmail({ show, recipientName: job.recipient_name });
  }
  const delivery = await deliverViaResend(args.deps, row, { ...text, secretaryNote: '' });

  if (!delivery.ok) {
    if (failedBefore + 1 >= AUTO_SEND_MAX_FAILED_ATTEMPTS) {
      // The last refusal is one Delivery history line: the log row, with the attempt tied to it.
      const emailLogId = await insertEmailLog(ctx, null, 'failed', delivery.error, {
        ...text,
        secretaryNote: '',
      });
      await insertAttempt(ctx, emailLogId ?? null, null, 'failed', delivery.error);
      await finishJob(args, {
        status: 'failed',
        emailLogId: emailLogId ?? null,
        rendered: text,
      });
      return 'failed';
    }
    await insertAttempt(ctx, null, null, 'failed', delivery.error);
    await releaseLease({ ...args, refusals: failedBefore + 1 });
    return 'retry';
  }

  // Record the provider's acceptance FIRST: if anything after this is interrupted, the next
  // drain finds the message id and finishes the job without sending again.
  await insertAttempt(ctx, null, delivery.messageId, 'sent', null);
  const emailLogId = await insertEmailLog(ctx, delivery.messageId, 'sent', null, {
    ...text,
    secretaryNote: '',
  });
  await finishJob(args, { status: 'sent', emailLogId: emailLogId ?? null, rendered: text });
  return 'sent';
}

async function loadAttempts(
  supabase: LifecycleEmailSupabaseClient,
  jobId: string
): Promise<AttemptRow[]> {
  const { data, error } = (await supabase
    .from('show_lifecycle_email_attempts')
    .select('attempted_at, email_log_id, resend_message_id, status')
    .eq('job_id', jobId)) as QueryResult<AttemptRow[]>;
  if (error) throw new Error('Failed to load email attempts');
  return data ?? [];
}

async function loadShow(
  supabase: LifecycleEmailSupabaseClient,
  showId: string
): Promise<ShowChangedShow | null> {
  const { data, error } = (await supabase
    .from('shows')
    .select(SHOW_SELECT)
    .eq('id', showId)
    .single()) as QueryResult<ShowChangedShow>;
  // A missing show is a skip; a failed read must not read as one.
  if (error && !data) {
    const code = (error as { code?: string }).code;
    if (code === 'PGRST116') return null;
    throw new Error('Failed to load show');
  }
  return data;
}

async function stepIsEnabled(
  supabase: LifecycleEmailSupabaseClient,
  showId: string,
  stepType: string
): Promise<boolean> {
  const { data, error } = (await supabase
    .from('show_lifecycle_email_steps')
    .select('is_enabled')
    .eq('show_id', showId)
    .eq('step_type', stepType)) as QueryResult<Array<{ is_enabled: boolean }>>;
  // A failed read must not read as "switched off": leave the job for the next drain.
  if (error) throw new Error('Failed to load email step');
  return data?.[0]?.is_enabled === true;
}

async function resolveCurrentEmail(
  supabase: LifecycleEmailSupabaseClient,
  personId: string
): Promise<string | null> {
  const { data, error } = (await supabase
    .from('people')
    .select('email, deleted_at')
    .eq('id', personId)) as QueryResult<Array<{ email: string | null; deleted_at: string | null }>>;
  // A failed read must not read as "no email": leave the job for the next drain.
  if (error) throw new Error('Failed to load the recipient');
  const person = data?.[0];
  if (!person || person.deleted_at) return null;
  return person.email?.trim() || null;
}

async function personHasLiveEntry(
  supabase: LifecycleEmailSupabaseClient,
  showId: string,
  personId: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc('show_person_has_live_entry', {
    p_show_id: showId,
    p_person_id: personId,
  });
  if (error) throw new Error('Failed to check the recipient');
  return data === true;
}

/** Compare-and-set on attempt_id: an abandoned attempt finishing late changes nothing. */
async function finishJob(
  args: { supabase: LifecycleEmailSupabaseClient; job: ClaimedJob; now: () => Date },
  outcome: {
    status: 'sent' | 'failed' | 'skipped';
    emailLogId?: string | null;
    rendered?: { subject: string; body: string };
  }
) {
  const at = args.now().toISOString();
  const { error } = await args.supabase
    .from('show_lifecycle_email_jobs')
    .update({
      status: outcome.status,
      ...(outcome.status === 'sent' ? { sent_at: at } : {}),
      ...(outcome.status === 'skipped' ? { skipped_at: at } : {}),
      ...(outcome.emailLogId ? { email_log_id: outcome.emailLogId } : {}),
      ...(outcome.rendered
        ? { rendered_subject: outcome.rendered.subject, rendered_body: outcome.rendered.body }
        : {}),
      attempt_id: null,
      claimed_until: null,
    })
    .eq('id', args.job.job_id)
    .eq('attempt_id', args.job.attempt_id);
  if (error) throw new Error('Failed to record the email outcome');
}

/** Free the attempt but keep the job waiting out the retry delay, so no loop pass takes it again. */
async function releaseLease(args: {
  supabase: LifecycleEmailSupabaseClient;
  job: ClaimedJob;
  now: () => Date;
  refusals: number;
}) {
  const delay =
    AUTO_SEND_RETRY_DELAYS_MS[Math.min(args.refusals, AUTO_SEND_RETRY_DELAYS_MS.length) - 1];
  const { error } = await args.supabase
    .from('show_lifecycle_email_jobs')
    .update({
      attempt_id: null,
      claimed_until: new Date(args.now().getTime() + delay).toISOString(),
    })
    .eq('id', args.job.job_id)
    .eq('attempt_id', args.job.attempt_id);
  if (error) throw new Error('Failed to release the email lease');
}
