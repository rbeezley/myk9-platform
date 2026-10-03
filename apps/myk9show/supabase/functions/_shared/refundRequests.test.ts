// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  claimAbandonedCartRefund,
  QUEUE_WRITE_ATTEMPTS,
  queuedRefundFromOrder,
  queueRefundForApproval,
  REFUNDABLE_ABANDONED_CART_STATUSES,
  type QueueDeps,
  type RefundQueueDeps,
} from './refundRequests';
import { instructsManualRefund } from './refundAlertCopy';

type Alert = {
  title: string;
  html: string;
  opts: { dedupeKey: string; detail?: Record<string, unknown> };
};

function depsWith(
  rpcImpl: RefundQueueDeps['rpc'],
  findImpl: QueueDeps['findRefundRequest'] = async () => ({ data: null, error: null })
) {
  const alerts: Alert[] = [];
  const rpc = vi.fn(rpcImpl);
  const findRefundRequest = vi.fn(findImpl);
  const deps: QueueDeps = {
    rpc,
    findRefundRequest,
    alertAdmin: async (title, html, opts) => {
      alerts.push({ title, html, opts });
    },
  };
  return { deps, rpc, alerts, findRefundRequest };
}

const QUEUE_INPUT = {
  kind: 'cart_overflow' as const,
  sessionId: 'cs_1',
  paymentIntentId: 'pi_1',
  amountCents: 2500,
  reason: 'partial_no_service_lines',
  summaryHtml: 'Two lines were denied.',
  cartId: 'cart-1',
  showId: 'show-1',
};

describe('queueRefundForApproval', () => {
  it('queues the refund and raises ONE alert naming the request (never a Stripe call)', async () => {
    const { deps, rpc, alerts } = depsWith(async () => ({
      data: [{ refund_request_id: 'rr-1', created: true }],
      error: null,
    }));

    await expect(queueRefundForApproval(deps, QUEUE_INPUT)).resolves.toBe('queued');

    expect(rpc).toHaveBeenCalledWith('request_refund_approval', {
      p_kind: 'cart_overflow',
      p_session_id: 'cs_1',
      p_payment_intent_id: 'pi_1',
      p_amount_cents: 2500,
      p_reason: 'partial_no_service_lines',
      p_detail: {},
      p_cart_id: 'cart-1',
      p_entry_payment_link_id: null,
      p_show_id: 'show-1',
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe('Refund awaiting approval');
    expect(alerts[0].opts.dedupeKey).toBe('refund-request-rr-1');
    expect(alerts[0].opts.detail).toMatchObject({ refund_request_id: 'rr-1', amount_cents: 2500 });
  });

  it('a redelivery that finds the request still open ensures its alert on the SAME key (Codex round 11)', async () => {
    const { deps, alerts } = depsWith(async () => ({
      data: [{ refund_request_id: 'rr-1', created: false, request_status: 'pending' }],
      error: null,
    }));
    await expect(queueRefundForApproval(deps, QUEUE_INPUT)).resolves.toBe('already_queued');
    // alertAdmin deduplicates on (source, dedupe key) while unresolved, so a
    // first alert that did go out is not repeated, and a lost one is recovered.
    expect(alerts.map(a => [a.title, a.opts.dedupeKey])).toEqual([
      ['Refund awaiting approval', 'refund-request-rr-1'],
    ]);
  });

  it.each(['refunded', 'resolved_without_refund'])(
    'a redelivery that finds the request %s announces nothing',
    async status => {
      const { deps, alerts } = depsWith(async () => ({
        data: [{ refund_request_id: 'rr-1', created: false, request_status: status }],
        error: null,
      }));
      await expect(queueRefundForApproval(deps, QUEUE_INPUT)).resolves.toBe('already_queued');
      expect(alerts).toEqual([]);
    }
  );

  it('committed but the response was lost: the retry finds the request; no failure alert (Codex round 10)', async () => {
    let calls = 0;
    const { deps, rpc, alerts, findRefundRequest } = depsWith(async () => {
      calls += 1;
      return calls === 1
        ? { data: null, error: { message: 'response lost' } }
        : { data: [{ refund_request_id: 'rr-1', created: false }], error: null };
    });
    await expect(queueRefundForApproval(deps, QUEUE_INPUT)).resolves.toBe('already_queued');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(findRefundRequest).not.toHaveBeenCalled();
    // Whether the first attempt's alert went out is unknown: the awaiting-approval
    // alert is raised again, deduplicated per request. Never a failure alert.
    expect(alerts.map(a => [a.title, a.opts.dedupeKey])).toEqual([
      ['Refund awaiting approval', 'refund-request-rr-1'],
    ]);
  });

  it('every attempt unconfirmed but the re-read by (session, kind) finds it: queued, no failure alert', async () => {
    const { deps, rpc, alerts, findRefundRequest } = depsWith(
      async () => ({ data: null, error: { message: 'timeout' } }),
      async () => ({ data: { id: 'rr-1', status: 'pending' }, error: null })
    );
    await expect(queueRefundForApproval(deps, QUEUE_INPUT)).resolves.toBe('already_queued');
    expect(rpc).toHaveBeenCalledTimes(QUEUE_WRITE_ATTEMPTS);
    expect(findRefundRequest).toHaveBeenCalledWith('cs_1', 'cart_overflow');
    expect(alerts.map(a => a.title)).toEqual(['Refund awaiting approval']);
  });

  it('persistently unconfirmed: throws (5xx, Stripe redelivers), alerts WITHOUT any manual-refund instruction', async () => {
    const { deps, rpc, alerts, findRefundRequest } = depsWith(async () => ({
      data: null,
      error: { message: 'connection reset' },
    }));
    await expect(queueRefundForApproval(deps, QUEUE_INPUT)).rejects.toThrow(
      /could not be confirmed as queued; Stripe will retry/
    );
    expect(rpc).toHaveBeenCalledTimes(QUEUE_WRITE_ATTEMPTS);
    // The re-read confirmed no request exists (and nothing else was written).
    expect(findRefundRequest).toHaveBeenCalledTimes(1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe('Queueing a refund could not be confirmed — Stripe will retry');
    expect(alerts[0].html).toMatch(/Do NOT refund it from the Stripe dashboard/);
    expect(alerts[0].html).toMatch(/Refunds awaiting approval/);
    expect(instructsManualRefund(alerts[0].title + ' ' + alerts[0].html)).toBe(false);
  });

  it('a failing re-read is still unconfirmed: throws', async () => {
    const { deps } = depsWith(
      async () => ({ data: null, error: { message: 'timeout' } }),
      async () => ({ data: null, error: { message: 'read failed' } })
    );
    await expect(queueRefundForApproval(deps, QUEUE_INPUT)).rejects.toThrow();
  });

  it('does not call the queue without an intent or a positive amount', async () => {
    const { deps, rpc, alerts } = depsWith(async () => ({ data: null, error: null }));
    await queueRefundForApproval(deps, { ...QUEUE_INPUT, paymentIntentId: null });
    await queueRefundForApproval(deps, { ...QUEUE_INPUT, amountCents: 0 });
    expect(rpc).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(2);
    expect(alerts.some(a => instructsManualRefund(a.title + ' ' + a.html))).toBe(false);
  });
});

/** Codex round 10: a redelivery replays the queue write from the recorded order. */
describe('queuedRefundFromOrder', () => {
  it('rebuilds a cart-overflow refund from the order metadata', () => {
    expect(
      queuedRefundFromOrder({
        sessionId: 'cs_1',
        paymentIntentId: 'pi_1',
        showId: 'show-1',
        metadata: {
          cart_id: 'cart-1',
          overflow_refund: {
            action: 'refund',
            amount_cents: 2500,
            reason: 'partial_no_service_lines',
          },
          denied_cart_item_ids: ['ci-2'],
        },
      })
    ).toMatchObject({
      kind: 'cart_overflow',
      sessionId: 'cs_1',
      paymentIntentId: 'pi_1',
      amountCents: 2500,
      reason: 'partial_no_service_lines',
      cartId: 'cart-1',
      showId: 'show-1',
      detail: { denied_cart_item_ids: ['ci-2'] },
    });
  });

  it('rebuilds a payment-link refund from the order metadata', () => {
    expect(
      queuedRefundFromOrder({
        sessionId: 'cs_2',
        paymentIntentId: 'pi_2',
        showId: null,
        metadata: {
          entry_payment_link_id: 'link-1',
          invalid_entry_refund: {
            action: 'refund',
            amount_cents: 900,
            reason: 'partial_invalid_entries',
          },
          invalid_entry_ids: ['e-1'],
        },
      })
    ).toMatchObject({
      kind: 'entry_payment_link',
      amountCents: 900,
      reason: 'partial_invalid_entries',
      entryPaymentLinkId: 'link-1',
      detail: { invalid_entry_ids: ['e-1'] },
    });
  });

  it.each([
    ['no refund owed', { overflow_refund: { action: 'none', paid_amount_cents: 100 } }],
    ['a manual amount', { overflow_refund: { action: 'needs_manual_amount' } }],
    ['no metadata', null],
  ])('%s: nothing to replay', (_label, metadata) => {
    expect(
      queuedRefundFromOrder({ sessionId: 'cs', paymentIntentId: 'pi', showId: null, metadata })
    ).toBeNull();
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
