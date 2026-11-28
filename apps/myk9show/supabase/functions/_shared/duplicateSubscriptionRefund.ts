// MYK9-2497: a second premium subscription for a customer who already holds a
// live one joins the refund approval queue as a 'duplicate_subscription'
// request for the duplicate's first invoice. Deno-free; stripe-webhook injects
// the Supabase rpc and alertAdmin, so the colocated vitest drives every branch.
//
// OWNER RULE: refunds are never automatic. This only QUEUES; a site admin
// approves in stripe-approve-refund. Nothing here cancels the duplicate
// either: the alert tells the admin to cancel it in Stripe, or it bills again
// at renewal.
//
// queue_duplicate_subscription_refund is keyed on the duplicate subscription
// (refund_requests_once_per_duplicate_subscription), so both checkout
// completion events, which name the same duplicate under different session
// ids, write one request between them, and a redelivery after the refund
// settled writes none. The alert is keyed on the duplicate and its state and
// sent with skipEmailOnDuplicate, so the admin gets one email per state, not
// one per event. Only an alert raised AFTER the request is confirmed tells the
// admin to cancel; before that, cancelling would lose the refund.

import { dollars, DO_NOT_REFUND_IN_DASHBOARD, queueUnconfirmedAlert } from './refundAlertCopy.ts';
import { QUEUE_WRITE_ATTEMPTS } from './refundRequests.ts';
import type { RefundQueueDeps } from './refundRequests.ts';

const SOURCE = 'stripe-webhook';
const KIND = 'duplicate_subscription';

export interface DuplicateSubscriptionInput {
  /** The newer live subscription: the one to refund and cancel. */
  duplicateSubscriptionId: string;
  /** The oldest live subscription: the one the customer keeps. */
  keptSubscriptionId: string;
  customerId: string;
  /** The checkout session that created the duplicate; null when none was found. */
  sessionId: string | null;
  /** The duplicate's first invoice's payment intent; null when it has none. */
  paymentIntentId: string | null;
  /** What that invoice charged, in cents; null when unknown. */
  amountCents: number | null;
}

/**
 * queued / already_queued: the request exists (a closed one is not
 * re-announced). other_request: another live request holds the session or
 * the payment intent; nothing was inserted. not_queued: no session, payment
 * intent or positive charge, so nothing could be queued; the alert says so.
 */
export type DuplicateSubscriptionOutcome =
  'queued' | 'already_queued' | 'other_request' | 'not_queued';

interface QueueRow {
  outcome: string;
  refund_request_id: string | null;
  request_status: string | null;
  amount_cents: number | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
}

const OUTCOMES: ReadonlySet<string> = new Set(['queued', 'already_queued', 'other_request']);
const CLOSED_STATUSES: ReadonlySet<string> = new Set(['refunded', 'resolved_without_refund']);

/** What an alert reports; each state is its own alert (Codex on #4522). */
export type DuplicateAlertState = 'awaiting_approval' | 'not_queued' | 'other_request';

/**
 * The dedupe key of a duplicate subscription's alert. It carries the state,
 * so a repeat of the same state is suppressed (one email), but a change (for
 * example nothing queued, then queued on the other event) raises a new alert
 * instead of hiding behind the old one.
 */
export function duplicateSubscriptionAlertKey(
  duplicateSubscriptionId: string,
  state: DuplicateAlertState
): string {
  return `duplicate-subscription-${duplicateSubscriptionId}-${state}`;
}

const KEEP = (input: DuplicateSubscriptionInput) =>
  `Keep <code>${input.keptSubscriptionId}</code>: the customer's premium comes from it.`;

/** Safe once the refund obligation is recorded: cancelling cannot lose it. */
const CANCEL_IN_STRIPE = (input: DuplicateSubscriptionInput) =>
  `Cancel subscription <code>${input.duplicateSubscriptionId}</code> in the Stripe dashboard now, or it bills again at renewal. ${KEEP(input)}`;

/**
 * Before the obligation is recorded, cancelling first would lose it: the
 * webhook only finds a duplicate while it is still live (Codex on #4522).
 */
const QUEUE_BEFORE_CANCEL = (input: DuplicateSubscriptionInput) =>
  `Do NOT cancel subscription <code>${input.duplicateSubscriptionId}</code> until any charge on it is queued: the webhook only finds a duplicate while it is still live, so after a cancel nothing queues its refund. Check its first invoice in Stripe. If it was paid, queue that charge with <code>queue_duplicate_subscription_refund</code> (service role: subscription, checkout session, payment intent, amount) so it appears under <strong>Refunds awaiting approval</strong> on /admin/health. Then cancel it, or it bills again at renewal. ${KEEP(input)}`;

function summary(input: DuplicateSubscriptionInput): string {
  return `Customer <code>${input.customerId}</code> holds two live premium subscriptions. The newer one, <code>${input.duplicateSubscriptionId}</code>, is a duplicate and grants nothing.`;
}

async function callQueue(
  deps: RefundQueueDeps,
  args: Record<string, unknown>
): Promise<{ row: QueueRow | null; error: string }> {
  try {
    const result = await deps.rpc('queue_duplicate_subscription_refund', args);
    if (result.error) return { row: null, error: result.error.message };
    const data = Array.isArray(result.data) ? result.data[0] : result.data;
    const row = data && typeof data === 'object' ? (data as QueueRow) : null;
    return row && OUTCOMES.has(row.outcome)
      ? { row, error: '' }
      : { row: null, error: `unexpected answer: ${row?.outcome ?? 'no row returned'}` };
  } catch (err) {
    return { row: null, error: err instanceof Error ? err.message : String(err) };
  }
}

async function raise(
  deps: RefundQueueDeps,
  input: DuplicateSubscriptionInput,
  state: DuplicateAlertState,
  title: string,
  body: string,
  detail: Record<string, unknown>
): Promise<void> {
  await deps.alertAdmin(title, `<p>${summary(input)}</p><p>${body}</p>`, {
    source: SOURCE,
    dedupeKey: duplicateSubscriptionAlertKey(input.duplicateSubscriptionId, state),
    skipEmailOnDuplicate: true,
    detail: {
      kind: KIND,
      alert_state: state,
      duplicate_subscription_id: input.duplicateSubscriptionId,
      kept_subscription_id: input.keptSubscriptionId,
      stripe_customer_id: input.customerId,
      ...detail,
    },
  });
}

export async function queueDuplicateSubscriptionRefund(
  deps: RefundQueueDeps,
  input: DuplicateSubscriptionInput
): Promise<DuplicateSubscriptionOutcome> {
  console.error(
    `CRITICAL: customer ${input.customerId} has duplicate subscription ${input.duplicateSubscriptionId} (keeping ${input.keptSubscriptionId})`
  );
  const amountCents =
    typeof input.amountCents === 'number' &&
    Number.isInteger(input.amountCents) &&
    input.amountCents > 0
      ? input.amountCents
      : null;
  if (!input.sessionId || !input.paymentIntentId || !amountCents) {
    await raise(
      deps,
      input,
      'not_queued',
      'Duplicate subscription: nothing queued to refund',
      `No refund was queued: its first invoice has no charge to refund, or its checkout session or payment intent could not be found (session <code>${input.sessionId ?? 'unknown'}</code>, payment intent <code>${input.paymentIntentId ?? 'unknown'}</code>). ${QUEUE_BEFORE_CANCEL(input)} ${DO_NOT_REFUND_IN_DASHBOARD}`,
      { checkout_session_id: input.sessionId, payment_intent_id: input.paymentIntentId }
    );
    return 'not_queued';
  }

  const args = {
    p_subscription_id: input.duplicateSubscriptionId,
    p_session_id: input.sessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_amount_cents: amountCents,
    p_detail: {
      kept_subscription_id: input.keptSubscriptionId,
      stripe_customer_id: input.customerId,
    },
  };
  let row: QueueRow | null = null;
  let lastError = 'no row returned';
  for (let attempt = 1; attempt <= QUEUE_WRITE_ATTEMPTS && !row; attempt += 1) {
    const result = await callQueue(deps, args);
    if (result.row) row = result.row;
    else {
      lastError = result.error;
      console.error(
        `queue_duplicate_subscription_refund ${attempt}/${QUEUE_WRITE_ATTEMPTS} for ${input.duplicateSubscriptionId} unconfirmed:`,
        lastError
      );
    }
  }

  if (!row) {
    const copy = queueUnconfirmedAlert({
      summaryHtml: `${summary(input)} Do NOT cancel subscription <code>${input.duplicateSubscriptionId}</code> yet: the retry only queues its refund while it is still live. Cancel it once its request shows under <strong>Refunds awaiting approval</strong>, or it bills again at renewal.`,
      kind: KIND,
      sessionId: input.sessionId,
      paymentIntentId: input.paymentIntentId,
      amountCents,
      reason: KIND,
      message: lastError,
    });
    await deps.alertAdmin(copy.title, copy.html, {
      source: SOURCE,
      dedupeKey: `refund-queue-unconfirmed-${KIND}-${input.duplicateSubscriptionId}`,
      skipEmailOnDuplicate: true,
    });
    throw new Error(
      `Duplicate subscription ${input.duplicateSubscriptionId}: refund request could not be confirmed; Stripe will retry`
    );
  }

  const outcome = row.outcome as DuplicateSubscriptionOutcome;
  if (outcome === 'other_request') {
    await raise(
      deps,
      input,
      'other_request',
      'Duplicate subscription: refund not queued, another request holds the payment',
      `${CANCEL_IN_STRIPE(input)} Its first invoice (${dollars(amountCents)} USD, payment intent <code>${input.paymentIntentId}</code>, session <code>${input.sessionId}</code>) already has another open refund request, so no second one was queued. Check <strong>Refunds awaiting approval</strong> on /admin/health. ${DO_NOT_REFUND_IN_DASHBOARD}`,
      { checkout_session_id: input.sessionId, payment_intent_id: input.paymentIntentId }
    );
    return outcome;
  }
  if (row.request_status && CLOSED_STATUSES.has(row.request_status)) {
    console.log(
      `Duplicate subscription ${input.duplicateSubscriptionId}: its request is ${row.request_status}; nothing new`
    );
    return outcome;
  }
  const owed = row.amount_cents ?? amountCents;
  await raise(
    deps,
    input,
    'awaiting_approval',
    'Duplicate subscription: refund awaiting approval',
    `${CANCEL_IN_STRIPE(input)} Its first invoice, ${dollars(owed)} USD on payment intent <code>${row.stripe_payment_intent_id ?? input.paymentIntentId}</code> (session <code>${row.stripe_checkout_session_id ?? input.sessionId}</code>), is queued for a refund. Refunds are never automatic: approve it under <strong>Refunds awaiting approval</strong> on /admin/health. ${DO_NOT_REFUND_IN_DASHBOARD}`,
    {
      refund_request_id: row.refund_request_id,
      amount_cents: owed,
      payment_intent_id: row.stripe_payment_intent_id ?? input.paymentIntentId,
      checkout_session_id: row.stripe_checkout_session_id ?? input.sessionId,
    }
  );
  return outcome;
}
