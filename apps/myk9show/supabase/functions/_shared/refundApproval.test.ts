// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  approveRefundRequest,
  findRequestRefund,
  requestRefundAttempt,
  type ApprovalRefund,
  type RefundApprovalDeps,
} from './refundApproval';

/**
 * An in-memory refund_requests row plus the Stripe refunds on its intent. The
 * rpc fake mirrors the SQL contract of claim_refund_request_approval /
 * complete_refund_request (the SQL itself is covered by
 * supabase/tests/myk9_876_874_refund_request_claims_test.sql, CI only).
 */
function harness(
  opts: { fulfilled?: boolean; createStatus?: string; createThrows?: boolean } = {}
) {
  const request = {
    id: 'rr-1',
    status: 'pending' as 'pending' | 'approved' | 'refunded',
    refundId: null as string | null,
  };
  const stripeRefunds: ApprovalRefund[] = [];
  const created: { key: string; metadata: Record<string, string>; amount: number }[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const alerts: string[] = [];
  let createThrows = opts.createThrows ?? false;

  const deps: RefundApprovalDeps = {
    rpc: async (fn, args) => {
      rpcCalls.push({ fn, args });
      if (fn === 'claim_refund_request_approval') {
        const base = {
          kind: 'abandoned_cart',
          stripe_payment_intent_id: 'pi_1',
          stripe_checkout_session_id: 'cs_1',
          amount_cents: 4200,
          reason: 'cart_abandoned',
          stripe_refund_id: request.refundId,
        };
        if (request.status === 'refunded') {
          return { data: [{ outcome: 'already_refunded', ...base }], error: null };
        }
        if (opts.fulfilled) return { data: [{ outcome: 'fulfilled', ...base }], error: null };
        const outcome = request.status === 'pending' ? 'claimed' : 'resume';
        request.status = 'approved';
        return { data: [{ outcome, ...base }], error: null };
      }
      if (fn === 'complete_refund_request') {
        if (request.status === 'refunded') {
          return { data: request.refundId === args.p_stripe_refund_id, error: null };
        }
        if (request.status !== 'approved') return { data: false, error: null };
        request.status = 'refunded';
        request.refundId = args.p_stripe_refund_id as string;
        return { data: true, error: null };
      }
      return { data: [], error: null };
    },
    alertAdmin: async title => {
      alerts.push(title);
    },
    listRefunds: async () => [...stripeRefunds],
    createRefund: async (params, key) => {
      if (createThrows) throw new Error('card_declined');
      // Stripe idempotency: the same key returns the same refund.
      const prior = created.findIndex(c => c.key === key);
      if (prior >= 0) return stripeRefunds[prior];
      const refund = {
        id: `re_${created.length + 1}`,
        amount: params.amount,
        status: opts.createStatus ?? 'succeeded',
        metadata: params.metadata,
      };
      created.push({ key, metadata: params.metadata, amount: params.amount });
      stripeRefunds.push(refund);
      return refund;
    },
  };
  return {
    deps,
    request,
    created,
    rpcCalls,
    alerts,
    stripeRefunds,
    setCreateThrows: (v: boolean) => {
      createThrows = v;
    },
  };
}

const INPUT = { requestId: 'rr-1', actorAuthUserId: 'admin-uid' };

describe('approveRefundRequest', () => {
  it('issues the approved refund once, stamped as an approved make-whole refund', async () => {
    const h = harness();
    const result = await approveRefundRequest(h.deps, INPUT);

    expect(result).toEqual({ status: 200, body: { outcome: 'refunded', refund_id: 're_1' } });
    expect(h.created).toEqual([
      {
        key: 'refund-request-rr-1-0',
        amount: 4200,
        metadata: {
          type: 'approved_refund_request',
          refund_request_id: 'rr-1',
          kind: 'abandoned_cart',
          reason: 'cart_abandoned',
          checkout_session_id: 'cs_1',
          myk9_make_whole: 'true',
        },
      },
    ]);
    expect(h.rpcCalls[0]).toEqual({
      fn: 'claim_refund_request_approval',
      args: { p_request_id: 'rr-1', p_actor_auth_user_id: 'admin-uid' },
    });
    expect(h.request).toMatchObject({ status: 'refunded', refundId: 're_1' });
    expect(h.rpcCalls.find(c => c.fn === 'record_order_refund_cents')?.args).toEqual({
      p_payment_intent_id: 'pi_1',
      p_refund_id: 're_1',
      p_amount_cents: 4200,
      p_kind: 'make_whole',
    });
  });

  it('a second approval of a refunded request issues nothing', async () => {
    const h = harness();
    await approveRefundRequest(h.deps, INPUT);
    const again = await approveRefundRequest(h.deps, INPUT);
    expect(again).toEqual({
      status: 200,
      body: { outcome: 'already_refunded', refund_id: 're_1' },
    });
    expect(h.created).toHaveLength(1);
  });

  it('two concurrent approvals produce one Stripe refund', async () => {
    const h = harness();
    await Promise.all([approveRefundRequest(h.deps, INPUT), approveRefundRequest(h.deps, INPUT)]);
    expect(h.stripeRefunds).toHaveLength(1);
    expect(h.alerts).toEqual([]);
  });

  it('resumes a crashed approval by REUSING the refund already stamped with the request', async () => {
    const h = harness();
    h.request.status = 'approved';
    h.stripeRefunds.push({
      id: 're_prior',
      amount: 4200,
      status: 'succeeded',
      metadata: { refund_request_id: 'rr-1' },
    });
    const result = await approveRefundRequest(h.deps, INPUT);
    expect(result.body).toEqual({ outcome: 'refunded', refund_id: 're_prior' });
    expect(h.created).toHaveLength(0);
  });

  it('refuses a session that was fulfilled after all, with no Stripe call (MYK9-874)', async () => {
    const h = harness({ fulfilled: true });
    const result = await approveRefundRequest(h.deps, INPUT);
    expect(result).toEqual({ status: 409, body: { error: 'fulfilled' } });
    expect(h.created).toHaveLength(0);
  });

  it('leaves a pending Stripe refund for refund.updated to book', async () => {
    const h = harness({ createStatus: 'pending' });
    const result = await approveRefundRequest(h.deps, INPUT);
    expect(result.status).toBe(200);
    expect(h.rpcCalls.some(c => c.fn === 'record_order_refund_cents')).toBe(false);
  });

  it('a Stripe failure alerts, keeps the request approved, and a retry takes a fresh key', async () => {
    const h = harness({ createThrows: true });
    const failed = await approveRefundRequest(h.deps, INPUT);
    expect(failed).toEqual({ status: 502, body: { error: 'stripe_refund_failed' } });
    expect(h.alerts).toEqual(['Approved refund FAILED at Stripe']);
    expect(h.request.status).toBe('approved');

    h.setCreateThrows(false);
    const retried = await approveRefundRequest(h.deps, INPUT);
    expect(retried.status).toBe(200);
    expect(h.created[0].key).toBe('refund-request-rr-1-0');
  });

  it('a refund Stripe reports failed is not marked complete', async () => {
    const h = harness({ createStatus: 'failed' });
    const result = await approveRefundRequest(h.deps, INPUT);
    expect(result).toEqual({ status: 502, body: { error: 'stripe_refund_failed' } });
    expect(h.request.status).toBe('approved');
  });
});

describe('refund reuse helpers', () => {
  const refunds: ApprovalRefund[] = [
    { id: 're_dead', amount: 1, status: 'failed', metadata: { refund_request_id: 'rr-1' } },
    { id: 're_other', amount: 1, status: 'succeeded', metadata: { refund_request_id: 'rr-2' } },
    { id: 're_entry', amount: 1, status: 'succeeded', metadata: { entry_id: 'e1' } },
  ];

  it('never reuses a dead refund or another request’s refund', () => {
    expect(findRequestRefund(refunds, 'rr-1')).toBeUndefined();
    expect(findRequestRefund(refunds, 'rr-2')?.id).toBe('re_other');
  });

  it('counts attempts for this request only', () => {
    expect(requestRefundAttempt(refunds, 'rr-1')).toBe(1);
    expect(requestRefundAttempt(refunds, 'rr-3')).toBe(0);
  });
});
