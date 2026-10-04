// @vitest-environment node
// MYK9-968: a paid payment link whose settlement COMMITS but whose response is
// lost must still end with its waitlist offer resolved.
//
// The webhook throws (5xx) when queue_payment_link_refund cannot be confirmed.
// Stripe redelivers; routePaidSession finds the order (or the refund request)
// and takes the replay-first branch, which never reaches a separate offer
// write. So the offer must resolve INSIDE the committed call. The in-memory
// RPC below mirrors the SQL (behaviour pinned by
// supabase/tests/myk9_968_payment_link_offer_resolves_atomically_test.sql).
import { describe, expect, it } from 'vitest';
import {
  ensurePaymentLinkRefundAlert,
  ensureSessionRefundAlerts,
  settlePaymentLinkObligation,
  type PaymentLinkObligation,
  type RefundQueueDeps,
  type SessionRefundRequest,
} from '../_shared/refundRequests';
import { routePaidSession } from './paidSessionEntry';

type OfferStatus = 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired';

/**
 * One database behind a flaky network. While `network` is 'commit-then-down',
 * the first call commits and its response is lost, and every later call fails
 * without reaching the database. 'up' answers normally.
 */
function paymentLinkDatabase(offers: Record<string, OfferStatus>) {
  const state = {
    network: 'commit-then-down' as 'commit-then-down' | 'up',
    link: 'open',
    orders: new Set<string>(),
    requests: new Map<string, SessionRefundRequest>(),
    offers: new Map(Object.entries(offers)),
  };
  let calls = 0;

  const rpc: RefundQueueDeps['rpc'] = async (fn, args) => {
    expect(fn).toBe('queue_payment_link_refund');
    calls += 1;
    if (state.network === 'commit-then-down' && calls > 1) {
      return { data: null, error: { message: 'connection reset' } };
    }
    const session = args.p_session_id as string;
    // One transaction: latch, order, offers, request.
    let closed = false;
    if (args.p_link_id && args.p_close_from && state.link === args.p_close_from) {
      state.link = 'paid';
      closed = true;
    }
    let orderCreated = false;
    if (args.p_order && !state.orders.has(session)) {
      state.orders.add(session);
      orderCreated = true;
    }
    for (const entryId of (args.p_paid_entry_ids as string[] | null) ?? []) {
      const status = state.offers.get(entryId);
      if (status === 'offered' || status === 'expired') state.offers.set(entryId, 'accepted');
    }
    let created = false;
    if (args.p_amount_cents != null && !state.requests.has(session)) {
      state.requests.set(session, {
        id: 'rr-1',
        kind: 'entry_payment_link',
        status: 'pending',
        amount_cents: args.p_amount_cents as number,
        reason: args.p_reason as string,
        stripe_payment_intent_id: args.p_payment_intent_id as string,
      });
      created = true;
    }
    if (state.network === 'commit-then-down') {
      return { data: null, error: { message: 'response lost' } };
    }
    const request = state.requests.get(session);
    return {
      data: [
        {
          link_status: args.p_link_id ? state.link : null,
          link_closed: closed,
          order_created: orderCreated,
          refund_request_id: request?.id ?? null,
          created,
          request_status: request?.status ?? null,
          amount_cents: request?.amount_cents ?? null,
          reason: request?.reason ?? null,
          stripe_payment_intent_id: request?.stripe_payment_intent_id ?? null,
        },
      ],
      error: null,
    };
  };

  const alerts: string[] = [];
  const deps: RefundQueueDeps = {
    rpc,
    alertAdmin: async (_title, _html, opts) => {
      alerts.push(opts.dedupeKey);
    },
  };
  return { state, deps, alerts };
}

/** The webhook's entry decision on a redelivery (index.ts handleCheckoutCompleted). */
function redeliver(db: ReturnType<typeof paymentLinkDatabase>, sessionId: string) {
  db.state.network = 'up';
  return routePaidSession<SessionRefundRequest>(
    { checkoutType: 'entry_payment_request', mode: 'payment' },
    {
      findRequests: async () => [...db.state.requests.values()],
      orderExists: async () => db.state.orders.has(sessionId),
      refundRequested: requests => ensureSessionRefundAlerts(db.deps, sessionId, requests),
      alreadyFulfilled: () => ensurePaymentLinkRefundAlert(db.deps, sessionId),
      fulfillCart: async () => {
        throw new Error('a payment link never fulfills a cart');
      },
      fulfillPaymentLink: async () => {
        throw new Error('a redelivery must not run first-time fulfillment again');
      },
      subscription: async () => undefined,
      unexpectedPayment: () => undefined,
    }
  );
}

const SETTLEMENT: PaymentLinkObligation = {
  sessionId: 'cs_968',
  paymentIntentId: 'pi_968',
  linkId: 'link-968',
  closeLinkFrom: 'open',
  owed: {
    amountCents: 1000,
    reason: 'partial_invalid_entries',
    detail: { invalid_entry_ids: ['e-invalid'] },
    summaryHtml: 'One entry could not be served.',
  },
  showId: 'show-968',
  order: { stripe_checkout_session_id: 'cs_968', entry_ids: ['e-offered', 'e-expired'] },
  paidEntryIds: ['e-offered', 'e-expired', 'e-declined'],
};

describe('MYK9-968: settlement committed, response lost, then redelivery', () => {
  it('ends with the paid offers resolved and one refund request', async () => {
    const db = paymentLinkDatabase({
      'e-offered': 'offered',
      'e-expired': 'expired',
      'e-declined': 'declined',
      'e-invalid': 'offered',
    });

    // Delivery 1: the call commits, its response is lost, the retries cannot
    // reach the database, and the webhook returns 5xx.
    await expect(settlePaymentLinkObligation(db.deps, SETTLEMENT)).rejects.toThrow(
      /could not be confirmed; Stripe will retry/
    );
    expect(db.state.link).toBe('paid');
    expect(db.state.orders.has('cs_968')).toBe(true);

    // Delivery 2: replay-first, no first-time fulfillment, no offer write.
    await expect(redeliver(db, 'cs_968')).resolves.toBe('refund_requested');

    expect(Object.fromEntries(db.state.offers)).toEqual({
      'e-offered': 'accepted',
      'e-expired': 'accepted',
      'e-declined': 'declined',
      'e-invalid': 'offered',
    });
    expect(db.state.requests.size).toBe(1);
    expect(db.alerts).toContain('refund-request-rr-1');
  });

  it('nothing owed: the order alone sends the redelivery down already_fulfilled, offer resolved', async () => {
    const db = paymentLinkDatabase({ 'e-offered': 'offered' });

    await expect(
      settlePaymentLinkObligation(db.deps, {
        ...SETTLEMENT,
        owed: null,
        paidEntryIds: ['e-offered'],
      })
    ).rejects.toThrow();

    await expect(redeliver(db, 'cs_968')).resolves.toBe('already_fulfilled');
    expect(db.state.offers.get('e-offered')).toBe('accepted');
    expect(db.state.requests.size).toBe(0);
  });

  it('passes the paid entries into the one call, and none when nothing was paid', async () => {
    const db = paymentLinkDatabase({});
    db.state.network = 'up';
    const calls: Record<string, unknown>[] = [];
    const spy: RefundQueueDeps = {
      ...db.deps,
      rpc: (fn, args) => {
        calls.push(args);
        return db.deps.rpc(fn, args);
      },
    };
    await settlePaymentLinkObligation(spy, SETTLEMENT);
    await settlePaymentLinkObligation(spy, {
      ...SETTLEMENT,
      sessionId: 'cs_968_none',
      paidEntryIds: [],
    });
    expect(calls.map(args => args.p_paid_entry_ids)).toEqual([
      ['e-offered', 'e-expired', 'e-declined'],
      null,
    ]);
  });
});
