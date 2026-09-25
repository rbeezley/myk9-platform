/**
 * The class-level "Results Posted" push (MYK9-737), minus the IO.
 *
 * The classes trigger (trg_notify_class_results_push) queues ONE pending row
 * per class in private.class_results_push when the class is done and its
 * qualification results are visible, and posts the class here; the
 * class-results-push-retry cron re-posts a row that is still pending five
 * minutes later. pg_net never tells the database whether a post landed, so
 * this function owns the outcome:
 *
 *   1. begin_class_results_push leases the pending row (or reports the class
 *      held, or returns nothing: already sent/failed, or another invocation
 *      holds the lease). Nothing is sent without a lease.
 *   2. Send to every recipient not already in delivered_to.
 *   3. finish_class_results_push records 'sent' only AFTER every send
 *      succeeded; any failure records 'error' with last_error and leaves the
 *      row pending for the retry, remembering who was reached.
 *
 * At-least-once: a crash between a send and step 3 leaves the row pending and
 * the retry sends again. Marking sent first would be at-most-once, which is
 * the lost push this replaces.
 */

export interface ResultsPushTarget {
  classId: string;
  className: string | null;
}

interface AuthLink {
  auth_user_id?: string | null;
}

export interface ScoredEntryAudienceRow {
  dog?: {
    call_name?: string | null;
    owner?: AuthLink | null;
    co_owner?: AuthLink | null;
  } | null;
  handler?: AuthLink | null;
}

export interface ResultsPushPayload {
  type: 'results_posted';
  title: string;
  body: string;
  priority: 'normal';
}

/** What begin_class_results_push returned. */
export type ResultsPushLease =
  | { outcome: 'leased'; claimToken: string; deliveredTo: string[] }
  | { outcome: 'held' }
  | { outcome: 'none' };

/**
 * What one send-push-notification call achieved for one user:
 *   delivered        at least one of their subscriptions accepted the push
 *   no_subscriptions they have none, so there is nothing to deliver
 *   gone             every subscription failed permanently (404/410: the
 *                    function deletes those), so nothing more can be delivered
 *   failed           anything else: the invoke failed, the body is unreadable,
 *                    or a subscription failed for a reason that may pass; the
 *                    retry reaches them
 * The first three are done for that user; only `failed` keeps the class pending.
 */
export type PushSendOutcome =
  | { kind: 'delivered' }
  | { kind: 'no_subscriptions' }
  | { kind: 'gone'; detail: string }
  | { kind: 'failed'; detail: string };

/**
 * Reads send-push-notification's 200 body. It answers
 * `{ sent: 0, message: 'No subscriptions found' }` or
 * `{ sent, errors?: string[], expired?: number }`, where `errors` has one
 * `"<endpoint>: <message>"` per failed subscription and `expired` counts the
 * ones that failed with 404/410. A 200 is NOT success on its own: every
 * subscription can fail inside it.
 */
export function classifyPushResponse(
  data: unknown,
  invokeError: { message: string } | null
): PushSendOutcome {
  if (invokeError) return { kind: 'failed', detail: invokeError.message };
  const body = data as { sent?: unknown; errors?: unknown; expired?: unknown } | null;
  if (!body || typeof body !== 'object' || typeof body.sent !== 'number') {
    return { kind: 'failed', detail: 'unreadable send-push-notification response' };
  }
  if (body.sent > 0) return { kind: 'delivered' };
  const errors = Array.isArray(body.errors) ? body.errors.length : 0;
  if (errors === 0) return { kind: 'no_subscriptions' };
  // An older deployment without `expired` reads as transient; it has already
  // deleted the dead subscriptions, so the retry then finds none and is done.
  if (typeof body.expired === 'number' && body.expired >= errors) {
    return { kind: 'gone', detail: `all ${errors} subscriptions expired` };
  }
  return { kind: 'failed', detail: `${errors} subscription sends failed` };
}

export interface ResultsPushDeps {
  begin(classId: string): Promise<ResultsPushLease>;
  readScoredEntries(classId: string): Promise<ScoredEntryAudienceRow[]>;
  sendPush(userId: string, payload: ResultsPushPayload): Promise<PushSendOutcome>;
  finish(
    classId: string,
    claimToken: string,
    outcome: 'sent' | 'error',
    deliveredTo: string[],
    error: string | null
  ): Promise<void>;
}

export type ResultsPushResult =
  | { status: 'not_pending' }
  | { status: 'results_held' }
  | { status: 'no_users_to_notify' }
  | { status: 'push_sent'; recipients: number }
  | { status: 'push_failed'; failed: number; recipients: number; error: string };

/** The class the trigger announced, or null for anything else. */
export function parseResultsPushPayload(payload: unknown): ResultsPushTarget | null {
  const body = payload as { table?: unknown; record?: { id?: unknown; name?: unknown } } | null;
  if (body?.table !== 'classes') return null;
  const id = body.record?.id;
  if (typeof id !== 'string' || id === '') return null;
  const name = body.record?.name;
  return { classId: id, className: typeof name === 'string' && name !== '' ? name : null };
}

/** Normalizes the begin_class_results_push RPC rows. Anything unexpected sends nothing. */
export function parseLease(rows: unknown): ResultsPushLease {
  if (!Array.isArray(rows) || rows.length !== 1) return { outcome: 'none' };
  const row = rows[0] as {
    outcome?: unknown;
    claim_token?: unknown;
    delivered_to?: unknown;
  } | null;
  if (row?.outcome === 'held') return { outcome: 'held' };
  if (row?.outcome !== 'leased' || typeof row.claim_token !== 'string' || row.claim_token === '') {
    return { outcome: 'none' };
  }
  const delivered = Array.isArray(row.delivered_to)
    ? row.delivered_to.filter((id): id is string => typeof id === 'string')
    : [];
  return { outcome: 'leased', claimToken: row.claim_token, deliveredTo: delivered };
}

/** Auth user id → that person's scored dogs in the class, in entry order, once each. */
export function groupResultsRecipients(
  entries: readonly ScoredEntryAudienceRow[]
): Map<string, string[]> {
  const recipients = new Map<string, string[]>();
  for (const entry of entries) {
    const dogName = entry.dog?.call_name || 'Your dog';
    const audience = [
      entry.dog?.owner?.auth_user_id,
      entry.dog?.co_owner?.auth_user_id,
      entry.handler?.auth_user_id,
    ];
    for (const authUserId of new Set(audience)) {
      if (!authUserId) continue;
      const dogs = recipients.get(authUserId) ?? [];
      if (!dogs.includes(dogName)) dogs.push(dogName);
      recipients.set(authUserId, dogs);
    }
  }
  return recipients;
}

export function buildResultsPushPayload(
  dogNames: readonly string[],
  className: string | null
): ResultsPushPayload {
  return {
    type: 'results_posted',
    title: 'Results Posted',
    body: `${dogNames.join(', ')} — ${className ?? 'a class'}`,
    priority: 'normal',
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * One attempt for one class. Throws only when recording the outcome itself
 * fails; the lease then lapses and the retry takes the row again.
 */
export async function runResultsPush(
  deps: ResultsPushDeps,
  target: ResultsPushTarget
): Promise<ResultsPushResult> {
  const lease = await deps.begin(target.classId);
  if (lease.outcome === 'none') return { status: 'not_pending' };
  if (lease.outcome === 'held') return { status: 'results_held' };

  const alreadyDelivered = new Set(lease.deliveredTo);
  let recipients: [string, string[]][];
  try {
    const entries = await deps.readScoredEntries(target.classId);
    recipients = [...groupResultsRecipients(entries)].filter(
      ([userId]) => !alreadyDelivered.has(userId)
    );
  } catch (err) {
    const error = `audience resolution failed: ${errorMessage(err)}`;
    await deps.finish(target.classId, lease.claimToken, 'error', [], error);
    return { status: 'push_failed', failed: 0, recipients: 0, error };
  }

  // Nothing (left) to send is success: every recipient has been reached.
  if (recipients.length === 0) {
    await deps.finish(target.classId, lease.claimToken, 'sent', [], null);
    return alreadyDelivered.size > 0
      ? { status: 'push_sent', recipients: 0 }
      : { status: 'no_users_to_notify' };
  }

  const results = await Promise.allSettled(
    recipients.map(([userId, dogNames]) =>
      deps.sendPush(userId, buildResultsPushPayload(dogNames, target.className))
    )
  );
  const outcomes: PushSendOutcome[] = results.map(result =>
    result.status === 'fulfilled'
      ? result.value
      : { kind: 'failed', detail: errorMessage(result.reason) }
  );
  // Done for a user = nothing more can be delivered to them. Only these go in
  // delivered_to, so a retry skips them and reaches everyone else.
  const done = recipients
    .filter((_, i) => outcomes[i]?.kind !== 'failed')
    .map(([userId]) => userId);
  const failed = outcomes.filter(outcome => outcome.kind === 'failed').length;
  const gone = outcomes.filter(outcome => outcome.kind === 'gone').length;
  const goneNote =
    gone > 0
      ? `${gone} ${gone === 1 ? 'recipient has' : 'recipients have'} only expired subscriptions`
      : null;

  if (failed === 0) {
    await deps.finish(target.classId, lease.claimToken, 'sent', done, goneNote);
    return { status: 'push_sent', recipients: done.length };
  }

  const error = [`${failed}/${recipients.length} recipients failed`, goneNote]
    .filter(Boolean)
    .join('; ');
  await deps.finish(target.classId, lease.claimToken, 'error', done, error);
  return { status: 'push_failed', failed, recipients: recipients.length, error };
}
