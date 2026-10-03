// The ONE way an approved refund attempt's status changes (Codex round 4 on
// #2689). Deno-free; stripe-webhook and stripe-approve-refund inject Supabase
// rpc, alertAdmin and Stripe's refunds API, so the colocated vitest drives it.
//
// RULE: Stripe is the only source of truth for a refund's state, and
// settleAttemptFromStripe is the only code that writes it:
//   1. read the attempt (refund_attempt_state): its version and refund id;
//   2. if no refund id is attached yet, find this attempt's refund on Stripe
//      (every page of the intent's refunds, matched on the request and the
//      attempt number stamped at creation) and attach it
//      (record_refund_attempt, a compare-and-set that writes only the id);
//   3. stripe.refunds.retrieve the refund — its CURRENT state;
//   4. settle_refund_attempt with the version read in step 1, a
//      compare-and-set; on 'conflict' start again from step 1.
// If Stripe cannot be reached, NOTHING is written: the webhook answers 5xx so
// Stripe redelivers, and "Check status" tells the admin to try again. No path
// settles from an event payload or from a create response.

import {
  APPROVED_REFUND_METADATA_TYPE,
  REFUND_ATTEMPT_METADATA_KEY,
  REFUND_REQUEST_METADATA_KEY,
  toAttemptStatus,
  type AttemptStatus,
  type RefundQueueDeps,
  type SettlingRefund,
} from './refundRequests.ts';
import { resolveRefundLedgerAction, type RefundLedgerAction } from './refundLifecycle.ts';

export interface RefundListPage {
  data: SettlingRefund[];
  has_more: boolean;
}

export type RefundPageLoader = (params: {
  payment_intent: string;
  limit: number;
  starting_after?: string;
}) => Promise<RefundListPage>;

export interface SettleDeps extends RefundQueueDeps {
  /** `stripe.refunds.retrieve` — the refund's CURRENT state. */
  retrieveRefund: (refundId: string) => Promise<SettlingRefund>;
  /** One page of `stripe.refunds.list({ payment_intent })`. */
  listRefundsPage: RefundPageLoader;
}

/** Which attempt to settle: request id + attempt number (as stamped on the refund). */
export interface AttemptRef {
  requestId: string;
  attemptNo: number;
}

export type SettleAttemptResult =
  | {
      outcome: 'settled';
      /** True when this call changed the attempt. */
      changed: boolean;
      status: AttemptStatus;
      refund: SettlingRefund;
      requestStatus: string | null;
    }
  /** Stripe has no refund for this attempt: it stays pending (approval resumes it). */
  | { outcome: 'no_refund'; intentRefunds: SettlingRefund[] }
  | { outcome: 'not_found' }
  /** Stripe could not be reached: nothing was written; try again. */
  | { outcome: 'stripe_unreachable' }
  /** The attempt kept changing under us: nothing was written; try again. */
  | { outcome: 'conflict' }
  /** The refund Stripe holds for this attempt is attached to another attempt. */
  | { outcome: 'refund_on_other_attempt'; refundId: string }
  | { outcome: 'error'; message: string };

const SOURCE = 'refund-settlement';
const MAX_ROUNDS = 3;

interface StateRow {
  attempt_id: string;
  attempt_version: number;
  stripe_refund_id: string | null;
  attempt_status: string;
  stripe_payment_intent_id: string;
}

interface SettleRow {
  outcome: string;
  request_id: string | null;
  attempt_status: string | null;
  request_status: string | null;
  live_attempts: number | null;
}

function firstRow<T>(data: unknown): T | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === 'object' ? (row as T) : null;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** The refund already issued for this request's attempt n, if any. */
export function findAttemptRefund<T extends SettlingRefund>(
  refunds: T[],
  requestId: string,
  attemptNo: number,
  recordedRefundId: string | null
): T | undefined {
  return refunds.find(
    r =>
      (recordedRefundId !== null && r.id === recordedRefundId) ||
      (r.metadata?.[REFUND_REQUEST_METADATA_KEY] === requestId &&
        r.metadata?.[REFUND_ATTEMPT_METADATA_KEY] === String(attemptNo))
  );
}

/**
 * Every refund on the intent (Codex P2 on #2689): an attempt's refund must be
 * found even past the first 100.
 */
export async function listAllIntentRefunds(
  listPage: RefundPageLoader,
  paymentIntentId: string,
  pageSize = 100
): Promise<SettlingRefund[]> {
  const all: SettlingRefund[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = await listPage({
      payment_intent: paymentIntentId,
      limit: pageSize,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) return all;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

/**
 * Settle one attempt from Stripe. `createdRefundId` is the id the approval's
 * own create call just returned: attached instead of listing (a list may lag
 * a create), and still re-read from Stripe before anything is settled.
 */
export async function settleAttemptFromStripe(
  deps: SettleDeps,
  ref: AttemptRef,
  opts: { createdRefundId?: string } = {}
): Promise<SettleAttemptResult> {
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const state = await deps.rpc('refund_attempt_state', {
      p_request_id: ref.requestId,
      p_attempt_no: ref.attemptNo,
    });
    if (state.error) return { outcome: 'error', message: state.error.message };
    const attempt = firstRow<StateRow>(state.data);
    if (!attempt) return { outcome: 'not_found' };

    if (!attempt.stripe_refund_id) {
      let refundId = opts.createdRefundId;
      if (!refundId) {
        let intentRefunds: SettlingRefund[];
        try {
          intentRefunds = await listAllIntentRefunds(
            deps.listRefundsPage,
            attempt.stripe_payment_intent_id
          );
        } catch (err) {
          console.error(`Could not list refunds for ${attempt.stripe_payment_intent_id}:`, err);
          return { outcome: 'stripe_unreachable' };
        }
        refundId = findAttemptRefund(intentRefunds, ref.requestId, ref.attemptNo, null)?.id;
        if (!refundId) return { outcome: 'no_refund', intentRefunds };
      }
      const attached = await deps.rpc('record_refund_attempt', {
        p_attempt_id: attempt.attempt_id,
        p_expected_version: attempt.attempt_version,
        p_stripe_refund_id: refundId,
      });
      if (attached.error) return { outcome: 'error', message: attached.error.message };
      const outcome = firstRow<{ outcome: string }>(attached.data)?.outcome;
      if (outcome === 'refund_on_other_attempt') {
        return { outcome: 'refund_on_other_attempt', refundId };
      }
      if (outcome === 'not_found') return { outcome: 'not_found' };
      // recorded / conflict / already_recorded: read the attempt again.
      continue;
    }

    let current: SettlingRefund;
    try {
      current = await deps.retrieveRefund(attempt.stripe_refund_id);
    } catch (err) {
      console.error(`Could not re-read refund ${attempt.stripe_refund_id}; nothing written:`, err);
      return { outcome: 'stripe_unreachable' };
    }
    const status = toAttemptStatus(current.status);
    const settled = await deps.rpc('settle_refund_attempt', {
      p_attempt_id: attempt.attempt_id,
      p_expected_version: attempt.attempt_version,
      p_status: status,
      p_failure_reason: current.failure_reason ?? null,
    });
    if (settled.error) return { outcome: 'error', message: settled.error.message };
    const row = firstRow<SettleRow>(settled.data);
    if (!row || row.outcome === 'not_found') return { outcome: 'not_found' };
    if (row.outcome === 'conflict' || row.outcome === 'no_refund') continue;

    const changed = row.outcome === 'updated';
    const finalStatus = toAttemptStatus(row.attempt_status);
    await afterSettle(deps, {
      row,
      refund: current,
      status: finalStatus,
      changed,
      paymentIntentId: attempt.stripe_payment_intent_id,
    });
    return {
      outcome: 'settled',
      changed,
      status: finalStatus,
      refund: current,
      requestStatus: row.request_status,
    };
  }
  console.error(`Attempt ${ref.attemptNo} of ${ref.requestId} kept changing; nothing written`);
  return { outcome: 'conflict' };
}

/** Alerts and the ledger booking for a settle that landed. */
async function afterSettle(
  deps: SettleDeps,
  s: {
    row: SettleRow;
    refund: SettlingRefund;
    status: AttemptStatus;
    changed: boolean;
    paymentIntentId: string;
  }
): Promise<void> {
  const { row, refund, status } = s;
  if ((row.live_attempts ?? 0) > 1) {
    await deps.alertAdmin(
      'Two refunds are live for one refund request — check for a double refund',
      `<p>Refund request <code>${row.request_id}</code> has ${row.live_attempts} attempts
       that are pending or succeeded at Stripe (latest: refund <code>${refund.id}</code> is
       <code>${status}</code>). The customer may be refunded twice. Check the payment in
       Stripe.</p>`,
      { source: SOURCE, dedupeKey: `refund-request-double-live-${row.request_id}` }
    );
  }
  if (!s.changed) return;

  if (status === 'failed' || status === 'canceled') {
    const reason = `${status}: ${refund.failure_reason ?? 'no reason given'}`;
    const reopened = row.request_status === 'failed';
    await deps.alertAdmin(
      reopened
        ? 'Approved refund failed at Stripe — back in the approval queue'
        : 'An approved refund attempt failed at Stripe',
      `<p>Stripe refund <code>${refund.id}</code> (${dollars(refund.amount)} USD) for request
       <code>${row.request_id}</code> ended <code>${reason}</code>.</p>
       <p>${
         reopened
           ? 'The customer was NOT paid. The request is back under <strong>Refunds awaiting approval</strong> on /admin/health; approving it again issues a new refund.'
           : `The request reads <code>${row.request_status}</code> from its other attempts.`
       }</p>`,
      {
        source: SOURCE,
        dedupeKey: `refund-attempt-failed-${refund.id}`,
        detail: { refund_request_id: row.request_id, stripe_refund_id: refund.id, reason },
      }
    );
    return;
  }

  if (status === 'succeeded') {
    // Book it on the order. The ledger is keyed on the refund id, so this and
    // charge.refunded's sweep are the same upsert.
    const { error } = await deps.rpc('record_order_refund_cents', {
      p_payment_intent_id: s.paymentIntentId,
      p_refund_id: refund.id,
      p_amount_cents: refund.amount,
      p_kind: 'make_whole',
    });
    if (error) {
      await deps.alertAdmin(
        'Approved refund not recorded on the order',
        `<p>Refund <code>${refund.id}</code> (payment intent <code>${s.paymentIntentId}</code>)
         could not be written to <code>stripe_order_refunds</code>:</p>
         <pre>${error.message}</pre>
         <p>The charge.refunded webhook books it again; if the order still reads as
         collected in full, set <code>make_whole_refunded_cents</code> by hand.</p>`,
        { source: SOURCE, dedupeKey: `approved-refund-ledger-${refund.id}` }
      );
    }
  }
}

export type WebhookSettleOutcome = 'not_approved_refund' | 'not_found' | 'no_refund' | 'settled';

/**
 * stripe-webhook's entry (refund.updated, refund.failed, charge.refunded).
 * The event names WHICH attempt to settle (the request and attempt number
 * stamped on the refund); its status is never used.
 *
 * Returns the refund every downstream branch must decide from (Codex round 5
 * on #2689): for an approved queued refund, Stripe's CURRENT copy (the one the
 * settle re-read, or a fresh retrieve when no attempt could be settled); for
 * any other refund, the refund it was given, unchanged.
 *
 * THROWS when nothing could be written or Stripe could not be read (Stripe
 * unreachable, a database error, or contention), so the webhook answers 5xx
 * and Stripe redelivers.
 */
export async function settleApprovedRefund<T extends SettlingRefund>(
  deps: SettleDeps,
  event: T
): Promise<{ outcome: WebhookSettleOutcome; refund: T }> {
  const requestId = event.metadata?.[REFUND_REQUEST_METADATA_KEY];
  const attemptNo = Number(event.metadata?.[REFUND_ATTEMPT_METADATA_KEY]);
  if (
    event.metadata?.type !== APPROVED_REFUND_METADATA_TYPE ||
    !requestId ||
    !Number.isInteger(attemptNo) ||
    attemptNo < 1
  ) {
    return { outcome: 'not_approved_refund', refund: event };
  }
  // deps.retrieveRefund returns the full Stripe object the caller's type
  // describes (stripe.refunds.retrieve), so the cast restores that type.
  const retrieveCurrent = async (): Promise<T> => {
    try {
      return (await deps.retrieveRefund(event.id)) as T;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Approved refund ${event.id}: Stripe unreachable (${message}); retry`);
    }
  };

  const result = await settleAttemptFromStripe(deps, { requestId, attemptNo });
  switch (result.outcome) {
    case 'settled':
      return {
        outcome: 'settled',
        // The attempt's refund is this event's refund in every normal case.
        refund: result.refund.id === event.id ? (result.refund as T) : await retrieveCurrent(),
      };
    case 'not_found':
    case 'no_refund':
      console.log(`Refund ${event.id}: no attempt to settle (${result.outcome}) — ignored`);
      return { outcome: result.outcome, refund: await retrieveCurrent() };
    case 'refund_on_other_attempt':
      await deps.alertAdmin(
        'A Stripe refund is stamped for one attempt but attached to another',
        `<p>Stripe refund <code>${result.refundId}</code> carries request
         <code>${requestId}</code>, attempt ${attemptNo}, but is attached to a different
         attempt. Nothing was written. Check the payment in Stripe.</p>`,
        { source: SOURCE, dedupeKey: `refund-attempt-mismatch-${result.refundId}` }
      );
      return { outcome: 'not_found', refund: await retrieveCurrent() };
    default:
      throw new Error(
        `Approved refund ${event.id} not settled (${result.outcome}${
          result.outcome === 'error' ? `: ${result.message}` : ''
        }); nothing written, retry`
      );
  }
}

export interface RefundLedgerBranches<T extends SettlingRefund> {
  /** Stripe reports the refund succeeded: book it on the order ledger. */
  book: (refund: T) => Promise<void>;
  /** Stripe reports it failed or canceled: reverse / tombstone it. */
  terminal: (refund: T, state: 'failed' | 'canceled') => Promise<void>;
}

/**
 * The ONE router for a refund the webhook sees (refund.updated, refund.failed,
 * and each refund of a charge.refunded). It settles an approved queued
 * refund's attempt, then picks the ledger branch from the refund
 * settleApprovedRefund returned (Stripe's current copy for an approved
 * refund), never from the refund it was handed. A pending refund touches
 * nothing. The chosen branch receives that same refund.
 */
export async function routeRefundByCurrentState<T extends SettlingRefund>(
  deps: SettleDeps,
  given: T,
  branches: RefundLedgerBranches<T>
): Promise<RefundLedgerAction> {
  const { refund } = await settleApprovedRefund(deps, given);
  const action = resolveRefundLedgerAction(refund.status);
  if (action === 'book') {
    await branches.book(refund);
  } else if (action === 'fail' || action === 'cancel') {
    await branches.terminal(refund, action === 'cancel' ? 'canceled' : 'failed');
  } else {
    console.log(
      `Refund ${refund.id} remains ${refund.status ?? 'unknown'} — order ledger unchanged`
    );
  }
  return action;
}
