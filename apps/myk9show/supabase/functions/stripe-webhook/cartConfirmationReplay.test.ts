// @vitest-environment node
// MYK9-964: an exhibitor who paid gets exactly one receipt per checkout
// session, gated on cart_fulfillments.receipt_sent_at (never on the entries'
// confirmation stamps, which the scheduled sender writes for unpaid entries).
//
// The model: complete_cart_fulfillment commits the order and completes the
// run; the network can lose that response, either for good
// ('commit-then-lose': the webhook answers 5xx and Stripe redelivers) or only
// once ('commit-then-error': the call's own retry succeeds with
// latch_closed false and the webhook answers 2xx). Every path ends in the one
// sender, sendCartReceiptOnce.
import { describe, expect, it } from 'vitest';
import type { CartOverflowRefundDecision } from '../_shared/cartOverflowRefund';
import {
  ensureSessionRefundAlerts,
  type RefundQueueDeps,
  type SessionRefundRequest,
} from '../_shared/refundRequests';
import {
  closeCartThenSendReceipt,
  sendCartReceiptOnce,
  type CartReceiptDeps,
  type ReplayedCartOrder,
} from './cartConfirmationReplay';
import type { CartLineResults } from './cartFulfillment';
import { routePaidSession } from './paidSessionEntry';

const SESSION = 'cs_964_email';

const LINES: CartLineResults = {
  // e-recovered: a Finish Payment entry; e-new: bought in this checkout.
  entryIds: ['e-recovered', 'e-new'],
  paidLineIds: ['e-recovered', 'e-new'],
  noServiceLineIds: ['ci-3'],
  lineAmountsById: new Map([
    ['e-recovered', 3000],
    ['e-new', 3000],
    ['ci-3', 3000],
  ]),
  waitlisted: [],
  denied: [{ cartItemId: 'ci-3', classId: 'c-3', dogId: 'd-3' }],
  failed: [],
};

type Network = 'commit-then-lose' | 'commit-then-error' | 'down' | 'up';

function world(opts: { owed: boolean; sendFails?: boolean }) {
  const state = {
    network: 'up' as Network,
    order: null as { entry_ids: string[] } | null,
    completed: false,
    receiptSentAt: null as string | null,
    requests: new Map<string, SessionRefundRequest>(),
    /**
     * entries.confirmation_email_sent_at. The scheduled sender stamped the
     * Finish Payment entry BEFORE this checkout; it must not stop the receipt.
     */
    entryStamps: new Set<string>(['e-recovered']),
    emails: [] as string[][],
    sendFails: opts.sendFails ?? false,
  };

  const rpc: RefundQueueDeps['rpc'] = async (fn, args) => {
    expect(fn).toBe('complete_cart_fulfillment');
    if (state.network === 'down') return { data: null, error: { message: 'connection reset' } };
    const closed = !state.completed;
    if (closed) {
      state.completed = true;
      state.order = args.p_order as { entry_ids: string[] };
    }
    if (args.p_amount_cents != null && !state.requests.has(SESSION)) {
      state.requests.set(SESSION, {
        id: 'rr-email',
        kind: 'cart_overflow',
        status: 'pending',
        amount_cents: args.p_amount_cents as number,
        reason: args.p_reason as string,
        stripe_payment_intent_id: 'pi_email',
      });
    }
    if (state.network === 'commit-then-lose' || state.network === 'commit-then-error') {
      state.network = state.network === 'commit-then-lose' ? 'down' : 'up';
      return { data: null, error: { message: 'response lost' } };
    }
    const request = state.requests.get(SESSION);
    return {
      data: [
        {
          latch_closed: closed,
          cart_status: 'submitted',
          order_created: closed,
          refund_request_id: request?.id ?? null,
          created: false,
          request_status: request?.status ?? null,
          amount_cents: request?.amount_cents ?? null,
          reason: request?.reason ?? null,
          stripe_payment_intent_id: request?.stripe_payment_intent_id ?? null,
        },
      ],
      error: null,
    };
  };
  const deps: RefundQueueDeps = { rpc, alertAdmin: async () => undefined };

  const receipt: CartReceiptDeps = {
    readReceiptState: async () => ({
      latched: state.completed,
      receiptSentAt: state.receiptSentAt,
    }),
    readOrder: async () =>
      state.order
        ? {
            entryIds: state.order.entry_ids,
            showId: 'show-1',
            exhibitorPersonId: 'person-1',
            subtotalCents: 6000,
            totalCents: 6600,
          }
        : null,
    // sendEntryConfirmationEmail: also stamps the entries, a separate concern.
    send: async (order: ReplayedCartOrder) => {
      if (state.sendFails) return false;
      state.emails.push(order.entryIds);
      for (const id of order.entryIds) state.entryStamps.add(id);
      return true;
    },
    markReceiptSent: async () => {
      state.receiptSentAt ??= '2026-10-04T20:00:00Z';
    },
  };

  /** The first delivery's end, exactly as index.ts fulfillCartRun runs it. */
  function deliverLatch() {
    const decision: CartOverflowRefundDecision = opts.owed
      ? {
          action: 'refund',
          amountCents: 3000,
          paidAmountCents: 6600,
          reason: 'partial_no_service_lines',
        }
      : { action: 'none', paidAmountCents: 9900 };
    return closeCartThenSendReceipt(
      deps,
      {
        sessionId: SESSION,
        cartId: 'cart-email',
        paymentIntentId: 'pi_email',
        order: { stripe_payment_intent_id: 'pi_email', entry_ids: LINES.entryIds },
        decision,
        lines: LINES,
      },
      receipt
    );
  }

  /** index.ts handleCheckoutCompleted on a redelivery of a cart session. */
  function redeliver() {
    state.network = 'up';
    return routePaidSession<SessionRefundRequest>(
      { checkoutType: 'entry', mode: 'payment' },
      {
        findRequests: async () => [...state.requests.values()],
        orderExists: async () => state.order !== null,
        refundRequested: async requests => {
          await ensureSessionRefundAlerts(deps, SESSION, requests);
          await sendCartReceiptOnce(receipt, SESSION);
        },
        alreadyFulfilled: async () => {
          await sendCartReceiptOnce(receipt, SESSION);
        },
        fulfillCart: async () => {
          throw new Error('the order exists: a redelivery must not fulfill again');
        },
        fulfillPaymentLink: async () => undefined,
        subscription: async () => undefined,
        unexpectedPayment: () => undefined,
      }
    );
  }

  return { state, deliverLatch, redeliver };
}

const BOTH = [
  ['with a queued overflow refund', true, 'refund_requested'],
  ['with nothing owed', false, 'already_fulfilled'],
] as const;

describe('MYK9-964: one receipt per checkout session', () => {
  it.each(BOTH)(
    'a pre-stamped Finish Payment entry plus a new entry (%s): one receipt for the order',
    async (_n, owed) => {
      const w = world({ owed });
      await expect(w.deliverLatch()).resolves.toBe('sent');
      expect(w.state.emails).toEqual([['e-recovered', 'e-new']]);
      expect(w.state.receiptSentAt).not.toBeNull();
    }
  );

  it.each(BOTH)(
    'latch commits, response lost (%s): one receipt on redelivery, none on the next',
    async (_n, owed, branch) => {
      const w = world({ owed });
      w.state.network = 'commit-then-lose';

      await expect(w.deliverLatch()).rejects.toThrow(/could not be confirmed/);
      expect(w.state.order).not.toBeNull();
      expect(w.state.emails).toHaveLength(0);

      await expect(w.redeliver()).resolves.toBe(branch);
      expect(w.state.emails).toEqual([['e-recovered', 'e-new']]);

      await expect(w.redeliver()).resolves.toBe(branch);
      expect(w.state.emails).toHaveLength(1);
    }
  );

  it.each(BOTH)(
    'commit-then-error, then a successful retry inside the call (%s): one receipt, none on redelivery',
    async owedLabel => {
      // Codex P2 on #2744: the retry reports latch_closed false and the
      // webhook answers 2xx, so Stripe never redelivers; the receipt must go
      // out on THIS delivery.
      const w = world({ owed: owedLabel === 'with a queued overflow refund' });
      w.state.network = 'commit-then-error';

      await expect(w.deliverLatch()).resolves.toBe('sent');
      expect(w.state.emails).toEqual([['e-recovered', 'e-new']]);

      await w.redeliver();
      expect(w.state.emails).toHaveLength(1);
    }
  );

  it('a delivery that latched and sent is never followed by a second receipt', async () => {
    const w = world({ owed: false });
    await w.deliverLatch();
    await w.redeliver();
    await w.redeliver();
    expect(w.state.emails).toHaveLength(1);
  });

  it('a failed send leaves the marker NULL, so the next redelivery sends it', async () => {
    const w = world({ owed: false, sendFails: true });
    await expect(w.deliverLatch()).resolves.toBe('send_failed');
    expect(w.state.receiptSentAt).toBeNull();
    await w.redeliver();
    expect(w.state.emails).toHaveLength(0);
    w.state.sendFails = false;
    await w.redeliver();
    await w.redeliver();
    expect(w.state.emails).toHaveLength(1);
  });
});

describe('sendCartReceiptOnce', () => {
  const order: ReplayedCartOrder = {
    entryIds: ['e-1'],
    showId: 's',
    exhibitorPersonId: 'p',
    subtotalCents: 3000,
    totalCents: 3300,
  };
  const run = async (
    state: { latched: boolean; receiptSentAt: string | null } | null,
    o: ReplayedCartOrder | null,
    accepted = true
  ) => {
    const sent: ReplayedCartOrder[] = [];
    let marked = 0;
    const result = await sendCartReceiptOnce(
      {
        readReceiptState: async () => state,
        readOrder: async () => o,
        send: async x => {
          sent.push(x);
          return accepted;
        },
        markReceiptSent: async () => {
          marked += 1;
        },
      },
      'cs'
    );
    return { result, sent: sent.length, marked };
  };
  const open = { latched: true, receiptSentAt: null };

  it.each([
    ['no run (an order from before MYK9-964)', null, order, true, 'no_run', 0, 0],
    [
      'a run not latched yet',
      { latched: false, receiptSentAt: null },
      order,
      true,
      'not_latched',
      0,
      0,
    ],
    [
      'a receipt already sent',
      { latched: true, receiptSentAt: 't' },
      order,
      true,
      'already_sent',
      0,
      0,
    ],
    ['no order', open, null, true, 'no_order', 0, 0],
    ['an order with no entries', open, { ...order, entryIds: [] }, true, 'no_entries', 0, 0],
    ['no recipient', open, { ...order, exhibitorPersonId: null }, true, 'no_recipient', 0, 0],
    ['a send the provider refused', open, order, false, 'send_failed', 1, 0],
    ['an open receipt', open, order, true, 'sent', 1, 1],
  ] as const)('%s', async (_n, state, o, accepted, expected, sends, marks) => {
    const r = await run(state, o as ReplayedCartOrder | null, accepted);
    expect(r).toEqual({ result: expected, sent: sends, marked: marks });
  });
});
