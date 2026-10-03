// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  approveRefundRequest,
  findAttemptRefund,
  findLiveRefundOnOtherAttempt,
  listAllIntentRefunds,
  type ApprovalRefund,
} from './refundApproval';
import { toAttemptStatus } from './refundRequests';
import { settleApprovedRefund } from './refundSettlement';
import { harness } from './refundApprovalTestHarness';

const INPUT = { requestId: 'rr-1', actorAuthUserId: 'admin-uid' };

describe('approveRefundRequest', () => {
  it('opens attempt 1 and issues ONE refund stamped with the request and the attempt', async () => {
    const h = harness();
    const result = await approveRefundRequest(h.deps, INPUT);

    expect(result).toEqual({ status: 200, body: { outcome: 'refunded', refund_id: 're_1' } });
    expect(h.created).toEqual([
      {
        key: 'refund-request-rr-1-1',
        amount: 4200,
        metadata: {
          type: 'approved_refund_request',
          refund_request_id: 'rr-1',
          refund_attempt_no: '1',
          kind: 'abandoned_cart',
          reason: 'cart_abandoned',
          checkout_session_id: 'cs_1',
          myk9_make_whole: 'true',
        },
      },
    ]);
    expect(h.rpcCalls[0]).toEqual({
      fn: 'begin_refund_attempt',
      args: { p_request_id: 'rr-1', p_actor_auth_user_id: 'admin-uid' },
    });
    // The create response only supplies the id; the status is re-read from Stripe.
    expect(h.rpcCalls.find(c => c.fn === 'record_refund_attempt')?.args).toEqual({
      p_attempt_id: 'att-1',
      p_expected_version: 1,
      p_stripe_refund_id: 're_1',
    });
    expect(h.rpcCalls.find(c => c.fn === 'settle_refund_attempt')?.args).toEqual({
      p_attempt_id: 'att-1',
      p_expected_version: 2,
      p_status: 'succeeded',
      p_failure_reason: null,
    });
    expect(h.requestState().status).toBe('refunded');
    // An abandoned cart never had an order: no ledger row (Codex round 7).
    expect(h.rpcCalls.some(c => c.fn === 'record_order_refund_cents')).toBe(false);
    expect(h.alerts).toEqual([]);
  });

  it('a cart-overflow refund that succeeds is booked on its order as make-whole', async () => {
    const h = harness({ kind: 'cart_overflow', reason: 'partial_no_service_lines' });
    await approveRefundRequest(h.deps, INPUT);
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
    expect(h.attempts).toHaveLength(1);
  });

  it('two concurrent approvals produce one attempt and one Stripe refund', async () => {
    const h = harness();
    await Promise.all([approveRefundRequest(h.deps, INPUT), approveRefundRequest(h.deps, INPUT)]);
    expect(h.attempts).toHaveLength(1);
    expect(h.stripeRefunds).toHaveLength(1);
    expect(h.alerts).toEqual([]);
  });

  it('refuses a session that was fulfilled after all, with no Stripe call (MYK9-874)', async () => {
    const h = harness({ fulfilled: true });
    const result = await approveRefundRequest(h.deps, INPUT);
    expect(result).toEqual({ status: 409, body: { error: 'fulfilled' } });
    expect(h.created).toHaveLength(0);
  });

  it('a Stripe error keeps the attempt open and the retry reuses its idempotency key', async () => {
    const h = harness({ createThrows: true });
    expect(await approveRefundRequest(h.deps, INPUT)).toEqual({
      status: 502,
      body: { error: 'stripe_create_unconfirmed' },
    });
    expect(h.requestState().status).toBe('awaiting_stripe');

    h.setCreateThrows(false);
    expect((await approveRefundRequest(h.deps, INPUT)).status).toBe(200);
    expect(h.created.map(c => c.key)).toEqual(['refund-request-rr-1-1']);
    expect(h.attempts).toHaveLength(1);
  });

  it('a pending refund leaves the request awaiting Stripe, not refunded', async () => {
    const h = harness({ createStatus: 'pending' });
    expect(await approveRefundRequest(h.deps, INPUT)).toEqual({
      status: 202,
      body: { outcome: 'pending', refund_id: 're_1' },
    });
    expect(h.requestState().status).toBe('awaiting_stripe');
    expect(h.rpcCalls.some(c => c.fn === 'record_order_refund_cents')).toBe(false);
  });

  it('"Check status" on an open attempt settles its refund from Stripe without creating another', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    h.stripeSets('re_1', 'succeeded');
    const resumed = await approveRefundRequest(h.deps, INPUT);
    expect(resumed).toEqual({ status: 200, body: { outcome: 'refunded', refund_id: 're_1' } });
    expect(h.created).toHaveLength(1);
    expect(h.requestState().status).toBe('refunded');
  });

  it('stops when another attempt for the request still has a live refund at Stripe', async () => {
    const h = harness();
    h.stripeRefunds.push({
      id: 're_stray',
      amount: 4200,
      status: 'pending',
      metadata: { refund_request_id: 'rr-1', refund_attempt_no: '7' },
    });
    const result = await approveRefundRequest(h.deps, INPUT);
    expect(result).toEqual({ status: 409, body: { error: 'refund_exists_for_other_attempt' } });
    expect(h.created).toHaveLength(0);
    expect(h.alerts).toEqual([
      'Refund approval stopped: another refund for this request is still live',
    ]);
  });
});

/** The webhook half: settleApprovedRefund updates only the attempt that owns the refund. */
describe('settleApprovedRefund (webhook)', () => {
  it('ignores refunds the queue did not issue (entry, show, dashboard)', async () => {
    const h = harness();
    const metadatas: Record<string, string>[] = [
      { entry_id: 'e1' },
      { show_refund: 's1' },
      {},
      { refund_request_id: 'rr-1' },
    ];
    for (const metadata of metadatas) {
      await expect(
        settleApprovedRefund(h.settleDeps, { id: 're_x', amount: 1, status: 'failed', metadata })
      ).resolves.toMatchObject({ outcome: 'not_approved_refund' });
    }
    expect(h.rpcCalls).toEqual([]);
  });

  it('writes the CURRENT Stripe state, not the event copy', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    const staleEvent = { ...h.stripeRefunds[0], status: 'pending' };
    h.stripeSets('re_1', 'succeeded');
    await expect(settleApprovedRefund(h.settleDeps, staleEvent)).resolves.toMatchObject({
      outcome: 'settled',
    });
    expect(h.attempts[0].status).toBe('succeeded');
    expect(h.requestState().status).toBe('refunded');
  });

  it('a refund naming an attempt that does not exist is ignored', async () => {
    const h = harness();
    h.stripeRefunds.push({
      id: 're_early',
      amount: 1,
      status: 'succeeded',
      metadata: {
        type: 'approved_refund_request',
        refund_request_id: 'rr-1',
        refund_attempt_no: '5',
      },
    });
    await expect(settleApprovedRefund(h.settleDeps, h.stripeRefunds[0])).resolves.toMatchObject({
      outcome: 'not_found',
    });
    expect(h.alerts).toEqual([]);
    expect(h.rpcCalls.map(c => c.fn)).toEqual(['refund_attempt_state']);
  });

  it('a failure reopens the request with its reason and alerts', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    const event = h.stripeSets('re_1', 'failed', 'expired_or_canceled_card');
    await settleApprovedRefund(h.settleDeps, event);
    expect(h.requestState()).toEqual({
      status: 'failed',
      lastFailure: 'failed: expired_or_canceled_card',
    });
    expect(h.alerts).toContain('Approved refund failed at Stripe — back in the approval queue');
  });
});

/** Codex rounds 1-2 on #2689, as event orderings. */
describe('attempt orderings', () => {
  it('retry after failure opens attempt 2 with a NEW idempotency key', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'failed'));
    h.setCreateStatus('succeeded');
    const retried = await approveRefundRequest(h.deps, INPUT);
    expect(retried).toEqual({ status: 200, body: { outcome: 'refunded', refund_id: 're_2' } });
    expect(h.created.map(c => c.key)).toEqual(['refund-request-rr-1-1', 'refund-request-rr-1-2']);
    expect(h.created[1].metadata.refund_attempt_no).toBe('2');
  });

  it('Codex P1: a delayed success for the OLD refund changes attempt 1 only; attempt 2 keeps its own state', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    const oldSuccessEvent = { ...h.stripeRefunds[0], status: 'succeeded' };
    await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'failed'));
    await approveRefundRequest(h.deps, INPUT); // attempt 2, re_2 pending

    // Stripe's current state for re_1 is failed, so the stale success event
    // re-reads it and leaves attempt 1 failed.
    await expect(settleApprovedRefund(h.settleDeps, oldSuccessEvent)).resolves.toMatchObject({
      outcome: 'settled',
    });
    expect(h.attempts.map(a => [a.attemptNo, a.status, a.refundId])).toEqual([
      [1, 'failed', 're_1'],
      [2, 'pending', 're_2'],
    ]);

    // Attempt 2's failure reopens the request — it is attempt 2's to reopen.
    await settleApprovedRefund(h.settleDeps, h.stripeSets('re_2', 'failed', 'lost_or_stolen_card'));
    expect(h.requestState()).toEqual({
      status: 'failed',
      lastFailure: 'failed: lost_or_stolen_card',
    });
  });

  it('Codex P1 variant: if the old refund REALLY succeeded later, the request is refunded and a double refund is flagged', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'failed'));
    await approveRefundRequest(h.deps, INPUT);
    await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'succeeded'));
    expect(h.attempts[1]).toMatchObject({ status: 'pending', refundId: 're_2' });
    expect(h.requestState().status).toBe('refunded');
    expect(h.alerts).toContain(
      'Two refunds are live for one refund request — check for a double refund'
    );
  });

  it('Codex P2: a delayed in-flight note from approval 1 never overwrites attempt 2', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'failed'));
    await approveRefundRequest(h.deps, INPUT);

    // Approval 1's record_refund_attempt call lands late, carrying the version
    // its begin_refund_attempt read.
    const late = await h.deps.rpc('record_refund_attempt', {
      p_attempt_id: 'att-1',
      p_expected_version: 1,
      p_stripe_refund_id: 're_1',
    });
    expect((late.data as { outcome: string }[])[0].outcome).toBe('conflict');
    expect(h.attempts.map(a => [a.status, a.refundId])).toEqual([
      ['failed', 're_1'],
      ['pending', 're_2'],
    ]);
    const stolen = await h.deps.rpc('record_refund_attempt', {
      p_attempt_id: 'att-2',
      p_expected_version: h.attempts[1].version,
      p_stripe_refund_id: 're_1',
    });
    expect((stolen.data as { outcome: string }[])[0].outcome).toBe('refund_on_other_attempt');
  });

  it('a late failure of an OLD attempt after a newer one succeeded leaves the request refunded', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    const lateFailure = h.stripeSets('re_1', 'failed');
    await settleApprovedRefund(h.settleDeps, lateFailure);
    h.setCreateStatus('succeeded');
    await approveRefundRequest(h.deps, INPUT);
    await settleApprovedRefund(h.settleDeps, lateFailure);
    expect(h.requestState().status).toBe('refunded');
  });

  it('success then failure reopens the request and allows attempt 2', async () => {
    const h = harness();
    await approveRefundRequest(h.deps, INPUT);
    await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'failed'));
    expect(h.requestState().status).toBe('failed');
    expect((await approveRefundRequest(h.deps, INPUT)).status).toBe(200);
    expect(h.attempts).toHaveLength(2);
  });

  it('a refund dead on arrival reopens the request at once', async () => {
    const h = harness({ createStatus: 'canceled' });
    expect(await approveRefundRequest(h.deps, INPUT)).toEqual({
      status: 502,
      body: { error: 'stripe_refund_canceled' },
    });
    expect(h.requestState().status).toBe('failed');
  });
});

/** Codex round 3 on #2689: compare-and-set on every attempt write. */
describe('round 3 interleavings', () => {
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));

  it('a delayed approval holding a stale success never overwrites the failure Stripe reports', async () => {
    const h = harness({ createStatus: 'pending' });
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    // Approval A gets Stripe's answer ("succeeded" at that moment) but stalls
    // before recording it.
    const depsA = {
      ...h.deps,
      createRefund: async (params: Parameters<typeof h.deps.createRefund>[0], key: string) => {
        const refund = await h.deps.createRefund(params, key);
        const stale = { ...refund, status: 'succeeded' };
        await gate;
        return stale;
      },
    };
    const approvalA = approveRefundRequest(depsA, INPUT);
    await tick();

    // Approval B records the same refund (pending); the webhook then settles it failed.
    expect((await approveRefundRequest(h.deps, INPUT)).status).toBe(202);
    await settleApprovedRefund(
      h.settleDeps,
      h.stripeSets('re_1', 'failed', 'expired_or_canceled_card')
    );
    expect(h.attempts[0]).toMatchObject({ status: 'failed', version: 3 });

    release();
    const resultA = await approvalA;

    expect(resultA).toEqual({ status: 502, body: { error: 'stripe_refund_failed' } });
    expect(h.attempts[0]).toMatchObject({ status: 'failed', version: 3 });
    expect(h.requestState()).toEqual({
      status: 'failed',
      lastFailure: 'failed: expired_or_canceled_card',
    });
    expect(h.rpcCalls.some(c => c.fn === 'record_order_refund_cents')).toBe(false);
    // A never wrote the status its create call returned; B attached the id once.
    expect(
      h.rpcCalls.filter(c => c.fn === 'record_refund_attempt').map(c => c.args.p_expected_version)
    ).toEqual([1]);
  });

  it('a webhook that read the version before a newer settle retries instead of overwriting', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT);
    // W1 reads the version and Stripe ("succeeded"), then stalls.
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let firstRead = true;
    const w1Deps = {
      ...h.settleDeps,
      retrieveRefund: async (id: string) => {
        const copy = await h.settleDeps.retrieveRefund(id);
        if (firstRead) {
          firstRead = false;
          const stale = { ...copy, status: 'succeeded' };
          await gate;
          return stale;
        }
        return copy;
      },
    };
    const w1 = settleApprovedRefund(w1Deps, h.stripeRefunds[0]);
    await tick();

    // W2: Stripe now says failed.
    await settleApprovedRefund(h.settleDeps, h.stripeSets('re_1', 'failed'));
    release();

    await expect(w1).resolves.toMatchObject({ outcome: 'settled' });
    expect(h.attempts[0].status).toBe('failed');
    const settles = h.rpcCalls.filter(c => c.fn === 'settle_refund_attempt');
    expect(settles.map(c => [c.args.p_expected_version, c.args.p_status])).toEqual([
      [2, 'pending'], // the approval's own settle after create
      [2, 'failed'], // W2
      [2, 'succeeded'], // W1's stale write: conflict, nothing written
      [3, 'failed'], // W1 re-reads the version and Stripe, and agrees
    ]);
  });
});

/** Codex P2 on #2689 round 1: reuse must see every refund on the intent. */
describe('refund listing is paginated before deciding to create', () => {
  it('reuses the attempt refund that is on page 2 of 151', async () => {
    const h = harness({ createStatus: 'pending' });
    await approveRefundRequest(h.deps, INPUT); // attempt 1, re_1 pending
    for (let i = 0; i < 150; i += 1) {
      h.stripeRefunds.push({
        id: `re_entry_${i}`,
        amount: 100,
        status: 'succeeded',
        metadata: { entry_id: `e${i}` },
      });
    }
    h.attempts[0].refundId = null; // the first approval crashed before recording
    h.stripeSets('re_1', 'succeeded');
    h.pageRequests.length = 0;

    const result = await approveRefundRequest(h.deps, INPUT);

    expect(result.body).toEqual({ outcome: 'refunded', refund_id: 're_1' });
    expect(h.created).toHaveLength(1);
    expect(h.pageRequests).toEqual([undefined, 're_entry_50']);
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

describe('attempt helpers', () => {
  const refunds: ApprovalRefund[] = [
    {
      id: 're_dead',
      amount: 1,
      status: 'failed',
      metadata: { refund_request_id: 'rr-1', refund_attempt_no: '1' },
    },
    {
      id: 're_two',
      amount: 1,
      status: 'pending',
      metadata: { refund_request_id: 'rr-1', refund_attempt_no: '2' },
    },
    {
      id: 're_other',
      amount: 1,
      status: 'succeeded',
      metadata: { refund_request_id: 'rr-2', refund_attempt_no: '1' },
    },
  ];

  it('finds the refund for exactly this request and attempt', () => {
    expect(findAttemptRefund(refunds, 'rr-1', 2, null)?.id).toBe('re_two');
    expect(findAttemptRefund(refunds, 'rr-1', 3, null)).toBeUndefined();
    expect(findAttemptRefund(refunds, 'rr-1', 3, 're_dead')?.id).toBe('re_dead');
  });

  it('flags only LIVE refunds of this request on other attempts', () => {
    expect(findLiveRefundOnOtherAttempt(refunds, 'rr-1', 3)?.id).toBe('re_two');
    expect(findLiveRefundOnOtherAttempt(refunds, 'rr-1', 2)).toBeUndefined();
  });

  it('maps Stripe statuses onto attempt statuses', () => {
    expect(
      ['pending', 'requires_action', 'succeeded', 'failed', 'canceled', null].map(toAttemptStatus)
    ).toEqual(['pending', 'pending', 'succeeded', 'failed', 'canceled', 'pending']);
  });
});
