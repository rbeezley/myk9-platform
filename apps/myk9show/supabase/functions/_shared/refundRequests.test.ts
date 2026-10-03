// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  claimAbandonedCartRefund,
  ensurePaymentLinkRefundAlert,
  QUEUE_WRITE_ATTEMPTS,
  REFUNDABLE_ABANDONED_CART_STATUSES,
  settlePaymentLinkObligation,
  type PaymentLinkObligation,
  type RefundQueueDeps,
} from './refundRequests';
import { instructsManualRefund } from './refundAlertCopy';

type Alert = {
  title: string;
  html: string;
  opts: { dedupeKey: string; detail?: Record<string, unknown> };
};

function depsWith(rpcImpl: RefundQueueDeps['rpc']) {
  const alerts: Alert[] = [];
  const rpc = vi.fn(rpcImpl);
  const deps: RefundQueueDeps = {
    rpc,
    alertAdmin: async (title, html, opts) => {
      alerts.push({ title, html, opts });
    },
  };
  return { deps, rpc, alerts };
}

/**
 * An in-memory queue_payment_link_refund: the link latch and the request are
 * applied together, idempotent on the session (Codex round 13 on #2689).
 * `fail: 'lost'` commits the first call but loses its response; `fail:
 * 'always'` never commits.
 */
function linkModel(opts: { fail?: 'lost' | 'always'; requestStatus?: string } = {}) {
  const link = { status: 'open' };
  const orders = new Map<string, Record<string, unknown>>();
  const requests = new Map<
    string,
    { id: string; status: string; amount: number; reason: string; pi: string }
  >();
  let calls = 0;
  const rpc: RefundQueueDeps['rpc'] = async (_fn, args) => {
    calls += 1;
    if (opts.fail === 'always') return { data: null, error: { message: 'db down' } };
    const session = args.p_session_id as string;
    let closed = false;
    if (args.p_link_id && args.p_close_from && link.status === args.p_close_from) {
      link.status = 'paid';
      closed = true;
    }
    let orderCreated = false;
    if (args.p_order && !orders.has(session)) {
      orders.set(session, args.p_order as Record<string, unknown>);
      orderCreated = true;
    }
    let created = false;
    if (args.p_amount_cents != null && !requests.has(session)) {
      requests.set(session, {
        id: `rr-${requests.size + 1}`,
        status: opts.requestStatus ?? 'pending',
        amount: args.p_amount_cents as number,
        reason: args.p_reason as string,
        pi: args.p_payment_intent_id as string,
      });
      created = true;
    }
    const r = requests.get(session);
    const row = {
      link_status: args.p_link_id ? link.status : null,
      link_closed: closed,
      order_created: orderCreated,
      refund_request_id: r?.id ?? null,
      created,
      request_status: r?.status ?? null,
      amount_cents: r?.amount ?? null,
      reason: r?.reason ?? null,
      stripe_payment_intent_id: r?.pi ?? null,
    };
    if (opts.fail === 'lost' && calls === 1)
      return { data: null, error: { message: 'response lost' } };
    return { data: [row], error: null };
  };
  return { link, orders, requests, rpc };
}

const OBLIGATION: PaymentLinkObligation = {
  sessionId: 'cs_1',
  paymentIntentId: 'pi_1',
  linkId: 'link-1',
  closeLinkFrom: 'open',
  owed: {
    amountCents: 900,
    reason: 'partial_invalid_entries',
    detail: { invalid_entry_ids: ['e-1'] },
    summaryHtml: 'Two entries were withdrawn.',
  },
  showId: 'show-1',
};

describe('settlePaymentLinkObligation (Codex round 13)', () => {
  it('closes the link and writes its request in ONE call, then alerts once', async () => {
    const model = linkModel();
    const { deps, rpc, alerts } = depsWith(model.rpc);
    await expect(settlePaymentLinkObligation(deps, OBLIGATION)).resolves.toBe('queued');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('queue_payment_link_refund', {
      p_session_id: 'cs_1',
      p_link_id: 'link-1',
      p_close_from: 'open',
      p_payment_intent_id: 'pi_1',
      p_amount_cents: 900,
      p_reason: 'partial_invalid_entries',
      p_detail: { invalid_entry_ids: ['e-1'] },
      p_show_id: 'show-1',
      p_order: null,
    });
    expect(model.link.status).toBe('paid');
    expect(alerts.map(a => [a.title, a.opts.dedupeKey])).toEqual([
      ['Refund awaiting approval', 'refund-request-rr-1'],
    ]);
  });

  it('a lost response: the retry finds the latch closed and the request there, and ensures its alert', async () => {
    const model = linkModel({ fail: 'lost' });
    const { deps, rpc, alerts } = depsWith(model.rpc);
    await expect(settlePaymentLinkObligation(deps, OBLIGATION)).resolves.toBe('already_queued');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(model.requests.size).toBe(1);
    expect(alerts.map(a => a.opts.dedupeKey)).toEqual(['refund-request-rr-1']);
  });

  it('never confirmed: throws (5xx), nothing committed, the alert has no manual-refund wording', async () => {
    const model = linkModel({ fail: 'always' });
    const { deps, rpc, alerts } = depsWith(model.rpc);
    await expect(settlePaymentLinkObligation(deps, OBLIGATION)).rejects.toThrow(
      /could not be confirmed; Stripe will retry/
    );
    expect(rpc).toHaveBeenCalledTimes(QUEUE_WRITE_ATTEMPTS);
    expect(model.link.status).toBe('open');
    expect(model.requests.size).toBe(0);
    expect(alerts.map(a => a.title)).toEqual([
      'Queueing a refund could not be confirmed — Stripe will retry',
    ]);
    expect(instructsManualRefund(alerts[0].title + ' ' + alerts[0].html)).toBe(false);
  });

  it('nothing owed: the latch alone, no alert', async () => {
    const model = linkModel();
    const { deps, alerts } = depsWith(model.rpc);
    await expect(settlePaymentLinkObligation(deps, { ...OBLIGATION, owed: null })).resolves.toBe(
      'latched_only'
    );
    expect(model.link.status).toBe('paid');
    expect(model.requests.size).toBe(0);
    expect(alerts).toEqual([]);
  });

  it('owed but no intent or amount: alerts, still closes the latch, queues nothing', async () => {
    const model = linkModel();
    const { deps, alerts } = depsWith(model.rpc);
    await expect(
      settlePaymentLinkObligation(deps, { ...OBLIGATION, paymentIntentId: null })
    ).resolves.toBe('not_queued');
    expect(model.link.status).toBe('paid');
    expect(model.requests.size).toBe(0);
    expect(alerts.map(a => a.title)).toEqual([
      'Refund owed but not queued: payment intent or amount missing',
    ]);
    expect(alerts.some(a => instructsManualRefund(a.title + ' ' + a.html))).toBe(false);
  });

  it('a paid session with no link row queues the full charge with no latch', async () => {
    const model = linkModel();
    const { deps, rpc } = depsWith(model.rpc);
    await settlePaymentLinkObligation(deps, {
      ...OBLIGATION,
      linkId: null,
      closeLinkFrom: null,
      owed: { ...OBLIGATION.owed!, reason: 'no_link_record' },
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_link_id: null, p_close_from: null });
    expect(model.link.status).toBe('open');
    expect(model.requests.get('cs_1')?.reason).toBe('no_link_record');
  });
});

describe('the order rides in the same call (Codex round 14)', () => {
  const ORDER = { stripe_checkout_session_id: 'cs_1', amount_cents: 900, status: 'succeeded' };

  it('passes the order with the latch and the request, and records it once', async () => {
    const model = linkModel();
    const { deps, rpc } = depsWith(model.rpc);
    await settlePaymentLinkObligation(deps, { ...OBLIGATION, order: ORDER });
    expect(rpc.mock.calls[0][1]).toMatchObject({
      p_close_from: 'open',
      p_amount_cents: 900,
      p_order: ORDER,
    });
    expect([...model.orders.keys()]).toEqual(['cs_1']);
    expect(model.link.status).toBe('paid');
  });

  it('a lost response: the retry finds the latch, the order and the request already there', async () => {
    const model = linkModel({ fail: 'lost' });
    const { deps, rpc } = depsWith(model.rpc);
    await expect(settlePaymentLinkObligation(deps, { ...OBLIGATION, order: ORDER })).resolves.toBe(
      'already_queued'
    );
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(model.orders.size).toBe(1);
    expect(model.requests.size).toBe(1);
  });

  it('never confirmed: no order, no latch, no request', async () => {
    const model = linkModel({ fail: 'always' });
    const { deps } = depsWith(model.rpc);
    await expect(
      settlePaymentLinkObligation(deps, { ...OBLIGATION, order: ORDER })
    ).rejects.toThrow();
    expect(model.orders.size).toBe(0);
    expect(model.link.status).toBe('open');
    expect(model.requests.size).toBe(0);
  });

  it('nothing owed and no latch to close still records the order', async () => {
    const model = linkModel();
    const { deps } = depsWith(model.rpc);
    await settlePaymentLinkObligation(deps, {
      ...OBLIGATION,
      closeLinkFrom: null,
      owed: null,
      order: ORDER,
    });
    expect(model.orders.size).toBe(1);
  });
});

describe('ensurePaymentLinkRefundAlert (redelivery)', () => {
  it('reads the request a closed latch already has and ensures its alert', async () => {
    const model = linkModel();
    const first = depsWith(model.rpc);
    await settlePaymentLinkObligation(first.deps, OBLIGATION);
    const { deps, rpc, alerts } = depsWith(model.rpc);
    await ensurePaymentLinkRefundAlert(deps, 'cs_1');
    expect(rpc).toHaveBeenCalledWith('queue_payment_link_refund', { p_session_id: 'cs_1' });
    expect(alerts.map(a => a.opts.dedupeKey)).toEqual(['refund-request-rr-1']);
  });

  it('a closed request is not re-announced; no request means no alert', async () => {
    const refunded = linkModel({ requestStatus: 'refunded' });
    await settlePaymentLinkObligation(depsWith(refunded.rpc).deps, OBLIGATION);
    const r = depsWith(refunded.rpc);
    await ensurePaymentLinkRefundAlert(r.deps, 'cs_1');
    expect(r.alerts).toEqual([]);

    const none = depsWith(linkModel().rpc);
    await ensurePaymentLinkRefundAlert(none.deps, 'cs_9');
    expect(none.alerts).toEqual([]);
  });

  it('cannot read: throws (5xx)', async () => {
    const { deps } = depsWith(linkModel({ fail: 'always' }).rpc);
    await expect(ensurePaymentLinkRefundAlert(deps, 'cs_1')).rejects.toThrow();
  });
});

describe('claimAbandonedCartRefund', () => {
  const INPUT = { cartId: 'cart-1', sessionId: 'cs_1', paymentIntentId: 'pi_1', amountCents: 4200 };

  it('alerts once when it claims the cart', async () => {
    const { deps, rpc, alerts } = depsWith(async () => ({
      data: [{ outcome: 'claimed', refund_request_id: 'rr-9' }],
      error: null,
    }));
    await expect(claimAbandonedCartRefund(deps, INPUT)).resolves.toBe('claimed');
    expect(rpc).toHaveBeenCalledWith('claim_abandoned_cart_refund', {
      p_cart_id: 'cart-1',
      p_session_id: 'cs_1',
      p_payment_intent_id: 'pi_1',
      p_amount_cents: 4200,
      p_detail: { cart_id: 'cart-1' },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].opts.detail).toMatchObject({
      refund_request_id: 'rr-9',
      kind: 'abandoned_cart',
    });
  });

  it('already_pending on the FIRST observed response (the claim committed, its response was lost) still alerts (Codex round 11)', async () => {
    const { deps, alerts } = depsWith(async () => ({
      data: [{ outcome: 'already_pending', refund_request_id: 'rr-9', request_status: 'pending' }],
      error: null,
    }));
    await expect(claimAbandonedCartRefund(deps, INPUT)).resolves.toBe('already_pending');
    expect(alerts.map(a => [a.title, a.opts.dedupeKey])).toEqual([
      ['Paid abandoned cart — refund awaiting approval', 'refund-request-rr-9'],
    ]);
  });

  it('already_pending on a request that was since refunded announces nothing', async () => {
    const { deps, alerts } = depsWith(async () => ({
      data: [{ outcome: 'already_pending', refund_request_id: 'rr-9', request_status: 'refunded' }],
      error: null,
    }));
    await expect(claimAbandonedCartRefund(deps, INPUT)).resolves.toBe('already_pending');
    expect(alerts).toEqual([]);
  });

  it.each(['not_refundable'] as const)('is silent on %s', async outcome => {
    const { deps, alerts } = depsWith(async () => ({
      data: [{ outcome, refund_request_id: null }],
      error: null,
    }));
    await expect(claimAbandonedCartRefund(deps, INPUT)).resolves.toBe(outcome);
    expect(alerts).toHaveLength(0);
  });

  it('throws on an rpc error so Stripe redelivers (the cart is unchanged)', async () => {
    const { deps } = depsWith(async () => ({ data: null, error: { message: 'timeout' } }));
    await expect(claimAbandonedCartRefund(deps, INPUT)).rejects.toThrow(/timeout/);
  });

  it('covers abandoned, expired and already-held carts only', () => {
    expect([...REFUNDABLE_ABANDONED_CART_STATUSES].sort()).toEqual([
      'abandoned',
      'expired',
      'refund_pending',
    ]);
  });
});

/**
 * MYK9-874 two-delivery interleaving, against an in-memory model of the two
 * conditional UPDATEs on entry_carts.status (the SQL itself is covered by
 * supabase/tests/myk9_876_874_refund_request_claims_test.sql, CI only).
 */
describe('fulfillment and refund claims on one cart', () => {
  function cartModel(status: string) {
    const cart = { status, session: 'cs_1' };
    const requests = new Map<string, string>();
    const fulfill = () => {
      if (cart.status !== 'active') return false;
      cart.status = 'submitted';
      return true;
    };
    const rpc: RefundQueueDeps['rpc'] = async (_fn, args) => {
      const existing = requests.get(args.p_session_id as string);
      if (existing)
        return {
          data: [
            { outcome: 'already_pending', refund_request_id: existing, request_status: 'pending' },
          ],
          error: null,
        };
      if (!['abandoned', 'expired'].includes(cart.status) || cart.session !== args.p_session_id) {
        return { data: [{ outcome: 'not_refundable', refund_request_id: null }], error: null };
      }
      cart.status = 'refund_pending';
      requests.set(args.p_session_id as string, 'rr-1');
      return {
        data: [{ outcome: 'claimed', refund_request_id: 'rr-1', request_status: 'pending' }],
        error: null,
      };
    };
    return { cart, requests, fulfill, rpc };
  }
  const INPUT = { cartId: 'cart-1', sessionId: 'cs_1', paymentIntentId: 'pi_1', amountCents: 4200 };

  it('two deliveries of a paid session on an abandoned cart queue ONE refund and both return', async () => {
    const model = cartModel('abandoned');
    // alertAdmin's (source, dedupe key) unique index while unresolved.
    const alerts = new Map<string, string>();
    const deps: RefundQueueDeps = {
      rpc: model.rpc,
      alertAdmin: async (title, _html, opts) => {
        if (!alerts.has(opts.dedupeKey)) alerts.set(opts.dedupeKey, title);
      },
    };

    const [first, second] = await Promise.all([
      claimAbandonedCartRefund(deps, INPUT),
      claimAbandonedCartRefund(deps, INPUT),
    ]);

    expect([first, second].sort()).toEqual(['already_pending', 'claimed']);
    expect(model.requests.size).toBe(1);
    // Both deliveries ensure the alert; it is one alert, keyed on the request.
    expect([...alerts.keys()]).toEqual(['refund-request-rr-1']);
    expect(model.fulfill()).toBe(false);
  });

  it('a stale worker that read the cart active loses its fulfillment claim once the refund wins', async () => {
    const model = cartModel('active');
    const deps: RefundQueueDeps = { rpc: model.rpc, alertAdmin: async () => {} };

    // Worker A validated the cart while active; the owner then abandons it and
    // worker B (a second delivery) claims it for refund before A claims.
    model.cart.status = 'abandoned';
    await expect(claimAbandonedCartRefund(deps, INPUT)).resolves.toBe('claimed');
    expect(model.fulfill()).toBe(false);
    // A falls into the lost-claim branch and finds the request: 2xx, no retry.
    await expect(claimAbandonedCartRefund(deps, INPUT)).resolves.toBe('already_pending');
    expect(model.cart.status).toBe('refund_pending');
  });

  it('a cart fulfilled first can never be claimed for refund', async () => {
    const model = cartModel('active');
    const deps: RefundQueueDeps = { rpc: model.rpc, alertAdmin: async () => {} };
    expect(model.fulfill()).toBe(true);
    await expect(claimAbandonedCartRefund(deps, INPUT)).resolves.toBe('not_refundable');
    expect(model.requests.size).toBe(0);
  });
});
