// @vitest-environment node
// MYK9-964: replayable cart fulfillment, latch LAST, cart overflow queued.
//
// One in-memory database behind a flaky network stands in for the four RPCs
// (begin_cart_fulfillment, fulfill_cart_line, record_cart_line_outcome,
// complete_cart_fulfillment). It mirrors the SQL: a recorded line outcome is
// never re-decided, the latch refuses while a line is unrecorded, and the
// request is idempotent on (session, kind). The SQL itself is pinned by
// supabase/tests/myk9_964_replayable_cart_fulfillment_test.sql.
import { describe, expect, it } from 'vitest';
import { decideCartOverflowRefund } from '../_shared/cartOverflowRefund';
import { instructsManualRefund } from '../_shared/refundAlertCopy';
import { ensureSessionRefundAlerts, type SessionRefundRequest } from '../_shared/refundRequests';
import {
  beginCartFulfillment,
  closeCartFulfillment,
  workCartLines,
  type CartFulfillmentDeps,
  type CartFulfillmentLine,
  type FinishPaymentResult,
  type LineOutcome,
} from './cartFulfillment';
import { routePaidSession } from './paidSessionEntry';

const SESSION = 'cs_964';
const INTENT = 'pi_964';
const RATES = { percent: 0, flatCents: 0, minCents: 0 };
type Capacity = 'room' | 'full' | 'waitlist';
type Network = 'up' | 'commit-then-lose' | 'down';

function line(id: string, no: number, existing: string | null = null): CartFulfillmentLine {
  return {
    cart_item_id: id,
    line_no: no,
    dog_id: `dog-${id}`,
    class_id: `class-${id}`,
    existing_entry_id: existing,
    line_amount_cents: 3000,
    outcome: null,
    entry_id: null,
    paid_entry_id: null,
    waitlist_entry_id: null,
    error_message: null,
  };
}

/** The cart: ci-1 has room, ci-2 is full, ci-3 has a wait list, ci-4 is a Finish Payment line. */
function cartDatabase() {
  const state = {
    cart: 'active',
    capacity: { 'ci-1': 'room', 'ci-2': 'full', 'ci-3': 'waitlist' } as Record<string, Capacity>,
    lines: new Map<string, CartFulfillmentLine>(),
    entries: [] as string[],
    waitlistRows: 0,
    completed: false,
    orders: new Map<string, Record<string, unknown>>(),
    requests: new Map<string, SessionRefundRequest>(),
    /** Per-RPC network behaviour; 'commit-then-lose' flips to 'down' after one call. */
    network: {} as Record<string, Network>,
  };
  const alerts: { title: string; html: string; key: string }[] = [];

  function respond(fn: string, data: unknown) {
    const mode = state.network[fn] ?? 'up';
    if (mode === 'commit-then-lose') {
      state.network[fn] = 'down';
      return { data: null, error: { message: 'response lost' } };
    }
    return { data: [data], error: null };
  }

  const rpc: CartFulfillmentDeps['rpc'] = async (fn, args) => {
    if (state.network[fn] === 'down') return { data: null, error: { message: 'connection reset' } };
    if (fn === 'begin_cart_fulfillment') {
      if (state.lines.size > 0) {
        return respond(fn, {
          outcome: state.completed ? 'completed' : 'resumed',
          cart_status: state.cart,
        });
      }
      for (const [no, id] of ['ci-1', 'ci-2', 'ci-3', 'ci-4'].entries()) {
        state.lines.set(id, line(id, no + 1, id === 'ci-4' ? 'e-recovered' : null));
      }
      state.cart = 'fulfilling';
      return respond(fn, { outcome: 'begun', cart_status: 'fulfilling' });
    }
    const item = args.p_cart_item_id as string;
    const stored = state.lines.get(item);
    if (fn === 'fulfill_cart_line' && stored) {
      if (!stored.outcome) {
        const capacity = state.capacity[item];
        const outcome: LineOutcome =
          capacity === 'room' ? 'created_entry' : capacity === 'waitlist' ? 'waitlisted' : 'denied';
        const entryId =
          outcome === 'created_entry' ? `e-${item}-${state.entries.length + 1}` : null;
        if (entryId) state.entries.push(entryId);
        if (outcome === 'waitlisted') state.waitlistRows += 1;
        Object.assign(stored, {
          outcome,
          entry_id: entryId,
          paid_entry_id: entryId,
          waitlist_entry_id: outcome === 'waitlisted' ? `w-${item}` : null,
        });
        return respond(fn, { ...stored, replayed: false });
      }
      return respond(fn, { ...stored, replayed: true });
    }
    if (fn === 'record_cart_line_outcome' && stored) {
      if (!stored.outcome) {
        Object.assign(stored, {
          outcome: args.p_outcome,
          entry_id: args.p_entry_id,
          paid_entry_id: args.p_paid_entry_id,
          error_message: args.p_error_message,
        });
      }
      return respond(fn, stored);
    }
    if (fn === 'complete_cart_fulfillment') {
      if ([...state.lines.values()].some(l => !l.outcome)) {
        return { data: null, error: { message: 'line with no recorded outcome' } };
      }
      let closed = false;
      if (!state.completed) {
        state.completed = true;
        state.cart = 'submitted';
        state.orders.set(SESSION, args.p_order as Record<string, unknown>);
        closed = true;
      }
      if (args.p_amount_cents != null && !state.requests.has(SESSION)) {
        state.requests.set(SESSION, {
          id: 'rr-964',
          kind: 'cart_overflow',
          status: 'pending',
          amount_cents: args.p_amount_cents as number,
          reason: args.p_reason as string,
          stripe_payment_intent_id: INTENT,
        });
      }
      const request = state.requests.get(SESSION);
      return respond(fn, {
        latch_closed: closed,
        cart_status: state.cart,
        order_created: closed,
        refund_request_id: request?.id ?? null,
        created: closed && Boolean(request),
        request_status: request?.status ?? null,
        amount_cents: request?.amount_cents ?? null,
        reason: request?.reason ?? null,
        stripe_payment_intent_id: request?.stripe_payment_intent_id ?? null,
      });
    }
    throw new Error(`unexpected rpc ${fn}`);
  };

  let finishPayments = 0;
  const deps: CartFulfillmentDeps = {
    rpc,
    alertAdmin: async (title, html, opts) => {
      alerts.push({ title, html, key: opts.dedupeKey });
    },
    readLines: async () => [...state.lines.values()].map(l => ({ ...l })),
    payFinishPaymentLine: async (): Promise<FinishPaymentResult> => {
      finishPayments += 1;
      return { outcome: 'paid_existing', entryId: 'e-recovered', paidEntryId: 'e-recovered' };
    },
  };
  return { state, deps, alerts, finishPayments: () => finishPayments };
}

/** One delivery of the webhook's cart path: begin, work, close (index.ts fulfillCartRun). */
async function deliver(db: ReturnType<typeof cartDatabase>) {
  const begun = await beginCartFulfillment(db.deps, {
    cartId: 'cart-964',
    sessionId: SESSION,
    paymentIntentId: INTENT,
    lineAmounts: { 'ci-1': 3000, 'ci-2': 3000, 'ci-3': 3000, 'ci-4': 3000 },
  });
  if (begun.outcome === 'completed' || begun.outcome === 'not_claimable') return null;
  const lines = await workCartLines(db.deps, SESSION);
  const decision = decideCartOverflowRefund({
    paymentIntentId: INTENT,
    sessionAmountTotalCents: 12000,
    paidLineIds: lines.paidLineIds,
    noServiceLineIds: lines.noServiceLineIds,
    lineAmountsById: lines.lineAmountsById,
    platformFeeRates: RATES,
  });
  const closed = await closeCartFulfillment(db.deps, {
    sessionId: SESSION,
    cartId: 'cart-964',
    paymentIntentId: INTENT,
    order: { stripe_payment_intent_id: INTENT, entry_ids: lines.entryIds, amount_cents: 12000 },
    decision,
    lines,
  });
  return { lines, decision, closed };
}

/** A redelivery's entry decision (index.ts handleCheckoutCompleted). */
function redeliver(db: ReturnType<typeof cartDatabase>) {
  for (const fn of Object.keys(db.state.network)) db.state.network[fn] = 'up';
  return routePaidSession<SessionRefundRequest>(
    { checkoutType: 'entry', mode: 'payment' },
    {
      findRequests: async () => [...db.state.requests.values()],
      orderExists: async () => db.state.orders.has(SESSION),
      refundRequested: requests => ensureSessionRefundAlerts(db.deps, SESSION, requests),
      alreadyFulfilled: async () => undefined,
      fulfillCart: async () => {
        await deliver(db);
      },
      fulfillPaymentLink: async () => {
        throw new Error('a cart never fulfills a payment link');
      },
      subscription: async () => undefined,
      unexpectedPayment: () => undefined,
    }
  );
}

describe('MYK9-964: the latch commits, its response is lost, then a redelivery', () => {
  it('ends with one order, one cart_overflow request and its approval alert', async () => {
    const db = cartDatabase();
    db.state.network.complete_cart_fulfillment = 'commit-then-lose';

    await expect(deliver(db)).rejects.toThrow(/could not be confirmed; Stripe will retry/);
    expect(db.state.cart).toBe('submitted');
    expect(db.state.orders.size).toBe(1);
    expect(db.state.requests.get(SESSION)?.amount_cents).toBe(6000);

    await expect(redeliver(db)).resolves.toBe('refund_requested');
    expect(db.state.entries).toEqual(['e-ci-1-1']);
    expect(db.state.requests.size).toBe(1);
    expect(db.alerts.map(a => a.key)).toContain('refund-request-rr-964');
  });
});

describe('MYK9-964: a line commits, its response is lost, capacity frees, then a redelivery', () => {
  it('replays the recorded outcomes and queues the same amount', async () => {
    const db = cartDatabase();
    db.state.network.fulfill_cart_line = 'commit-then-lose';

    // Delivery 1 dies on its first line: it committed, but nothing latched.
    await expect(deliver(db)).rejects.toThrow(/fulfill_cart_line ci-1 unconfirmed/);
    expect(db.state.cart).toBe('fulfilling');
    expect(db.state.orders.size).toBe(0);
    expect(db.state.lines.get('ci-1')?.outcome).toBe('created_entry');

    // Delivery 2 begins the rest; the classes are full, so it would refund 6000.
    db.state.network.fulfill_cart_line = 'up';
    db.state.network.complete_cart_fulfillment = 'down';
    await expect(deliver(db)).rejects.toThrow(/could not be confirmed/);
    const firstOutcomes = [...db.state.lines.values()].map(l => `${l.cart_item_id}:${l.outcome}`);

    // Capacity frees up before delivery 3.
    db.state.capacity = { 'ci-1': 'room', 'ci-2': 'room', 'ci-3': 'room' };
    const third = await redeliver(db);
    expect(third).toBe('fulfill_cart');

    expect([...db.state.lines.values()].map(l => `${l.cart_item_id}:${l.outcome}`)).toEqual(
      firstOutcomes
    );
    expect(firstOutcomes).toEqual([
      'ci-1:created_entry',
      'ci-2:denied',
      'ci-3:waitlisted',
      'ci-4:paid_existing',
    ]);
    expect(db.state.entries).toEqual(['e-ci-1-1']);
    expect(db.state.waitlistRows).toBe(1);
    expect(db.state.requests.get(SESSION)).toMatchObject({
      kind: 'cart_overflow',
      amount_cents: 6000,
      reason: 'partial_no_service_lines',
    });
    expect(db.state.orders.get(SESSION)?.entry_ids).toEqual(['e-ci-1-1', 'e-recovered']);
    // The Finish Payment line was paid once; the replay read its record.
    expect(db.finishPayments()).toBe(1);
  });

  it('never latches while a line is unconfirmed (latch last)', async () => {
    const db = cartDatabase();
    db.state.network.fulfill_cart_line = 'down';
    const calls: string[] = [];
    const rpc = db.deps.rpc;
    db.deps.rpc = (fn, args) => {
      calls.push(fn);
      return rpc(fn, args);
    };
    await expect(deliver(db)).rejects.toThrow(/unconfirmed/);
    expect(calls).not.toContain('complete_cart_fulfillment');
    expect(db.state.cart).toBe('fulfilling');
  });
});

describe('MYK9-964: the recorded outcome wins', () => {
  it('a Finish Payment line uses what was recorded, not what this delivery found', async () => {
    const db = cartDatabase();
    await beginCartFulfillment(db.deps, {
      cartId: 'cart-964',
      sessionId: SESSION,
      paymentIntentId: INTENT,
      lineAmounts: {},
    });
    // A concurrent delivery recorded the line paid; this one reads a stale
    // snapshot and finds the entry no longer unpaid.
    db.state.lines.get('ci-4')!.outcome = null;
    const stale = await db.deps.readLines(SESSION);
    Object.assign(db.state.lines.get('ci-4')!, {
      outcome: 'paid_existing',
      entry_id: 'e-recovered',
      paid_entry_id: 'e-recovered',
    });
    db.deps.readLines = async () => stale;
    db.deps.payFinishPaymentLine = async () => ({
      outcome: 'failed',
      errorMessage: 'Recovered entry is no longer unpaid',
    });

    const lines = await workCartLines(db.deps, SESSION);
    expect(lines.paidLineIds).toContain('e-recovered');
    expect(lines.noServiceLineIds).not.toContain('ci-4');
  });
});

describe('MYK9-964: alerts stay inside the approval queue', () => {
  it.each([
    ['refund queued', { 'ci-2': 'full' }, 1],
    ['every line served', { 'ci-2': 'room', 'ci-3': 'room' }, 0],
  ] as const)('%s', async (_name, capacity, alertCount) => {
    const db = cartDatabase();
    Object.assign(db.state.capacity, capacity);
    await deliver(db);
    expect(db.alerts).toHaveLength(alertCount);
    for (const alert of db.alerts) {
      expect(instructsManualRefund(`${alert.title}. ${alert.html}`)).toBe(false);
    }
  });

  it('an amount that cannot be derived alerts BEFORE the latch and queues nothing', async () => {
    const db = cartDatabase();
    db.state.network.complete_cart_fulfillment = 'commit-then-lose';
    await beginCartFulfillment(db.deps, {
      cartId: 'cart-964',
      sessionId: SESSION,
      paymentIntentId: INTENT,
      lineAmounts: {},
    });
    const lines = await workCartLines(db.deps, SESSION);
    await expect(
      closeCartFulfillment(db.deps, {
        sessionId: SESSION,
        cartId: 'cart-964',
        paymentIntentId: INTENT,
        order: { entry_ids: lines.entryIds },
        decision: {
          action: 'needs_manual_amount',
          missingLineIds: ['ci-2'],
          paidAmountCents: null,
        },
        lines,
      })
    ).rejects.toThrow();
    expect(db.alerts.map(a => a.key)).toEqual([`cart-overflow-refund-manual-amount-${SESSION}`]);
    expect(instructsManualRefund(`${db.alerts[0].title}. ${db.alerts[0].html}`)).toBe(false);
    expect(db.state.requests.size).toBe(0);
  });

  it('a refund that cannot be confirmed raises the unconfirmed alert, not a manual refund', async () => {
    const db = cartDatabase();
    db.state.network.complete_cart_fulfillment = 'down';
    await expect(deliver(db)).rejects.toThrow();
    const unconfirmed = db.alerts.find(
      a => a.key === `refund-queue-unconfirmed-cart_overflow-${SESSION}`
    );
    expect(unconfirmed).toBeDefined();
    expect(instructsManualRefund(`${unconfirmed!.title}. ${unconfirmed!.html}`)).toBe(false);
  });
});
