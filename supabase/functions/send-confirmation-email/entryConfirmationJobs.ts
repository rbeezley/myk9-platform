// The full confirmation as a durable ticket (MYK9-2088, docs/plan-automatic-email-jobs.md Phase 2).
// Deno-free: index.ts injects the database and Resend; the tests drive it against an in-memory store.
//
// A job is a TICKET for one exhibitor group in one show, identified by the run's own grouping
// inputs (the registration, or the handler of a handler-only group). It freezes no entry set and
// no text. When it is sent, the worker re-runs the run's gather for that one group
// (entryConfirmationSend.ts: confirmed, unmarked, outside the quiet period, still in the group),
// works the address and body out from current data, and RECORDS what it is about to send (the
// entry ids with their acceptance generations, address, body, provider key) on the attempt row
// BEFORE it calls the provider. That record is the only place a body is kept:
//
//   stopped after the claim, before the send   the lease runs out; the next run claims the ticket
//                                              again and gathers the group afresh
//   stopped after the provider accepted        the attempt is still `started`; the next run
//                                              replays EXACTLY its recorded payload under the
//                                              recorded provider key, so Resend returns the first
//                                              message instead of sending another. If the attempt
//                                              was already `sent`, the run reconciles from the
//                                              record without sending
//   provider refused                           the attempt is `failed`; the ticket waits out a
//                                              growing delay (5 min, 15 min, 1 h, 3 h) and the next
//                                              attempt gathers afresh; the fifth refusal ends the
//                                              ticket `failed`, the entries are marked failed and
//                                              the daily run writes a new ticket
//   every entry still in its quiet period      not a failure: the lease is released and the ticket
//                                              is due again when the quiet period ends
//   nothing qualifies (group dissolved, all    the ticket is skipped; an entry that moved to
//   sent, anchor moved)                        another group is that group's ticket's business
//   no usable address                          a failed attempt (`missing_recipient`) and the ticket
//                                              ends `failed`: Delivery history lists it once, and the
//                                              entries wait for the daily run
//
// entries.confirmation_email_sent_at / status / message id are written when the send SUCCEEDS, so
// the historical marker keeps its meaning for every other reader. Every marker write is fenced by
// the acceptance generation the ATTEMPT recorded (mark_entry_confirmation), in one UPDATE, so an
// entry accepted again after the send is never stamped by the earlier acceptance's send, and a
// failure never clears a sent marker.

import {
  confirmationIdempotencyKey,
  sameText,
  generationRecord,
  type ConfirmationShow,
} from './entryConfirmations.ts';
import { gatherGroup, prepareSend } from './entryConfirmationSend.ts';
import type { EntryConfirmationDeps } from './entryConfirmationRun.ts';

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

export { sameText };

/** entry id to acceptance generation (see latestAcceptanceGenerations; 'none' when absent). */
export type Generations = Record<string, string>;

/** A ticket this run holds the lease on. Only the holder of attemptId may record its outcome. */
export interface ConfirmationJob {
  id: string;
  attemptId: string;
  showId: string;
  /** The run's exhibitor-per-show group key (show:registration|handler:id). */
  groupKey: string;
  /** Her registration, or null for a group of one handler's unregistered entries. */
  registrationId: string | null;
  /** The handler of a handler-only group (the grouping input), else null. */
  handlerId: string | null;
  /** When the ticket last became due; only refusals since then count toward the limit. */
  dueAt: string;
}

/** What one send covers and says; recorded on the attempt before the provider is called. */
export interface SentPayload {
  to: string;
  subject: string;
  html: string;
  entryIds: string[];
  /** Each covered entry's acceptance generation at send time. */
  generations: Generations;
  /** The Idempotency-Key the provider is called with (a replay repeats it). */
  providerKey: string;
}

export interface ConfirmationJobAttempt {
  id: string;
  attemptedAt: string;
  emailLogId: string | null;
  resendMessageId: string | null;
  /** 'started' (no provider answer recorded), 'sent' or 'failed'. */
  status: string;
  payload: SentPayload | null;
}

export interface ConfirmationJobStore {
  /**
   * Writes the ticket for one exhibitor group. One READY ticket per group per show is a database
   * guarantee, so a second run racing this one gets `open`, never a second ticket.
   */
  enqueue(args: {
    showId: string;
    groupKey: string;
    registrationId: string | null;
    handlerId: string | null;
    anchorEntryId: string;
    recipientEmail: string;
    recipientName: string | null;
    nowIso: string;
  }): Promise<'created' | 'open'>;
  /** The group keys that already hold a ready ticket in these shows (they wait their turn). */
  loadReadyGroupKeys(showIds: string[]): Promise<Set<string>>;
  /** Due, automatic, entry_confirmation tickets with a free or expired lease, leased until leaseUntilIso. */
  claimDue(limit: number, leaseUntilIso: string): Promise<ConfirmationJob[]>;
  loadAttempts(jobId: string): Promise<ConfirmationJobAttempt[]>;
  /** Records what is about to be sent, as a `started` attempt, before the provider is called. */
  beginAttempt(job: ConfirmationJob, payload: SentPayload): Promise<string>;
  /** Records the outcome of an attempt (a refusal, a provider acceptance, or a superseded replay). */
  resolveAttempt(
    attemptId: string,
    outcome: { status: 'sent' | 'failed'; messageId: string | null; error: string | null }
  ): Promise<void>;
  /** A failed attempt with nothing sent (no usable address), so Delivery history can list the job. */
  recordFailedAttempt(job: ConfirmationJob, error: string): Promise<void>;
  /** Ends the ticket (compare-and-set on the lease: an abandoned attempt changes nothing). */
  finish(
    job: ConfirmationJob,
    outcome: { status: 'sent' | 'failed' | 'skipped'; emailLogId?: string | null; nowIso: string }
  ): Promise<void>;
  /** Frees the lease and keeps the ticket waiting until untilIso (a retry delay). */
  releaseLease(job: ConfirmationJob, untilIso: string): Promise<void>;
  /** Frees the lease and makes the ticket due at dueIso, restarting its refusal count (not a failure). */
  defer(job: ConfirmationJob, dueIso: string): Promise<void>;
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

export interface ConfirmationDrainTotals {
  sent: number;
  reconciled: number;
  retrying: number;
  deferred: number;
  failed: number;
  skipped: number;
  errors: number;
}

export function emptyDrainTotals(): ConfirmationDrainTotals {
  return { sent: 0, reconciled: 0, retrying: 0, deferred: 0, failed: 0, skipped: 0, errors: 0 };
}

type Outcome = 'sent' | 'reconciled' | 'retry' | 'deferred' | 'failed' | 'skipped';

/**
 * Claims and sends due tickets until none is due or the time budget is spent. `activeShows` are
 * the shows that take confirmations right now (published, not over, switch on); a ticket of any
 * other show is skipped, never sent.
 */
export async function drainConfirmationJobs(
  deps: EntryConfirmationDeps,
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
        // The lease is left to run out: the next run claims the ticket again.
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
 * Resend's Idempotency-Key for one send: the key for the covered entries and their acceptance
 * generations plus the address it goes to. The same set and address always repeat the same key,
 * so a replay dedupes; a changed address is a different message and gets its own key rather than
 * a mismatched payload under an old one.
 */
export async function providerKey(baseKey: string, to: string): Promise<string> {
  const data = new TextEncoder().encode(to.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${baseKey}:${hex.slice(0, 12)}`;
}

async function processJob(
  deps: EntryConfirmationDeps,
  activeShows: ReadonlyMap<string, ConfirmationShow>,
  job: ConfirmationJob
): Promise<Outcome> {
  const nowIso = () => deps.now().toISOString();
  const attempts = await deps.jobs.loadAttempts(job.id);

  // A provider-accepted send whose outcome was never recorded on the job: finish it from the
  // attempt's own record, never send again.
  const accepted = attempts.find(attempt => attempt.status === 'sent' && attempt.resendMessageId);
  if (accepted?.resendMessageId) {
    const emailLogId =
      accepted.emailLogId ??
      (await deps.findLogId(accepted.resendMessageId)) ??
      (await deps.log(sentLog(job, accepted.resendMessageId, accepted.payload)));
    if (accepted.payload) {
      await deps.markSent(accepted.payload.generations, accepted.resendMessageId, nowIso());
    }
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
  const lastPayload = [...attempts].reverse().find(attempt => attempt.payload)?.payload ?? null;
  if (failedBefore >= CONFIRMATION_MAX_FAILED_ATTEMPTS) {
    await endFailed(deps, job, 'attempts_exhausted', lastPayload);
    return 'failed';
  }

  // An attempt that began and never reported back: repeat exactly what it recorded.
  const unresolved = [...attempts].reverse().find(attempt => attempt.status === 'started');
  let payload: SentPayload;
  let attemptRow: string;
  if (unresolved?.payload) {
    payload = unresolved.payload;
    attemptRow = await deps.jobs.beginAttempt(job, payload);
    await deps.jobs.resolveAttempt(unresolved.id, {
      status: 'failed',
      messageId: null,
      error: 'no_answer',
    });
  } else {
    const show = activeShows.get(job.showId);
    if (!show) {
      await deps.jobs.finish(job, { status: 'skipped', nowIso: nowIso() });
      return 'skipped';
    }
    // The entries that qualify NOW, by the run's own gather (grouping and quiet period included).
    const group = await gatherGroup(deps, job, show);
    if (group.entries.length === 0) {
      if (group.dueAt) {
        await deps.jobs.defer(job, group.dueAt);
        return 'deferred';
      }
      await deps.jobs.finish(job, { status: 'skipped', nowIso: nowIso() });
      return 'skipped';
    }
    const prepared = await prepareSend(deps, { show, job, entries: group.entries });
    // A failed read is never a guess: the lease runs out and the next run tries again.
    if (prepared === 'unknown') throw new Error('Could not read the confirmation recipient');
    const entryIds = group.entries.map(entry => entry.id);
    const read = await deps.loadAcceptanceGenerations(entryIds);
    const generations = generationRecord(entryIds, read);
    if (prepared === 'no_address') {
      // Nothing to send to: a visible outcome. The failed attempt is what Delivery history lists
      // (once, when the job ends failed); the entries wait for the daily run.
      await deps.jobs.recordFailedAttempt(job, 'missing_recipient');
      await deps.markFailed(entryIds, generations);
      await deps.jobs.finish(job, { status: 'failed', nowIso: nowIso() });
      console.error('Confirmation has no recipient address', { jobId: job.id });
      return 'failed';
    }
    const baseKey = await confirmationIdempotencyKey({ key: job.groupKey }, entryIds, read);
    payload = {
      ...prepared,
      entryIds,
      generations,
      providerKey: await providerKey(baseKey, prepared.to),
    };
    attemptRow = await deps.jobs.beginAttempt(job, payload);
  }

  let result: ConfirmationSendOutcome;
  try {
    result = await deps.send({
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      idempotencyKey: payload.providerKey,
    });
  } catch {
    result = { ok: false, error: 'email_delivery_error', ambiguous: true };
  }

  if (!result.ok) {
    console.error('Confirmation send refused', {
      jobId: job.id,
      error: result.error,
      refusals: failedBefore + 1,
      ambiguous: result.ambiguous === true,
    });
    // No answer came back: the attempt stays `started`, so the retry replays this exact payload.
    if (result.ambiguous !== true) {
      await deps.jobs.resolveAttempt(attemptRow, {
        status: 'failed',
        messageId: null,
        error: result.error,
      });
    }
    if (failedBefore + 1 >= CONFIRMATION_MAX_FAILED_ATTEMPTS) {
      // An unanswered final attempt is recorded as failed so the ticket's history is complete.
      if (result.ambiguous === true) {
        await deps.jobs.resolveAttempt(attemptRow, {
          status: 'failed',
          messageId: null,
          error: result.error,
        });
      }
      await endFailed(deps, job, result.error, payload);
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
  // run finds the message id and finishes the ticket without sending again.
  await deps.jobs.resolveAttempt(attemptRow, {
    status: 'sent',
    messageId: result.messageId,
    error: null,
  });
  const emailLogId = await deps.log(sentLog(job, result.messageId, payload));
  await deps.markSent(payload.generations, result.messageId, nowIso());
  await deps.jobs.finish(job, { status: 'sent', emailLogId, nowIso: nowIso() });
  return 'sent';
}

function sentLog(
  job: ConfirmationJob,
  messageId: string,
  payload: SentPayload | null
): ConfirmationLogEntry {
  return {
    recipient_email: payload?.to ?? null,
    email_type: 'heritage_confirmation',
    related_id: payload?.entryIds[0] ?? job.id,
    show_id: job.showId,
    resend_message_id: messageId,
    status: 'sent',
    error_message: null,
    ...(payload ? { content: { subject: payload.subject, html: payload.html } } : {}),
  };
}

/**
 * The ticket ending `failed` is the Delivery history line (read from the job and its last refused
 * attempt, so a retried-then-sent confirmation never shows a failure); the entries wait for the
 * daily run. The mark is fenced by generation and never clears a sent marker.
 */
async function endFailed(
  deps: EntryConfirmationDeps,
  job: ConfirmationJob,
  error: string,
  payload: SentPayload | null
) {
  if (payload) await deps.markFailed(payload.entryIds, payload.generations);
  await deps.jobs.finish(job, { status: 'failed', nowIso: deps.now().toISOString() });
  console.error('Confirmation could not be sent', { jobId: job.id, error });
}
