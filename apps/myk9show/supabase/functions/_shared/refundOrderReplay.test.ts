// @vitest-environment node
// Replaying an order's owed refund (Codex rounds 10-12 on #2689), behind two
// independent guards: the queue-path marker, and no legacy auto-refund for
// the session at Stripe.
import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_AUTO_REFUND_TYPES,
  queuedRefundFromOrder,
  REFUND_QUEUE_MARKER,
  replayOwedRefund,
  type ReplayDeps,
} from './refundOrderReplay';

const OVERFLOW = {
  cart_id: 'cart-1',
  overflow_refund: { action: 'refund', amount_cents: 2500, reason: 'partial_no_service_lines' },
  denied_cart_item_ids: ['ci-2'],
};

function order(metadata: unknown) {
  return { sessionId: 'cs_1', paymentIntentId: 'pi_1', showId: 'show-1', metadata };
}

function replayDeps(stripeRefunds: Array<{ id: string; metadata?: Record<string, string> }> = []) {
  const queued: string[] = [];
  const alerts: string[] = [];
  const listIntentRefunds = vi.fn(async () => stripeRefunds);
  const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) => {
    queued.push(`${args.p_session_id}/${args.p_kind}`);
    return {
      data: [{ refund_request_id: 'rr-1', created: true, request_status: 'pending' }],
      error: null,
    };
  });
  const deps: ReplayDeps = {
    rpc,
    alertAdmin: async title => {
      alerts.push(title);
    },
    findRefundRequest: async () => ({ data: null, error: null }),
    listIntentRefunds,
  };
  return { deps, queued, alerts, rpc, listIntentRefunds };
}

describe('queuedRefundFromOrder', () => {
  it('rebuilds a cart-overflow refund from a MARKED order', () => {
    expect(queuedRefundFromOrder(order({ ...REFUND_QUEUE_MARKER, ...OVERFLOW }))).toMatchObject({
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

  it('rebuilds a payment-link refund from a MARKED order', () => {
    expect(
      queuedRefundFromOrder(
        order({
          ...REFUND_QUEUE_MARKER,
          entry_payment_link_id: 'link-1',
          invalid_entry_refund: {
            action: 'refund',
            amount_cents: 900,
            reason: 'partial_invalid_entries',
          },
          invalid_entry_ids: ['e-1'],
        })
      )
    ).toMatchObject({
      kind: 'entry_payment_link',
      amountCents: 900,
      reason: 'partial_invalid_entries',
      entryPaymentLinkId: 'link-1',
      detail: { invalid_entry_ids: ['e-1'] },
    });
  });

  it.each([
    ['an UNMARKED (legacy) order, even with overflow_refund', OVERFLOW],
    ['a marker with the wrong value', { refund_queue: '1', ...OVERFLOW }],
    ['no refund owed', { ...REFUND_QUEUE_MARKER, overflow_refund: { action: 'none' } }],
    [
      'a manual amount',
      { ...REFUND_QUEUE_MARKER, overflow_refund: { action: 'needs_manual_amount' } },
    ],
    ['no metadata', null],
  ])('%s: nothing to replay', (_label, metadata) => {
    expect(queuedRefundFromOrder(order(metadata))).toBeNull();
  });
});

describe('replayOwedRefund (Codex round 12)', () => {
  it('a new-path order (marker present) replays its refund into the queue', async () => {
    const w = replayDeps();
    await expect(
      replayOwedRefund(w.deps, order({ ...REFUND_QUEUE_MARKER, ...OVERFLOW }))
    ).resolves.toBe('queued');
    expect(w.queued).toEqual(['cs_1/cart_overflow']);
    expect(w.alerts).toEqual(['Refund awaiting approval']);
  });

  it('a legacy order (no marker) whose refund the old code issued is never queued', async () => {
    const w = replayDeps([
      {
        id: 're_legacy',
        metadata: { type: 'entry_cart_overflow_auto_refund', checkout_session_id: 'cs_1' },
      },
    ]);
    await expect(replayOwedRefund(w.deps, order(OVERFLOW))).resolves.toBe('nothing_owed');
    expect(w.rpc).not.toHaveBeenCalled();
    expect(w.alerts).toEqual([]);
  });

  it('a legacy order with no marker and NO recorded refund is still not replayed (the marker is the rule)', async () => {
    const w = replayDeps([]);
    await expect(replayOwedRefund(w.deps, order(OVERFLOW))).resolves.toBe('nothing_owed');
    expect(w.rpc).not.toHaveBeenCalled();
    expect(w.listIntentRefunds).not.toHaveBeenCalled();
  });

  it.each([...LEGACY_AUTO_REFUND_TYPES])(
    'defence in depth: a marked order whose session already has a %s refund at Stripe is not queued',
    async type => {
      const w = replayDeps([{ id: 're_old', metadata: { type, checkout_session_id: 'cs_1' } }]);
      await expect(
        replayOwedRefund(w.deps, order({ ...REFUND_QUEUE_MARKER, ...OVERFLOW }))
      ).resolves.toBe('legacy_refunded');
      expect(w.listIntentRefunds).toHaveBeenCalledWith('pi_1');
      expect(w.rpc).not.toHaveBeenCalled();
    }
  );

  it('a legacy refund for ANOTHER session on the intent does not block the replay', async () => {
    const w = replayDeps([
      {
        id: 're_other',
        metadata: { type: 'entry_cart_overflow_auto_refund', checkout_session_id: 'cs_9' },
      },
    ]);
    await expect(
      replayOwedRefund(w.deps, order({ ...REFUND_QUEUE_MARKER, ...OVERFLOW }))
    ).resolves.toBe('queued');
  });

  it('Stripe unreachable for the legacy check: throws (5xx) and queues nothing', async () => {
    const w = replayDeps();
    w.deps.listIntentRefunds = async () => {
      throw new Error('stripe down');
    };
    await expect(
      replayOwedRefund(w.deps, order({ ...REFUND_QUEUE_MARKER, ...OVERFLOW }))
    ).rejects.toThrow('stripe down');
    expect(w.rpc).not.toHaveBeenCalled();
  });
});
