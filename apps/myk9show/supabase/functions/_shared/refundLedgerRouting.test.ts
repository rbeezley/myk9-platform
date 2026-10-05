// @vitest-environment node
// The one settle path (Codex round 4 on #2689), ledger routing (rounds 5 and 7)
// and Stripe create rejections (round 7), on the same in-memory harness as
// refundApproval.test.ts.
import { describe, expect, it } from 'vitest';
import { approveRefundRequest, type ApprovalRefund } from './refundApproval';
import {
  approvedRefundHasNoOrder,
  routeRefundByCurrentState,
  settleApprovedRefund,
} from './refundSettlement';
import { definitiveStripeRejection } from './refundCreateRejection';
import { resolveRefundRequestWithoutRefund } from './refundResolution';
import { harness } from './refundApprovalTestHarness';

const INPUT = { requestId: 'rr-1', actorAuthUserId: 'admin-uid' };

/** Codex round 4 on #2689: one settle path, Stripe the only truth. */
describe('round 4: settleAttemptFromStripe is the only settle path', () => {
  it('a missed failure webhook: "Check status" settles it, the request reads failed, and Approve again works', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    h.stripeSets('re_1', 'failed', 'expired_or_canceled_card'); // no webhook arrives

    const checked = await approveRefundRequest(h.deps, INPUT);
    expect(checked).toEqual({ status: 502, body: { error: 'stripe_refund_failed' } });
    expect(h.requestState()).toEqual({
      status: 'failed',
      lastFailure: 'failed: expired_or_canceled_card',
    });

    h.setCreateStatus('succeeded');
    expect(await approveRefundRequest(h.deps, INPUT)).toEqual({
      status: 200,
      body: { outcome: 'refunded', refund_id: 're_2' },
    });
    expect(h.attempts.map(a => [a.attemptNo, a.status])).toEqual([
      [1, 'failed'],
      [2, 'succeeded'],
    ]);
  });

  it('a failure before the refund id was attached: "Check status" finds the refund on Stripe and settles it', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    h.attempts[0].refundId = null; // the approval died between create and attach
    h.stripeSets('re_1', 'failed', 'lost_or_stolen_card');

    const checked = await approveRefundRequest(h.deps, INPUT);
    expect(checked).toEqual({ status: 502, body: { error: 'stripe_refund_failed' } });
    expect(h.attempts[0]).toMatchObject({ refundId: 're_1', status: 'failed' });
    expect(h.created).toHaveLength(1);
    expect(h.requestState().status).toBe('failed');
  });

  it('the failure webhook itself attaches and settles an attempt whose id was never recorded', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    h.attempts[0].refundId = null;
    const event = h.stripeSets('re_1', 'failed', 'lost_or_stolen_card');

    await expect(settleApprovedRefund(h.settleDeps, event)).resolves.toMatchObject({
      outcome: 'settled',
    });
    expect(h.attempts[0]).toMatchObject({ refundId: 're_1', status: 'failed' });
  });

  it('Stripe unreachable: "Check status" writes nothing and asks to try again', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    h.stripeSets('re_1', 'failed');
    const before = { ...h.attempts[0] };
    const settlesBefore = h.rpcCalls.filter(c => c.fn === 'settle_refund_attempt').length;
    h.setStripeDown(true);

    expect(await approveRefundRequest(h.deps, INPUT)).toEqual({
      status: 503,
      body: { error: 'stripe_unreachable' },
    });
    expect(h.attempts[0]).toEqual(before);
    expect(h.rpcCalls.filter(c => c.fn === 'settle_refund_attempt')).toHaveLength(settlesBefore);
    expect(h.created).toHaveLength(1);
    expect(h.requestState().status).toBe('awaiting_stripe');
  });

  it('Stripe unreachable: the webhook throws (5xx, Stripe redelivers) and writes nothing', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    const event = h.stripeSets('re_1', 'failed');
    const before = { ...h.attempts[0] };
    h.setStripeDown(true);

    await expect(settleApprovedRefund(h.settleDeps, event)).rejects.toThrow(/stripe_unreachable/);
    expect(h.attempts[0]).toEqual(before);
  });

  it('a stale SUCCESS payload while Stripe is unreachable never marks the attempt succeeded', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    const staleSuccess = { ...h.stripeRefunds[0], status: 'succeeded' };
    h.stripeSets('re_1', 'failed', 'expired_or_canceled_card');
    h.setStripeDown(true);

    await expect(settleApprovedRefund(h.settleDeps, staleSuccess)).rejects.toThrow();
    expect(h.attempts[0].status).toBe('pending');
    expect(h.rpcCalls.some(c => c.fn === 'record_order_refund_cents')).toBe(false);

    // Stripe's redelivery once it is reachable settles the TRUE state.
    h.setStripeDown(false);
    await expect(settleApprovedRefund(h.settleDeps, staleSuccess)).resolves.toMatchObject({
      outcome: 'settled',
    });
    expect(h.requestState()).toEqual({
      status: 'failed',
      lastFailure: 'failed: expired_or_canceled_card',
    });
  });

  it('a create whose settle cannot reach Stripe reports the refund submitted, with its id attached', async () => {
    const h = harness({ createStatus: 'succeeded' });
    const unreachable = {
      ...h.deps,
      retrieveRefund: async () => {
        throw new Error('stripe unreachable');
      },
    };
    expect(await approveRefundRequest(unreachable, INPUT)).toEqual({
      status: 202,
      body: { outcome: 'pending', refund_id: 're_1' },
    });
    expect(h.attempts[0]).toMatchObject({ refundId: 're_1', status: 'pending' });
    expect(h.rpcCalls.some(c => c.fn === 'record_order_refund_cents')).toBe(false);

    expect(await approveRefundRequest(h.deps, INPUT)).toEqual({
      status: 200,
      body: { outcome: 'refunded', refund_id: 're_1' },
    });
    expect(h.created).toHaveLength(1);
  });
});

/** Codex round 5 on #2689: every ledger branch decides from Stripe's current copy. */
describe('round 5: routeRefundByCurrentState', () => {
  function recordingBranches() {
    const calls: {
      branch: 'book' | 'terminal';
      id: string;
      status: string | null;
      amount: number;
    }[] = [];
    return {
      calls,
      branches: {
        book: async (refund: ApprovalRefund) => {
          calls.push({
            branch: 'book',
            id: refund.id,
            status: refund.status,
            amount: refund.amount,
          });
        },
        terminal: async (refund: ApprovalRefund, state: 'failed' | 'canceled') => {
          calls.push({ branch: 'terminal', id: refund.id, status: state, amount: refund.amount });
        },
      },
    };
  }

  it('a stale SUCCESS event whose refund Stripe now reports failed books no success and reverses it', async () => {
    const h = harness({
      createStatus: 'pending',
      kind: 'entry_payment_link',
      reason: 'partial_invalid_entries',
    });
    await approveRefundRequest(h.deps, INPUT);
    const staleSuccess = { ...h.stripeRefunds[0], status: 'succeeded' };
    h.stripeSets('re_1', 'failed', 'expired_or_canceled_card'); // the failure event was missed
    const { calls, branches } = recordingBranches();

    await expect(routeRefundByCurrentState(h.settleDeps, staleSuccess, branches)).resolves.toBe(
      'fail'
    );
    expect(calls).toEqual([{ branch: 'terminal', id: 're_1', status: 'failed', amount: 4200 }]);
    expect(h.attempts[0].status).toBe('failed');
    expect(h.rpcCalls.some(c => c.fn === 'record_order_refund_cents')).toBe(false);
  });

  it('a stale FAILED event whose refund Stripe now reports succeeded books it, with the current copy', async () => {
    const h = harness({
      createStatus: 'pending',
      kind: 'entry_payment_link',
      reason: 'partial_invalid_entries',
    });
    await approveRefundRequest(h.deps, INPUT);
    const staleFailure = { ...h.stripeRefunds[0], status: 'failed' };
    h.stripeSets('re_1', 'succeeded');
    const { calls, branches } = recordingBranches();

    await expect(routeRefundByCurrentState(h.settleDeps, staleFailure, branches)).resolves.toBe(
      'book'
    );
    expect(calls).toEqual([{ branch: 'book', id: 're_1', status: 'succeeded', amount: 4200 }]);
    expect(h.attempts[0].status).toBe('succeeded');
  });

  it('an approved refund whose attempt is gone still decides from a fresh retrieve', async () => {
    const h = harness({ kind: 'entry_payment_link', reason: 'partial_invalid_entries' });
    h.stripeRefunds.push({
      id: 're_orphan',
      amount: 900,
      status: 'failed',
      metadata: {
        type: 'approved_refund_request',
        refund_request_id: 'rr-1',
        refund_attempt_no: '9',
      },
    });
    const { calls, branches } = recordingBranches();
    await routeRefundByCurrentState(
      h.settleDeps,
      { ...h.stripeRefunds[0], status: 'succeeded' },
      branches
    );
    expect(calls).toEqual([{ branch: 'terminal', id: 're_orphan', status: 'failed', amount: 900 }]);
  });

  it('Stripe unreachable: throws before any ledger branch runs', async () => {
    const h = harness({
      createStatus: 'pending',
      kind: 'entry_payment_link',
      reason: 'partial_invalid_entries',
    });
    await approveRefundRequest(h.deps, INPUT);
    const staleSuccess = { ...h.stripeRefunds[0], status: 'succeeded' };
    h.setStripeDown(true);
    const { calls, branches } = recordingBranches();

    await expect(routeRefundByCurrentState(h.settleDeps, staleSuccess, branches)).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('a refund the queue did not issue keeps its own copy and costs no Stripe read', async () => {
    const h = harness();
    const { calls, branches } = recordingBranches();
    const entryRefund = {
      id: 're_entry',
      amount: 500,
      status: 'succeeded',
      metadata: { entry_id: 'e1' },
    };
    await routeRefundByCurrentState(h.settleDeps, entryRefund, branches);
    expect(calls).toEqual([{ branch: 'book', id: 're_entry', status: 'succeeded', amount: 500 }]);
    expect(h.rpcCalls).toEqual([]);
  });

  it('a pending refund touches no ledger branch', async () => {
    const h = harness({
      createStatus: 'pending',
      kind: 'entry_payment_link',
      reason: 'partial_invalid_entries',
    });
    await approveRefundRequest(h.deps, INPUT);
    const { calls, branches } = recordingBranches();
    await expect(
      routeRefundByCurrentState(
        h.settleDeps,
        { ...h.stripeRefunds[0], status: 'succeeded' },
        branches
      )
    ).resolves.toBe('defer');
    expect(calls).toEqual([]);
  });
});

/** Codex round 7 on #2689: requests with no order by design, and definitive create rejections. */
describe('round 7: no-order kinds route by the request row', () => {
  function branchSpy() {
    const calls: string[] = [];
    return {
      calls,
      branches: {
        book: async (refund: ApprovalRefund) => {
          calls.push(`book ${refund.id}`);
        },
        terminal: async (refund: ApprovalRefund, state: 'failed' | 'canceled') => {
          calls.push(`terminal ${refund.id} ${state}`);
        },
      },
    };
  }

  it('abandoned cart: a success settles the attempt, the request reads refunded, no ledger row, no alert', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    const event = h.stripeSets('re_1', 'succeeded');
    const { calls, branches } = branchSpy();

    await expect(routeRefundByCurrentState(h.settleDeps, event, branches)).resolves.toBe(
      'no_order'
    );
    expect(calls).toEqual([]);
    expect(h.attempts[0].status).toBe('succeeded');
    expect(h.requestState().status).toBe('refunded');
    expect(h.rpcCalls.some(c => c.fn === 'record_order_refund_cents')).toBe(false);
    expect(h.alerts).toEqual([]);
  });

  it('abandoned cart: a failure settles the attempt (reopens the request) and runs no reversal', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    const { calls, branches } = branchSpy();
    await expect(
      routeRefundByCurrentState(h.settleDeps, h.stripeSets('re_1', 'failed'), branches)
    ).resolves.toBe('no_order');
    expect(calls).toEqual([]);
    expect(h.requestState().status).toBe('failed');
  });

  it('the kind comes from the request ROW, not the refund metadata', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    // Metadata claiming a kind with an order cannot pull an abandoned cart onto the ledger.
    const lying = {
      ...h.stripeSets('re_1', 'succeeded'),
      metadata: {
        ...h.stripeRefunds[0].metadata,
        kind: 'entry_payment_link',
        reason: 'partial_invalid_entries',
      },
    };
    const { calls, branches } = branchSpy();
    await expect(routeRefundByCurrentState(h.settleDeps, lying, branches)).resolves.toBe(
      'no_order'
    );
    expect(calls).toEqual([]);
  });

  it.each([
    ['entry_payment_link', 'no_link_record', 'no_order', []],
    ['entry_payment_link', 'partial_invalid_entries', 'book', ['book re_1']],
    ['entry_payment_link', 'full_make_whole', 'book', ['book re_1']],
  ])('%s / %s: %s', async (kind, reason, action, expected) => {
    const h = harness({ createStatus: 'pending', kind, reason });
    await approveRefundRequest(h.deps, INPUT);
    const { calls, branches } = branchSpy();
    await expect(
      routeRefundByCurrentState(h.settleDeps, h.stripeSets('re_1', 'succeeded'), branches)
    ).resolves.toBe(action);
    expect(calls).toEqual(expected);
    const booked = h.rpcCalls.some(c => c.fn === 'record_order_refund_cents');
    expect(booked).toBe(action === 'book');
  });

  it('approvedRefundHasNoOrder names exactly the kinds that never insert an order', () => {
    expect(approvedRefundHasNoOrder({ kind: 'abandoned_cart', reason: 'cart_expired' })).toBe(true);
    // MYK9-963: a paid cart checkout that created nothing has no order.
    expect(approvedRefundHasNoOrder({ kind: 'unfulfilled_charge', reason: 'no_cart' })).toBe(true);
    expect(approvedRefundHasNoOrder({ kind: 'entry_payment_link', reason: 'no_link_record' })).toBe(
      true
    );
    expect(
      approvedRefundHasNoOrder({ kind: 'entry_payment_link', reason: 'partial_invalid_entries' })
    ).toBe(false);
  });
});

describe('round 7: Stripe create rejections', () => {
  const definitive = (code: string) =>
    Object.assign(new Error(`Stripe: ${code}`), {
      type: 'StripeInvalidRequestError',
      rawType: 'invalid_request_error',
      statusCode: 400,
      code,
    });

  it('a definitive rejection fails the attempt with the code; then Resolve works', async () => {
    const h = harness();
    h.setCreateError(definitive('charge_already_refunded'));
    expect(await approveRefundRequest(h.deps, INPUT)).toEqual({
      status: 409,
      body: { error: 'charge_already_refunded' },
    });
    expect(h.attempts[0]).toMatchObject({
      status: 'failed',
      failureReason: 'charge_already_refunded',
      refundId: null,
    });
    expect(h.requestState()).toEqual({
      status: 'failed',
      lastFailure: 'failed: charge_already_refunded',
    });
    expect(h.alerts).toEqual([
      'Approved refund refused: Stripe says the charge was ALREADY refunded',
    ]);
    await expect(
      resolveRefundRequestWithoutRefund(h.deps, { ...INPUT, note: 'Refunded at Stripe already' })
    ).resolves.toEqual({ status: 200, body: { outcome: 'resolved' } });
  });

  it('a definitive rejection; then Approve again opens attempt n+1 with a new key', async () => {
    const h = harness();
    h.setCreateError(definitive('amount_too_large'));
    expect(await approveRefundRequest(h.deps, INPUT)).toEqual({
      status: 502,
      body: { error: 'stripe_refund_rejected' },
    });
    expect(h.attempts[0]).toMatchObject({ status: 'failed', failureReason: 'amount_too_large' });

    h.setCreateError(null);
    expect((await approveRefundRequest(h.deps, INPUT)).status).toBe(200);
    expect(h.attempts.map(a => [a.attemptNo, a.status])).toEqual([
      [1, 'failed'],
      [2, 'succeeded'],
    ]);
    expect(h.created.map(c => c.key)).toEqual(['refund-request-rr-1-2']);
  });

  it.each([
    ['a network error', new Error('ECONNRESET')],
    ['a 5xx', { type: 'StripeAPIError', statusCode: 500, code: 'charge_already_refunded' }],
    ['a rate limit', { type: 'StripeRateLimitError', statusCode: 429, code: 'rate_limit' }],
    [
      'an invalid request with an unknown code',
      { type: 'StripeInvalidRequestError', statusCode: 400, code: 'parameter_invalid_integer' },
    ],
    [
      'an idempotency error',
      { type: 'StripeIdempotencyError', statusCode: 400, code: 'idempotency_key_in_use' },
    ],
  ])('%s is ambiguous: the attempt stays pending, unchanged', async (_label, err) => {
    const h = harness();
    h.setCreateError(err);
    expect(await approveRefundRequest(h.deps, INPUT)).toEqual({
      status: 502,
      body: { error: 'stripe_create_unconfirmed' },
    });
    expect(h.attempts[0]).toMatchObject({ status: 'pending', refundId: null, version: 1 });
    expect(h.requestState().status).toBe('awaiting_stripe');
    expect(h.rpcCalls.some(c => c.fn === 'fail_unissued_refund_attempt')).toBe(false);
  });

  it('classifies only a 4xx invalid request with a known permanent code as definitive', () => {
    expect(definitiveStripeRejection(definitive('charge_already_refunded'))).toBe(
      'charge_already_refunded'
    );
    expect(
      definitiveStripeRejection({
        rawType: 'invalid_request_error',
        statusCode: 400,
        code: 'charge_disputed',
      })
    ).toBe('charge_disputed');
    expect(
      definitiveStripeRejection({
        type: 'StripeInvalidRequestError',
        statusCode: 429,
        code: 'charge_disputed',
      })
    ).toBeNull();
    expect(definitiveStripeRejection(null)).toBeNull();
    expect(definitiveStripeRejection('boom')).toBeNull();
  });
});
