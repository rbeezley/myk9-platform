// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  claimAbandonedCartRefund,
  queueRefundForApproval,
  REFUNDABLE_ABANDONED_CART_STATUSES,
  type RefundQueueDeps,
} from './refundRequests';

type Alert = { title: string; opts: { dedupeKey: string; detail?: Record<string, unknown> } };

function depsWith(rpcImpl: RefundQueueDeps['rpc']) {
  const alerts: Alert[] = [];
  const rpc = vi.fn(rpcImpl);
  const deps: RefundQueueDeps = {
    rpc,
    alertAdmin: async (title, _html, opts) => {
      alerts.push({ title, opts });
    },
  };
  return { deps, rpc, alerts };
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

  it('is silent on a re-delivery that finds the request already queued', async () => {
    const { deps, alerts } = depsWith(async () => ({
      data: [{ refund_request_id: 'rr-1', created: false }],
      error: null,
    }));
    await expect(queueRefundForApproval(deps, QUEUE_INPUT)).resolves.toBe('already_queued');
    expect(alerts).toHaveLength(0);
  });

  it('asks for a manual refund when the queue write fails, and never throws', async () => {
    const { deps, alerts } = depsWith(async () => ({
      data: null,
      error: { message: 'connection reset' },
    }));
    await expect(queueRefundForApproval(deps, QUEUE_INPUT)).resolves.toBe('not_queued');
    expect(alerts.map(a => a.title)).toEqual([
      'Refund owed but could not be queued — refund by hand',
    ]);
  });

  it('does not call the queue without an intent or a positive amount', async () => {
    const { deps, rpc, alerts } = depsWith(async () => ({ data: null, error: null }));
    await queueRefundForApproval(deps, { ...QUEUE_INPUT, paymentIntentId: null });
    await queueRefundForApproval(deps, { ...QUEUE_INPUT, amountCents: 0 });
    expect(rpc).not.toHaveBeenCalled();
    expect(alerts).toHaveLength(2);
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

  it.each(['already_pending', 'not_refundable'] as const)('is silent on %s', async outcome => {
    const { deps, alerts } = depsWith(async () => ({
      data: [{ outcome, refund_request_id: outcome === 'already_pending' ? 'rr-9' : null }],
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
        return { data: [{ outcome: 'already_pending', refund_request_id: existing }], error: null };
      if (!['abandoned', 'expired'].includes(cart.status) || cart.session !== args.p_session_id) {
        return { data: [{ outcome: 'not_refundable', refund_request_id: null }], error: null };
      }
      cart.status = 'refund_pending';
      requests.set(args.p_session_id as string, 'rr-1');
      return { data: [{ outcome: 'claimed', refund_request_id: 'rr-1' }], error: null };
    };
    return { cart, requests, fulfill, rpc };
  }
  const INPUT = { cartId: 'cart-1', sessionId: 'cs_1', paymentIntentId: 'pi_1', amountCents: 4200 };

  it('two deliveries of a paid session on an abandoned cart queue ONE refund and both return', async () => {
    const model = cartModel('abandoned');
    const alerts: string[] = [];
    const deps: RefundQueueDeps = {
      rpc: model.rpc,
      alertAdmin: async title => {
        alerts.push(title);
      },
    };

    const [first, second] = await Promise.all([
      claimAbandonedCartRefund(deps, INPUT),
      claimAbandonedCartRefund(deps, INPUT),
    ]);

    expect([first, second].sort()).toEqual(['already_pending', 'claimed']);
    expect(model.requests.size).toBe(1);
    expect(alerts).toHaveLength(1);
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
