// @vitest-environment node
// MYK9-964: an exhibitor who paid gets exactly one confirmation, even when the
// latch commits and its response is lost.
//
// The latch call (complete_cart_fulfillment) commits the order, then the
// network drops; the webhook answers 5xx before sending the confirmation.
// Stripe redelivers; routePaidSession takes the replay-first branch, which
// sends the confirmation once (replayCartConfirmation) because no entry is
// stamped yet. The send stamps the entries (sendEntryConfirmationEmail's MP-13
// stamp), so a further redelivery sends nothing.
import { describe, expect, it } from 'vitest';
import type { CartOverflowRefundDecision } from '../_shared/cartOverflowRefund';
import {
  ensureSessionRefundAlerts,
  type RefundQueueDeps,
  type SessionRefundRequest,
} from '../_shared/refundRequests';
import { replayCartConfirmation, type ReplayedCartOrder } from './cartConfirmationReplay';
import { closeCartFulfillment, type CartLineResults } from './cartFulfillment';
import { routePaidSession } from './paidSessionEntry';

const SESSION = 'cs_964_email';

const LINES: CartLineResults = {
  entryIds: ['e-1', 'e-2'],
  paidLineIds: ['e-1', 'e-2'],
  noServiceLineIds: ['ci-3'],
  lineAmountsById: new Map([
    ['e-1', 3000],
    ['e-2', 3000],
    ['ci-3', 3000],
  ]),
  waitlisted: [],
  denied: [{ cartItemId: 'ci-3', classId: 'c-3', dogId: 'd-3' }],
  failed: [],
};

function world(opts: { owed: boolean; sendFails?: boolean }) {
  const state = {
    network: 'commit-then-lose' as 'commit-then-lose' | 'down' | 'up',
    order: null as { entry_ids: string[] } | null,
    requests: new Map<string, SessionRefundRequest>(),
    stamped: new Set<string>(),
    emails: [] as string[][],
    sendFails: opts.sendFails ?? false,
  };

  const rpc: RefundQueueDeps['rpc'] = async (fn, args) => {
    expect(fn).toBe('complete_cart_fulfillment');
    if (state.network === 'down') return { data: null, error: { message: 'connection reset' } };
    const closed = state.order === null;
    if (closed) state.order = args.p_order as { entry_ids: string[] };
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
    if (state.network === 'commit-then-lose') {
      state.network = 'down';
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

  /** sendEntryConfirmationEmail: stamps the entries only after a successful send. */
  const send = async (order: ReplayedCartOrder) => {
    if (state.sendFails) return;
    state.emails.push(order.entryIds);
    for (const id of order.entryIds) state.stamped.add(id);
  };

  const replay = () =>
    replayCartConfirmation(
      {
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
        countConfirmed: async ids => ids.filter(id => state.stamped.has(id)).length,
        send,
      },
      SESSION
    );

  /** The first delivery's latch, then (only if it closed it) the confirmation. */
  async function deliverLatch() {
    const decision: CartOverflowRefundDecision = opts.owed
      ? {
          action: 'refund',
          amountCents: 3000,
          paidAmountCents: 6600,
          reason: 'partial_no_service_lines',
        }
      : { action: 'none', paidAmountCents: 9900 };
    const closed = await closeCartFulfillment(deps, {
      sessionId: SESSION,
      cartId: 'cart-email',
      paymentIntentId: 'pi_email',
      order: { stripe_payment_intent_id: 'pi_email', entry_ids: LINES.entryIds },
      decision,
      lines: LINES,
    });
    if (closed.latchClosed) {
      await send({
        entryIds: LINES.entryIds,
        showId: 'show-1',
        exhibitorPersonId: 'person-1',
        subtotalCents: 6000,
        totalCents: 6600,
      });
    }
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
          await replay();
        },
        alreadyFulfilled: async () => {
          await replay();
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

  return { state, deliverLatch, redeliver, replay };
}

describe('MYK9-964: confirmation after a lost latch response', () => {
  it.each([
    ['with a queued overflow refund', true, 'refund_requested'],
    ['with nothing owed', false, 'already_fulfilled'],
  ] as const)(
    '%s: exactly one email, and none on a second redelivery',
    async (_n, owed, branch) => {
      const w = world({ owed });

      await expect(w.deliverLatch()).rejects.toThrow(/could not be confirmed/);
      expect(w.state.order).not.toBeNull();
      expect(w.state.emails).toHaveLength(0);

      await expect(w.redeliver()).resolves.toBe(branch);
      expect(w.state.emails).toEqual([['e-1', 'e-2']]);

      await expect(w.redeliver()).resolves.toBe(branch);
      expect(w.state.emails).toHaveLength(1);
    }
  );

  it('a delivery that closed the latch and sent is never followed by a second email', async () => {
    const w = world({ owed: false });
    w.state.network = 'up';
    await w.deliverLatch();
    expect(w.state.emails).toHaveLength(1);
    await w.redeliver();
    expect(w.state.emails).toHaveLength(1);
  });

  it('a failed send stamps nothing, so the next redelivery tries again', async () => {
    const w = world({ owed: false, sendFails: true });
    await expect(w.deliverLatch()).rejects.toThrow();
    await w.redeliver();
    expect(w.state.emails).toHaveLength(0);
    w.state.sendFails = false;
    await w.redeliver();
    expect(w.state.emails).toHaveLength(1);
  });
});

describe('replayCartConfirmation', () => {
  const order: ReplayedCartOrder = {
    entryIds: ['e-1'],
    showId: 's',
    exhibitorPersonId: 'p',
    subtotalCents: 3000,
    totalCents: 3300,
  };
  const run = (o: ReplayedCartOrder | null, confirmed: number) => {
    const sent: ReplayedCartOrder[] = [];
    return replayCartConfirmation(
      {
        readOrder: async () => o,
        countConfirmed: async () => confirmed,
        send: async x => {
          sent.push(x);
        },
      },
      'cs'
    ).then(result => ({ result, sent }));
  };

  it.each([
    ['no order', null, 0, 'no_order', 0],
    [
      'an order with no entries (every line unserved)',
      { ...order, entryIds: [] },
      0,
      'no_entries',
      0,
    ],
    ['an entry already stamped', order, 1, 'already_confirmed', 0],
    ['no recipient', { ...order, exhibitorPersonId: null }, 0, 'no_recipient', 0],
    ['unstamped entries', order, 0, 'sent', 1],
  ] as const)('%s', async (_n, o, confirmed, expected, sends) => {
    const { result, sent } = await run(o as ReplayedCartOrder | null, confirmed);
    expect(result).toBe(expected);
    expect(sent).toHaveLength(sends);
  });
});
