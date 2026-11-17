// The full confirmation as a durable job (MYK9-2088, docs/plan-automatic-email-jobs.md Phase 2).
// Deno-free: index.ts injects the database and Resend; entryConfirmationRun.test.ts drives it
// against an in-memory store.
//
// One scheduled run does two things. It WRITES a job for each exhibitor whose accepted entries
// have not had their confirmation (the covered entry ids, each one's acceptance generation and
// the idempotency key; no text). And it DRAINS jobs: the database leases a due job
// (claim_due_auto_email_jobs, the lease MYK9-2124 introduced), and this module sends it. The
// subject, body and address are worked out AT SEND TIME from current data (entryConfirmationSend.ts),
// like the show_changed drain. Because every run drains first, a run that was stopped is recovered
// by the next one:
//
//   stopped after the claim, before the send   the lease runs out; the next run claims the job
//                                              again and sends it
//   stopped after the provider accepted        the attempt row (written first) holds the
//                                              message id; the next run marks the job and the
//                                              entries sent without a second send. If the run
//                                              stopped before even that row, the payload the send
//                                              BEGAN with is stored on the job (the one place a
//                                              body is kept), and the retry sends exactly that
//                                              payload under the same Idempotency-Key, so Resend
//                                              returns the first message instead of sending another
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
// so the historical marker keeps its meaning for every other reader. Every marker write is fenced
// by the acceptance generation the job covered (mark_entry_confirmation), in one UPDATE, so an
// entry accepted again after the send is never stamped by the earlier acceptance's job, and a
// failure never clears a sent marker.

import {
  confirmationIdempotencyKey,
  type ConfirmationEntry,
  type ConfirmationShow,
} from './entryConfirmations.ts';
import type { PreparedSend } from './entryConfirmationSend.ts';

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

/** Plain equality for identifiers (idempotency and group keys are not secrets). */
export function sameText(a: string, b: string): boolean {
  return a === b;
}

/** entry id to acceptance generation (see latestAcceptanceGenerations; 'none' when absent). */
export type Generations = Record<string, string>;

/** A job this run holds the lease on. Only the holder of attemptId may record its outcome. */
export interface ConfirmationJob {
  id: string;
  attemptId: string;
  showId: string;
  /** The run's exhibitor-per-show group key. */
  groupKey: string;
  /** Her registration, or null for a group of one handler's unregistered entries. */
  registrationId: string | null;
  /** The first covered entry: email_log.related_id, as before. */
  anchorEntryId: string;
  entryIds: string[];
  /** Each covered entry's acceptance generation when the job was written. */
  generations: Generations;
  /** Where the job was written for; replaced by the address a send begins with. */
  recipientEmail: string;
  /**
   * The payload a send BEGAN with, kept only to reconcile a provider outcome that is unknown. Null
   * when no send has begun (or the last one was definitely refused): the body is then worked out fresh.
   */
  begun: PreparedSend | null;
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
   * `skipped` or `failed` under the same key is revived (due now, lease cleared, no begun payload).
   * One READY job per exhibitor per show is a database guarantee, so a second run racing this
   * one gets `open`, never a second job.
   */
  enqueue(args: {
    showId: string;
    groupKey: string;
    registrationId: string | null;
    entryIds: string[];
    generations: Generations;
    recipientEmail: string;
    recipientName: string | null;
    idempotencyKey: string;
    nowIso: string;
  }): Promise<EnqueueOutcome>;
  /** The group keys that already hold a ready job in these shows (they wait their turn). */
  loadReadyGroupKeys(showIds: string[]): Promise<Set<string>>;
  /** Due, automatic, entry_confirmation jobs with a free or expired lease, leased until leaseUntilIso. */
  claimDue(limit: number, leaseUntilIso: string): Promise<ConfirmationJob[]>;
  loadAttempts(jobId: string): Promise<ConfirmationJobAttempt[]>;
  /** Stores the payload a send is about to begin with, before the provider is called. */
  beginSend(job: ConfirmationJob, payload: PreparedSend): Promise<void>;
  recordAttempt(
    job: ConfirmationJob,
    attempt: { status: 'sent' | 'failed'; messageId: string | null; error: string | null }
  ): Promise<void>;
  /** Ends the job (compare-and-set on the attempt id: an abandoned attempt changes nothing). */
  finish(
    job: ConfirmationJob,
    outcome: { status: 'sent' | 'failed' | 'skipped'; emailLogId?: string | null; nowIso: string }
  ): Promise<void>;
  /**
   * Frees the attempt but keeps the job waiting until untilIso. `keepBegun`: the provider outcome
   * is unknown, so the begun payload stays for the retry; otherwise it is cleared and the next
   * attempt works the body out fresh.
   */
  releaseLease(job: ConfirmationJob, untilIso: string, keepBegun: boolean): Promise<void>;
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
  | { ok: true; messageId: string }
  /** `ambiguous`: no answer came back (a timeout or dropped connection), so it may have been accepted. */
  | { ok: false; error: string; ambiguous?: boolean };

/** What the drain needs from the rest of the run's dependencies. */
export interface ConfirmationDrainDeps {
  now(): Date;
  jobs: ConfirmationJobStore;
  /** Of these entries, those still accepted, with an armband, not deleted and unmarked (current rows). */
  loadEntries(entryIds: string[]): Promise<ConfirmationEntry[]>;
  loadAcceptanceGenerations(entryIds: string[]): Promise<Map<string, string>>;
  /** Stamps sent_at / status 'sent' / message id on the entries whose CURRENT generation is the covered one. */
  markSent(generations: Generations, messageId: string | null, nowIso: string): Promise<void>;
  /** Marks 'failed' (never clearing a sent marker); fenced by generation when given. */
  markFailed(entryIds: string[], generations?: Generations): Promise<void>;
  /** The email as it should go out now: current recipient address, entries, venue and judges. */
  prepare(
    job: ConfirmationJob,
    show: ConfirmationShow,
    entries: ConfirmationEntry[]
  ): Promise<PreparedSend | 'unknown' | 'no_address'>;
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
 * `activeShows` are the shows that take confirmations right now (published, not over, switch
 * on); a job of any other show is skipped, never sent.
 */
export async function drainConfirmationJobs(
  deps: ConfirmationDrainDeps,
  activeShows: ReadonlyMap<string, ConfirmationShow>,
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
        const outcome = await processJob(deps, activeShows, job);
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

/**
 * Resend's Idempotency-Key for this send: the job's key (show, exhibitor, entries and their
 * acceptance generations) plus the address it goes to. The same address always repeats the same
 * key, so a retry of a send that did go out dedupes; a changed address is a different message
 * and gets its own key rather than a mismatched payload under an old one.
 */
export async function providerKey(jobKey: string, to: string): Promise<string> {
  const data = new TextEncoder().encode(to.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${jobKey}:${hex.slice(0, 12)}`;
}

async function processJob(
  deps: ConfirmationDrainDeps,
  activeShows: ReadonlyMap<string, ConfirmationShow>,
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
      (await deps.log(sentLog(job, accepted.resendMessageId, job.begun)));
    await deps.markSent(job.generations, accepted.resendMessageId, nowIso());
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

  const show = activeShows.get(job.showId);
  const entries = show ? await deps.loadEntries(job.entryIds) : [];
  if (!show || !(await stillQualifies(deps, job, entries))) {
    await deps.jobs.finish(job, { status: 'skipped', nowIso: nowIso() });
    return 'skipped';
  }

  // The payload. A send that already BEGAN and never reported back is repeated exactly (same
  // address, subject and body under the same key) so the provider can dedupe it. Anything else is
  // worked out now, from current data, and stored before the provider is called.
  let payload = job.begun;
  if (!payload) {
    const prepared = await deps.prepare(job, show, entries);
    // A failed read is never a guess: the lease runs out and the next run tries again.
    if (prepared === 'unknown') throw new Error('Could not read the confirmation recipient');
    if (prepared === 'no_address') {
      // The exhibitor has no usable address; the writer side marks her entries and logs it once.
      await deps.jobs.finish(job, { status: 'skipped', nowIso: nowIso() });
      return 'skipped';
    }
    payload = prepared;
    await deps.jobs.beginSend(job, payload);
  }

  let result: ConfirmationSendOutcome;
  try {
    result = await deps.send({
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      idempotencyKey: await providerKey(job.idempotencyKey, payload.to),
    });
  } catch {
    result = { ok: false, error: 'email_delivery_error', ambiguous: true };
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
    await deps.jobs.releaseLease(
      job,
      new Date(deps.now().getTime() + delay).toISOString(),
      result.ambiguous === true
    );
    return 'retry';
  }

  // The provider's acceptance is recorded FIRST: if anything after this is interrupted, the next
  // run finds the message id and finishes the job without sending again.
  await deps.jobs.recordAttempt(job, { status: 'sent', messageId: result.messageId, error: null });
  const emailLogId = await deps.log(sentLog(job, result.messageId, payload));
  await deps.markSent(job.generations, result.messageId, nowIso());
  await deps.jobs.finish(job, { status: 'sent', emailLogId, nowIso: nowIso() });
  return 'sent';
}

function sentLog(
  job: ConfirmationJob,
  messageId: string,
  payload: PreparedSend | null
): ConfirmationLogEntry {
  return {
    recipient_email: payload?.to ?? job.recipientEmail,
    email_type: 'heritage_confirmation',
    related_id: job.anchorEntryId,
    show_id: job.showId,
    resend_message_id: messageId,
    status: 'sent',
    error_message: null,
    ...(payload ? { content: { subject: payload.subject, html: payload.html } } : {}),
  };
}

/**
 * The job ending `failed` is the Delivery history line (read from the job and its last refused
 * attempt, so a retried-then-sent confirmation never shows a failure); the entries wait for the
 * daily run. The mark is fenced by generation and never clears a sent marker.
 */
async function endFailed(deps: ConfirmationDrainDeps, job: ConfirmationJob, error: string) {
  await deps.markFailed(job.entryIds, job.generations);
  await deps.jobs.finish(job, { status: 'failed', nowIso: deps.now().toISOString() });
  console.error('Confirmation could not be sent', { jobId: job.id, error });
}

/**
 * The job was written minutes (or, after an interruption, hours) ago. Send it only while every
 * entry it covers is still accepted and unmarked under the same acceptance generations;
 * otherwise the email would describe something that is no longer so.
 */
async function stillQualifies(
  deps: ConfirmationDrainDeps,
  job: ConfirmationJob,
  entries: ConfirmationEntry[]
): Promise<boolean> {
  const live = new Set(entries.map(entry => entry.id));
  if (!job.entryIds.every(id => live.has(id))) return false;
  const generations = await deps.loadAcceptanceGenerations(job.entryIds);
  const key = await confirmationIdempotencyKey({ key: job.groupKey }, job.entryIds, generations);
  return sameText(key, job.idempotencyKey);
}
