// The full confirmation as a durable job (MYK9-2088, docs/plan-automatic-email-jobs.md Phase 2).
// Deno-free: index.ts injects the database and Resend; entryConfirmationRun.test.ts drives it
// against an in-memory store.
//
// One scheduled run does two things. It WRITES a job for each exhibitor whose accepted entries
// have not had their confirmation (the subject and body are rendered then and kept on the job,
// with the covered entry ids and the Resend idempotency key). And it DRAINS jobs: the database
// leases a due job (claim_due_auto_email_jobs, the lease MYK9-2124 introduced), and this module
// sends it. Because every run drains first, a run that was stopped is recovered by the next one:
//
//   stopped after the claim, before the send   the lease runs out; the next run claims the job
//                                              again and sends it
//   stopped after the provider accepted        the attempt row (written first) holds the
//                                              message id; the next run marks the job and the
//                                              entries sent without a second send. If the run
//                                              stopped before even that row, the retry carries
//                                              the same Idempotency-Key, so Resend returns the
//                                              first message instead of sending another
//   provider refused                           the attempt is recorded and the job waits out a
//                                              growing delay (5 min, 15 min, 1 h, 3 h); the
//                                              fifth refusal ends the job at `failed`, the
//                                              entries are marked failed and the daily run
//                                              revives it
//   entries changed, re-accepted, or the show's   the job is skipped; the entries stay pending
//   switch turned off                             and the next run writes a fresh job if they
//                                                 still qualify
//
// entries.confirmation_email_sent_at / status / message id are written when the job SUCCEEDS,
// so the historical marker keeps its meaning for every other reader.

import { confirmationIdempotencyKey } from './entryConfirmations.ts';

export const CONFIRMATION_JOB_STEP_TYPE = 'entry_confirmation';
export const CONFIRMATION_BATCH_SIZE = 25;
/** Longer than the function's wall-clock cap, so an attempt cannot still run once its lease ends. */
export const CONFIRMATION_LEASE_MS = 10 * 60 * 1000;
export const CONFIRMATION_MAX_FAILED_ATTEMPTS = 5;
/** One run keeps claiming batches until nothing is due or this much wall clock is spent. */
export const CONFIRMATION_DRAIN_BUDGET_MS = 60_000;
/** How long a job waits after its 1st, 2nd, 3rd and 4th refusal (same schedule as MYK9-2124). */
export const CONFIRMATION_RETRY_DELAYS_MS = [
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
  3 * 60 * 60 * 1000,
];

/** A job this run holds the lease on. Only the holder of attemptId may record its outcome. */
export interface ConfirmationJob {
  id: string;
  attemptId: string;
  showId: string;
  /** The run's exhibitor-per-show group key. */
  groupKey: string;
  /** The first covered entry: email_log.related_id, as before. */
  anchorEntryId: string;
  entryIds: string[];
  recipientEmail: string;
  subject: string;
  html: string;
  idempotencyKey: string;
  /** When the job last became due; only refusals since then count toward the limit. */
  dueAt: string;
}

export interface ConfirmationJobAttempt {
  attemptedAt: string;
  emailLogId: string | null;
  resendMessageId: string | null;
  status: string;
}

export type EnqueueOutcome =
  | { outcome: 'created' | 'revived' }
  /** A job for this exact email is already waiting or in flight, or another job holds the group. */
  | { outcome: 'open' }
  /** The email already went out; only the entries' marker lagged. */
  | { outcome: 'sent'; messageId: string | null };

export interface ConfirmationJobStore {
  /**
   * Writes the job for one exhibitor's email, keyed by its idempotency key. A job that ended
   * `skipped` or `failed` under the same key is revived (due now, lease cleared, text replaced).
   * One READY job per exhibitor per show is a database guarantee, so a second run racing this
   * one gets `open`, never a second job.
   */
  enqueue(args: {
    showId: string;
    groupKey: string;
    registrationId: string | null;
    entryIds: string[];
    recipientEmail: string;
    recipientName: string | null;
    subject: string;
    html: string;
    idempotencyKey: string;
    nowIso: string;
  }): Promise<EnqueueOutcome>;
  /** Due, automatic, entry_confirmation jobs with a free or expired lease, leased until leaseUntilIso. */
  claimDue(limit: number, leaseUntilIso: string): Promise<ConfirmationJob[]>;
  loadAttempts(jobId: string): Promise<ConfirmationJobAttempt[]>;
  recordAttempt(
    job: ConfirmationJob,
    attempt: { status: 'sent' | 'failed'; messageId: string | null; error: string | null }
  ): Promise<void>;
  /** Ends the job (compare-and-set on the attempt id: an abandoned attempt changes nothing). */
  finish(
    job: ConfirmationJob,
    outcome: { status: 'sent' | 'failed' | 'skipped'; emailLogId?: string | null; nowIso: string }
  ): Promise<void>;
  /** Frees the attempt but keeps the job waiting until untilIso. */
  releaseLease(job: ConfirmationJob, untilIso: string): Promise<void>;
}

export interface ConfirmationLogEntry {
  recipient_email: string | null;
  email_type: 'heritage_confirmation';
  related_id: string;
  show_id: string;
  resend_message_id: string | null;
  status: 'sent' | 'failed';
  error_message: string | null;
  content?: { subject: string; html: string };
}

export type ConfirmationSendOutcome =
  { ok: true; messageId: string } | { ok: false; error: string };

/** What the drain needs from the rest of the run's dependencies. */
export interface ConfirmationDrainDeps {
  now(): Date;
  jobs: ConfirmationJobStore;
  /** Of these entries, the ids still accepted, with an armband, not deleted and unmarked. */
  loadLiveEntryIds(entryIds: string[]): Promise<Set<string>>;
  loadAcceptanceGenerations(entryIds: string[]): Promise<Map<string, string>>;
  /** Writes sent_at / status 'sent' / message id on entries still unmarked. Idempotent. */
  markSent(entryIds: string[], messageId: string | null, nowIso: string): Promise<void>;
  /** Final failure: unmarked and 'failed', so the daily run retries. */
  markFailed(entryIds: string[]): Promise<void>;
  send(email: {
    to: string;
    subject: string;
    html: string;
    idempotencyKey: string;
  }): Promise<ConfirmationSendOutcome>;
  /** Writes the Delivery history row; resolves to its id. */
  log(row: ConfirmationLogEntry): Promise<string | null>;
  /** The sent log row already written for a provider message id, if any. */
  findLogId(messageId: string): Promise<string | null>;
}

export interface ConfirmationDrainTotals {
  sent: number;
  reconciled: number;
  retrying: number;
  failed: number;
  skipped: number;
  errors: number;
}

export function emptyDrainTotals(): ConfirmationDrainTotals {
  return { sent: 0, reconciled: 0, retrying: 0, failed: 0, skipped: 0, errors: 0 };
}

type Outcome = 'sent' | 'reconciled' | 'retry' | 'failed' | 'skipped';

/**
 * Claims and sends due confirmation jobs until none is due or the time budget is spent.
 * `activeShowIds` are the shows that take confirmations right now (published, not over, switch
 * on); a job of any other show is skipped, never sent.
 */
export async function drainConfirmationJobs(
  deps: ConfirmationDrainDeps,
  activeShowIds: ReadonlySet<string>,
  totals: ConfirmationDrainTotals
): Promise<void> {
  const startedAt = deps.now().getTime();
  for (;;) {
    const jobs = await deps.jobs.claimDue(
      CONFIRMATION_BATCH_SIZE,
      new Date(deps.now().getTime() + CONFIRMATION_LEASE_MS).toISOString()
    );
    if (jobs.length === 0) return;
    for (const job of jobs) {
      try {
        const outcome = await processJob(deps, activeShowIds, job);
        if (outcome === 'retry') totals.retrying += 1;
        else totals[outcome] += 1;
      } catch (error) {
        // The lease is left to run out: the next run claims the job again.
        totals.errors += 1;
        console.error('Confirmation job left for the next run', {
          jobId: job.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (deps.now().getTime() - startedAt >= CONFIRMATION_DRAIN_BUDGET_MS) return;
  }
}

async function processJob(
  deps: ConfirmationDrainDeps,
  activeShowIds: ReadonlySet<string>,
  job: ConfirmationJob
): Promise<Outcome> {
  const nowIso = () => deps.now().toISOString();
  const attempts = await deps.jobs.loadAttempts(job.id);

  // A provider-accepted send whose outcome was never recorded: finish it, never send again.
  const accepted = attempts.find(attempt => attempt.resendMessageId);
  if (accepted?.resendMessageId) {
    const emailLogId =
      accepted.emailLogId ??
      (await deps.findLogId(accepted.resendMessageId)) ??
      (await deps.log(sentLog(job, accepted.resendMessageId)));
    await deps.markSent(job.entryIds, accepted.resendMessageId, nowIso());
    await deps.jobs.finish(job, { status: 'sent', emailLogId, nowIso: nowIso() });
    console.log('Confirmation reconciled without a second send', {
      jobId: job.id,
      messageId: accepted.resendMessageId,
    });
    return 'reconciled';
  }

  const failedBefore = attempts.filter(
    attempt =>
      attempt.status === 'failed' && Date.parse(attempt.attemptedAt) >= Date.parse(job.dueAt)
  ).length;
  if (failedBefore >= CONFIRMATION_MAX_FAILED_ATTEMPTS) {
    await endFailed(deps, job, 'attempts_exhausted');
    return 'failed';
  }

  if (!(await stillQualifies(deps, activeShowIds, job))) {
    await deps.jobs.finish(job, { status: 'skipped', nowIso: nowIso() });
    return 'skipped';
  }

  let result: ConfirmationSendOutcome;
  try {
    result = await deps.send({
      to: job.recipientEmail,
      subject: job.subject,
      html: job.html,
      idempotencyKey: job.idempotencyKey,
    });
  } catch {
    result = { ok: false, error: 'email_delivery_error' };
  }

  if (!result.ok) {
    await deps.jobs.recordAttempt(job, { status: 'failed', messageId: null, error: result.error });
    console.error('Confirmation send refused', {
      jobId: job.id,
      error: result.error,
      refusals: failedBefore + 1,
    });
    if (failedBefore + 1 >= CONFIRMATION_MAX_FAILED_ATTEMPTS) {
      await endFailed(deps, job, result.error);
      return 'failed';
    }
    const delay =
      CONFIRMATION_RETRY_DELAYS_MS[
        Math.min(failedBefore + 1, CONFIRMATION_RETRY_DELAYS_MS.length) - 1
      ]!;
    await deps.jobs.releaseLease(job, new Date(deps.now().getTime() + delay).toISOString());
    return 'retry';
  }

  // The provider's acceptance is recorded FIRST: if anything after this is interrupted, the next
  // run finds the message id and finishes the job without sending again.
  await deps.jobs.recordAttempt(job, { status: 'sent', messageId: result.messageId, error: null });
  const emailLogId = await deps.log(sentLog(job, result.messageId));
  await deps.markSent(job.entryIds, result.messageId, nowIso());
  await deps.jobs.finish(job, { status: 'sent', emailLogId, nowIso: nowIso() });
  return 'sent';
}

function sentLog(job: ConfirmationJob, messageId: string): ConfirmationLogEntry {
  return {
    recipient_email: job.recipientEmail,
    email_type: 'heritage_confirmation',
    related_id: job.anchorEntryId,
    show_id: job.showId,
    resend_message_id: messageId,
    status: 'sent',
    error_message: null,
    content: { subject: job.subject, html: job.html },
  };
}

/**
 * The job ending `failed` is the Delivery history line (read from the job and its last refused
 * attempt, so a retried-then-sent confirmation never shows a failure); the entries wait for the
 * daily run.
 */
async function endFailed(deps: ConfirmationDrainDeps, job: ConfirmationJob, error: string) {
  await deps.markFailed(job.entryIds);
  await deps.jobs.finish(job, { status: 'failed', nowIso: deps.now().toISOString() });
  console.error('Confirmation could not be sent', { jobId: job.id, error });
}

/**
 * The job was written minutes (or, after an interruption, hours) ago. Send it only while every
 * entry it covers is still accepted and unmarked under the same acceptance generations, and the
 * show still takes confirmations; otherwise the email would describe something that is no longer so.
 */
async function stillQualifies(
  deps: ConfirmationDrainDeps,
  activeShowIds: ReadonlySet<string>,
  job: ConfirmationJob
): Promise<boolean> {
  if (!activeShowIds.has(job.showId)) return false;
  const live = await deps.loadLiveEntryIds(job.entryIds);
  if (!job.entryIds.every(id => live.has(id))) return false;
  const generations = await deps.loadAcceptanceGenerations(job.entryIds);
  const key = await confirmationIdempotencyKey({ key: job.groupKey }, job.entryIds, generations);
  return key === job.idempotencyKey;
}
