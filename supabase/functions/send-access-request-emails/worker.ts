// One worker run: claim the due access-request email jobs, send each job's
// emails, and record the result on the job. Deno-free so vitest can run it.
//
// Nothing here can touch the request itself: the job was queued in the
// request's own transaction, and a send failure only moves the job back to
// 'pending' (finish_access_request_email_job applies the backoff and the
// five-attempt limit). Each attempt is also written to email_log, the
// existing email-delivery history.

import { HttpError } from '../_shared/http/responses.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import type { ResendRetryDependencies } from '../_shared/resendEmail.ts';
import { idempotencyKey, planDeliveries, remainingDeliveries, type Delivery } from './plan.ts';
import {
  RecordLoadError,
  loadAccessRequest,
  reviewerAudience,
  reviewerRecipients,
  type AccessRequestEvent,
  type AccessRequestKind,
  type Query,
} from './records.ts';

export interface QueueJob {
  id: string;
  request_kind: AccessRequestKind;
  request_id: string;
  event: AccessRequestEvent;
  attempts: number;
  delivered_to: string[] | null;
  claim_token: string | null;
}

interface Result {
  data: unknown;
  error: unknown;
}

export interface QueueClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Result>;
  from(table: string): Query & {
    insert(values: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
}

export interface WorkerDeps {
  resendApiKey: string | null;
  siteUrl: string;
  fromEmail?: string;
  fetchImpl?: typeof fetch;
  /** Passed through to the Resend retry helper (tests stub the sleep). */
  retry?: Omit<ResendRetryDependencies, 'fetchImpl'>;
  batchSize?: number;
}

export interface RunSummary {
  claimed: number;
  sent: number;
  skipped: number;
  retried: number;
  failed: number;
  /** Finished after the claim's lease had passed to another run. */
  lost: number;
}

type Outcome =
  | { outcome: 'sent'; delivered: string[] }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'retry'; delivered: string[]; error: string };

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

export async function runAccessRequestEmailQueue(
  client: QueueClient,
  deps: WorkerDeps
): Promise<RunSummary> {
  // Checked before claiming: a missing key must not spend the jobs' attempts.
  if (!deps.resendApiKey) throw new HttpError(503, 'Email service not configured');

  const { data, error } = await client.rpc('claim_access_request_email_jobs', {
    p_limit: deps.batchSize ?? 25,
  });
  if (error) {
    console.error('send-access-request-emails: claim failed', { code: errorCode(error) });
    throw new HttpError(500, 'Failed to claim access-request email jobs');
  }

  const jobs = (data ?? []) as QueueJob[];
  const summary: RunSummary = {
    claimed: jobs.length,
    sent: 0,
    skipped: 0,
    retried: 0,
    failed: 0,
    lost: 0,
  };
  for (const job of jobs) {
    const result = await processJob(client, deps, job);
    const status = await finish(client, job, result);
    if (status === 'sent') summary.sent++;
    else if (status === 'skipped') summary.skipped++;
    else if (status === 'pending') summary.retried++;
    else if (status === 'failed') summary.failed++;
    else summary.lost++;
  }
  return summary;
}

async function processJob(client: QueueClient, deps: WorkerDeps, job: QueueJob): Promise<Outcome> {
  let deliveries: Delivery[];
  try {
    const record = await loadAccessRequest(client, job.request_kind, job.request_id);
    if (!record) return { outcome: 'skipped', reason: 'The request no longer exists.' };

    const reviewers =
      job.event === 'submitted' && record.status === 'pending'
        ? await reviewerRecipients(client, reviewerAudience(record))
        : [];
    deliveries = planDeliveries(record, job.event, reviewers, deps.siteUrl);
  } catch (err) {
    if (!(err instanceof RecordLoadError)) throw err;
    return { outcome: 'retry', delivered: [], error: 'request_load_failed' };
  }

  if (deliveries.length === 0) {
    return { outcome: 'skipped', reason: 'Nobody to email has an address on file.' };
  }

  const delivered: string[] = [];
  let lastError: string | null = null;
  for (const delivery of remainingDeliveries(deliveries, job.delivered_to ?? [])) {
    const error = await send(client, deps, job, delivery);
    if (error) lastError = error;
    else delivered.push(delivery.to);
  }
  return lastError
    ? { outcome: 'retry', delivered, error: lastError }
    : { outcome: 'sent', delivered };
}

/** Sends one email; returns null on success or a short error code. */
async function send(
  client: QueueClient,
  deps: WorkerDeps,
  job: QueueJob,
  delivery: Delivery
): Promise<string | null> {
  let resendMessageId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const response = await sendResendEmailWithRetry(
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deps.resendApiKey}`,
          'Idempotency-Key': idempotencyKey(job.id, delivery.to),
        },
        body: JSON.stringify({
          from: deps.fromEmail ?? FROM_EMAIL,
          to: delivery.to,
          subject: delivery.message.subject,
          html: delivery.message.html,
        }),
      },
      { ...deps.retry, ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) }
    );
    if (response.ok) {
      const result = (await response.json().catch(() => ({}))) as { id?: string };
      resendMessageId = result.id ?? null;
    } else {
      await response.text().catch(() => '');
      errorMessage = `provider_http_${response.status}`;
    }
  } catch {
    errorMessage = 'email_delivery_error';
  }

  if (errorMessage) {
    console.error('send-access-request-emails: delivery failed', {
      jobId: job.id,
      emailType: delivery.message.emailType,
      error: errorMessage,
    });
  }

  const { error } = await client.from('email_log').insert({
    recipient_email: delivery.to,
    email_type: delivery.message.emailType,
    related_id: job.request_id,
    resend_message_id: resendMessageId,
    status: errorMessage ? 'failed' : 'sent',
    error_message: errorMessage,
    status_updated_at: new Date().toISOString(),
  });
  if (error) {
    // The job itself records the delivery; a history-row failure must not
    // turn a delivered email into a retry that sends it again.
    console.error('send-access-request-emails: failed to record email history', {
      code: errorCode(error),
    });
  }
  return errorMessage;
}

async function finish(client: QueueClient, job: QueueJob, result: Outcome): Promise<string | null> {
  const { data, error } = await client.rpc('finish_access_request_email_job', {
    p_job_id: job.id,
    p_claim_token: job.claim_token,
    p_outcome: result.outcome,
    p_delivered_to: result.outcome === 'skipped' ? [] : result.delivered,
    p_error:
      result.outcome === 'retry'
        ? result.error
        : result.outcome === 'skipped'
          ? result.reason
          : null,
  });
  if (error) {
    // The lease expires and the next run retries; delivered addresses are
    // protected by the provider idempotency key.
    console.error('send-access-request-emails: failed to record the job result', {
      jobId: job.id,
      code: errorCode(error),
    });
    return null;
  }
  return typeof data === 'string' ? data : null;
}

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'unknown';
}
