// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  approveRefundRequest,
  findRequestRefund,
  listAllIntentRefunds,
  requestRefundAttempt,
  type ApprovalRefund,
  type RefundApprovalDeps,
} from './refundApproval';
import { settleApprovedRefund } from './refundRequests';

type RequestStatus = 'pending' | 'approved' | 'refunded' | 'failed';

/**
 * An in-memory refund_requests row plus the Stripe refunds on its intent. The
 * rpc fake mirrors the SQL contract of the migration's RPCs
 * (claim_refund_request_approval, note_refund_request_in_flight,
 * complete_refund_request, fail_refund_request); the SQL itself is covered by
 * supabase/tests/myk9_876_874_refund_request_claims_test.sql (CI only).
 */
function harness(
  opts: {
    fulfilled?: boolean;
    createStatus?: string;
    createThrows?: boolean;
    pageSize?: number;
  } = {}
) {
  const request = {
    id: 'rr-1',
    status: 'pending' as RequestStatus,
    refundId: null as string | null,
    lastFailure: null as string | null,
  };
  const stripeRefunds: ApprovalRefund[] = [];
  const byKey = new Map<string, ApprovalRefund>();
  const created: { key: string; metadata: Record<string, string>; amount: number }[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const alerts: string[] = [];
  const pageRequests: (string | undefined)[] = [];
  let createThrows = opts.createThrows ?? false;
  let createStatus = opts.createStatus ?? 'succeeded';

  const rpc: RefundApprovalDeps['rpc'] = async (fn, args) => {
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
      const outcome = request.status === 'approved' ? 'resume' : 'claimed';
      request.status = 'approved';
      return { data: [{ outcome, ...base }], error: null };
    }
    if (fn === 'note_refund_request_in_flight') {
      if (request.status !== 'approved') return { data: false, error: null };
      request.refundId = args.p_stripe_refund_id as string;
      return { data: true, error: null };
    }
    if (fn === 'complete_refund_request') {
      if (request.status === 'refunded') {
        return { data: request.refundId === args.p_stripe_refund_id, error: null };
      }
      if (
        request.status !== 'approved' ||
        (request.refundId !== null && request.refundId !== args.p_stripe_refund_id)
      ) {
        return { data: false, error: null };
      }
      request.status = 'refunded';
      request.refundId = args.p_stripe_refund_id as string;
      return { data: true, error: null };
    }
    if (fn === 'fail_refund_request') {
      if (
        (request.status !== 'approved' && request.status !== 'refunded') ||
        (request.refundId !== null && request.refundId !== args.p_stripe_refund_id)
      ) {
        return { data: false, error: null };
      }
      request.status = 'failed';
      request.refundId = null;
      request.lastFailure = args.p_reason as string;
      return { data: true, error: null };
    }
    return { data: [], error: null };
  };

  const deps: RefundApprovalDeps = {
    rpc,
    alertAdmin: async title => {
      alerts.push(title);
    },
    // Stripe lists newest first, a page at a time.
    listRefundsPage: async ({ starting_after }) => {
      pageRequests.push(starting_after);
      const newestFirst = [...stripeRefunds].reverse();
      const start = starting_after ? newestFirst.findIndex(r => r.id === starting_after) + 1 : 0;
      const size = opts.pageSize ?? 100;
      return {
        data: newestFirst.slice(start, start + size),
        has_more: start + size < newestFirst.length,
      };
    },
    createRefund: async (params, key) => {
      if (createThrows) throw new Error('card_declined');
      // Stripe idempotency: the same key returns the same refund.
      const prior = byKey.get(key);
      if (prior) return prior;
      const refund = {
        id: `re_${created.length + 1}`,
        amount: params.amount,
        status: createStatus,
        metadata: params.metadata,
      };
      created.push({ key, metadata: params.metadata, amount: params.amount });
      stripeRefunds.push(refund);
      byKey.set(key, refund);
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
    pageRequests,
    setCreateThrows: (v: boolean) => {
      createThrows = v;
    },
    setCreateStatus: (v: string) => {
      createStatus = v;
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
});

/**
 * Codex P1 on #2689: an asynchronous refund that Stripe later fails or
 * cancels must not leave the request `refunded` and out of the queue.
 */
describe('asynchronous refunds stay retryable until Stripe reports success', () => {
  it('a PENDING refund records its id but leaves the request approved, not refunded', async () => {
    const h = harness({ createStatus: 'pending' });
    const result = await approveRefundRequest(h.deps, INPUT);

    expect(result).toEqual({ status: 202, body: { outcome: 'pending', refund_id: 're_1' } });
    expect(h.request).toMatchObject({ status: 'approved', refundId: 're_1' });
    expect(h.rpcCalls.some(c => c.fn === 'complete_refund_request')).toBe(false);
    // Booked by refund.updated once it succeeds, never now.
    expect(h.rpcCalls.some(c => c.fn === 'record_order_refund_cents')).toBe(false);
  });

  it('refund.updated -> succeeded completes the request', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    const refund = { ...h.stripeRefunds[0], status: 'succeeded' };

    await expect(settleApprovedRefund(h.deps, refund)).resolves.toBe('completed');
    expect(h.request).toMatchObject({ status: 'refunded', refundId: 're_1' });
  });

  it('a later failure moves the request back to the queue, and the next approval uses a NEW attempt', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    const dead = Object.assign(h.stripeRefunds[0], {
      status: 'failed',
      failure_reason: 'expired_or_canceled_card',
    });

    await expect(settleApprovedRefund(h.deps, dead)).resolves.toBe('failed');
    expect(h.request).toMatchObject({
      status: 'failed',
      refundId: null,
      lastFailure: 'failed: expired_or_canceled_card',
    });
    expect(h.alerts).toContain('Approved refund failed at Stripe — back in the approval queue');

    h.setCreateStatus('succeeded');
    const retried = await approveRefundRequest(h.deps, INPUT);
    expect(retried).toEqual({ status: 200, body: { outcome: 'refunded', refund_id: 're_2' } });
    expect(h.created.map(c => c.key)).toEqual(['refund-request-rr-1-0', 'refund-request-rr-1-1']);
    expect(h.request).toMatchObject({ status: 'refunded', refundId: 're_2' });
  });

  it('a refund that had succeeded and later failed reopens the request too', async () => {
    const h = harness();
    await approveRefundRequest(h.deps, INPUT);
    expect(h.request.status).toBe('refunded');
    const dead = Object.assign(h.stripeRefunds[0], { status: 'failed' });

    await expect(settleApprovedRefund(h.deps, dead)).resolves.toBe('failed');
    expect(h.request.status).toBe('failed');
    const again = await approveRefundRequest(h.deps, INPUT);
    expect(again.status).toBe(200);
    expect(h.created).toHaveLength(2);
  });

  it('a refund Stripe reports failed at creation reopens the request at once', async () => {
    const h = harness({ createStatus: 'canceled' });
    const result = await approveRefundRequest(h.deps, INPUT);
    expect(result).toEqual({ status: 502, body: { error: 'stripe_refund_canceled' } });
    expect(h.request.status).toBe('failed');
  });

  it('ignores refunds the queue did not issue (entry, show, dashboard)', async () => {
    const h = harness();
    const metadatas: Record<string, string>[] = [{ entry_id: 'e1' }, { show_refund: 's1' }, {}];
    for (const metadata of metadatas) {
      await expect(
        settleApprovedRefund(h.deps, { id: 're_x', amount: 1, status: 'failed', metadata })
      ).resolves.toBe('not_approved_refund');
    }
    expect(h.rpcCalls).toEqual([]);
  });

  it('a failure for an OLD dead attempt never reopens a newer refund', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    await settleApprovedRefund(h.deps, Object.assign(h.stripeRefunds[0], { status: 'failed' }));
    h.setCreateStatus('succeeded');
    await approveRefundRequest(h.deps, INPUT);

    await expect(
      settleApprovedRefund(h.deps, { ...h.stripeRefunds[0], status: 'canceled' })
    ).resolves.toBe('stale');
    expect(h.request).toMatchObject({ status: 'refunded', refundId: 're_2' });
  });
});

/** Codex P2 on #2689: reuse must see every refund on the intent, not the newest 100. */
describe('refund listing is paginated before deciding to create', () => {
  it('reuses a request refund that is on page 2 of 150', async () => {
    const h = harness();
    h.request.status = 'approved';
    h.stripeRefunds.push({
      id: 're_ours',
      amount: 4200,
      status: 'succeeded',
      metadata: { refund_request_id: 'rr-1' },
    });
    for (let i = 0; i < 150; i += 1) {
      h.stripeRefunds.push({
        id: `re_entry_${i}`,
        amount: 100,
        status: 'succeeded',
        metadata: { entry_id: `e${i}` },
      });
    }

    const result = await approveRefundRequest(h.deps, INPUT);

    expect(result.body).toEqual({ outcome: 'refunded', refund_id: 're_ours' });
    expect(h.created).toHaveLength(0);
    expect(h.pageRequests).toEqual([undefined, 're_entry_50']);
  });

  it('counts dead attempts on every page for the idempotency attempt number', async () => {
    const h = harness({ pageSize: 2 });
    for (let i = 0; i < 3; i += 1) {
      h.stripeRefunds.push({
        id: `re_dead_${i}`,
        amount: 4200,
        status: 'failed',
        metadata: { refund_request_id: 'rr-1' },
      });
    }
    h.stripeRefunds.push({ id: 're_x', amount: 1, status: 'succeeded', metadata: {} });

    await approveRefundRequest(h.deps, INPUT);
    expect(h.created.map(c => c.key)).toEqual(['refund-request-rr-1-3']);
  });

  it('listAllIntentRefunds walks starting_after until has_more is false', async () => {
    const pages = [
      { data: [{ id: 'a', amount: 1, status: 'succeeded' }], has_more: true },
      { data: [{ id: 'b', amount: 1, status: 'succeeded' }], has_more: false },
    ];
    const seen: (string | undefined)[] = [];
    const all = await listAllIntentRefunds(async params => {
      seen.push(params.starting_after);
      expect(params).toMatchObject({ payment_intent: 'pi_9', limit: 100 });
      return pages[seen.length - 1];
    }, 'pi_9');
    expect(all.map(r => r.id)).toEqual(['a', 'b']);
    expect(seen).toEqual([undefined, 'a']);
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
