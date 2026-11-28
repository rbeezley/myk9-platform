import { describe, expect, it, vi } from 'vitest';
import type { PriorSessionRelease } from '../_shared/cartClassGate';
import { findDriftedCartItems } from '../_shared/cartItemPricing';
import {
  CART_CHANGED_MESSAGE,
  healCartFees,
  type CartFeeHealResult,
  type HoldRpcClient,
} from '../_shared/cartSpotHold';
import {
  FEES_HEAL_FAILED_MESSAGE,
  FEES_HEALED_MESSAGE,
  feeHealResponse,
  healDriftedCart,
  type FeeHealDeps,
} from './cartFeeHeal';

function makeDeps(overrides: Partial<FeeHealDeps> = {}) {
  const order: string[] = [];
  const deps = {
    releasePriorSession: vi.fn(async (): Promise<PriorSessionRelease> => {
      order.push('release');
      return { kind: 'released' };
    }),
    applyHeal: vi.fn(async (): Promise<CartFeeHealResult> => {
      order.push('apply');
      return { kind: 'healed' };
    }),
    logError: vi.fn(),
    ...overrides,
  };
  return { deps, order };
}

const lines = [
  { itemId: 'item-1', authoritativeCents: 3000 },
  { itemId: 'item-2', authoritativeCents: 2500 },
];

describe('healDriftedCart', () => {
  it('retires the prior page, then applies every line in one call, and reports healed', async () => {
    const { deps, order } = makeDeps();
    expect(await healDriftedCart('cart-1', lines, deps)).toEqual({ kind: 'healed' });
    expect(deps.applyHeal).toHaveBeenCalledWith(lines);
    expect(order).toEqual(['release', 'apply']);
    expect(deps.logError).not.toHaveBeenCalled();
  });

  it.each([
    [409, 'Your payment for this entry is already processing.'],
    [503, 'We could not safely update your entry.'],
  ] as const)(
    'writes nothing when the prior page is not confirmed retired (%i)',
    async (status, error) => {
      const { deps } = makeDeps({
        releasePriorSession: vi.fn(async (): Promise<PriorSessionRelease> => ({
          kind: 'blocked',
          status,
          error,
          diagnostic: 'Checkout Session cs_1 is complete',
        })),
      });
      expect(await healDriftedCart('cart-1', lines, deps)).toEqual({
        kind: 'blocked',
        status,
        error,
      });
      expect(deps.applyHeal).not.toHaveBeenCalled();
    }
  );

  it('reports heal_failed, never healed, when the heal call errors', async () => {
    const { deps } = makeDeps({
      applyHeal: vi.fn(async (): Promise<CartFeeHealResult> => ({
        kind: 'error',
        message: 'statement timeout',
      })),
    });
    expect(await healDriftedCart('cart-1', lines, deps)).toEqual({ kind: 'heal_failed' });
    expect(deps.logError).toHaveBeenCalledWith(
      'Cart cart-1: could not heal the entry fees, nothing written:',
      'statement timeout'
    );
  });

  it.each(['lease_lost', 'cart_changed', 'session_moved'] as const)(
    'reports a cart that moved on (%s) as changed, never as healed',
    async reason => {
      const { deps } = makeDeps({
        applyHeal: vi.fn(async (): Promise<CartFeeHealResult> => ({ kind: 'refused', reason })),
      });
      expect(await healDriftedCart('cart-1', lines, deps)).toEqual({ kind: 'cart_changed' });
      expect(deps.logError).toHaveBeenCalledWith(
        'Cart cart-1: fee heal refused, nothing written:',
        reason
      );
    }
  );
});

describe('feeHealResponse', () => {
  it('answers each outcome with the status and message the cart page acts on', () => {
    expect(feeHealResponse({ kind: 'healed' })).toEqual({
      status: 409,
      body: { error: FEES_HEALED_MESSAGE },
    });
    expect(feeHealResponse({ kind: 'cart_changed' })).toEqual({
      status: 409,
      body: { error: CART_CHANGED_MESSAGE },
    });
    expect(feeHealResponse({ kind: 'heal_failed' })).toEqual({
      status: 500,
      body: { error: FEES_HEAL_FAILED_MESSAGE },
    });
    expect(feeHealResponse({ kind: 'blocked', status: 503, error: 'Try again.' })).toEqual({
      status: 503,
      body: { error: 'Try again.' },
    });
  });
});

// ---------------------------------------------------------------------------
// MYK9-2455: the heal is one database transaction. The fake below answers
// heal_cart_fees as the database does: it refuses unless this request still
// holds the cart's lease and the cart and its page are the ones it read, and
// otherwise writes every line, the totals and the cleared page link, or (when
// the transaction fails) nothing at all. The SQL itself is tested in
// supabase/tests/myk9_2455_heal_cart_fees_test.sql.
// ---------------------------------------------------------------------------

const AUTHORITATIVE = new Map([
  ['item-1', 3000],
  ['item-2', 2500],
]);
const FEE_CENTS = 385;

interface FakeCart {
  leaseId: string;
  updatedAt: string;
  sessionId: string | null;
  subtotalCents: number;
  totalCents: number;
  items: { id: string; entry_fee_cents: number }[];
}

function driftedCart(): FakeCart {
  return {
    leaseId: 'lease-1',
    updatedAt: 'stamp-1',
    sessionId: 'cs_old',
    subtotalCents: 4500,
    totalCents: 4815,
    items: [
      { id: 'item-1', entry_fee_cents: 2000 },
      { id: 'item-2', entry_fee_cents: 2500 },
    ],
  };
}

function fakeHealDb(cart: FakeCart) {
  const failures: string[] = [];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn !== 'heal_cart_fees') return { data: null, error: { message: `unexpected ${fn}` } };
    if (args.p_lease_id !== cart.leaseId) return { data: 'lease_lost', error: null };
    if (args.p_observed_session_id !== cart.sessionId) {
      return { data: 'session_moved', error: null };
    }
    if (args.p_expected_updated_at !== cart.updatedAt) return { data: 'cart_changed', error: null };
    const failure = failures.shift();
    if (failure) return { data: null, error: { message: failure } };
    for (const line of args.p_lines as { item_id: string; entry_fee_cents: number }[]) {
      const item = cart.items.find(candidate => candidate.id === line.item_id);
      if (item) item.entry_fee_cents = line.entry_fee_cents;
    }
    cart.subtotalCents = args.p_subtotal_cents as number;
    cart.totalCents = args.p_total_cents as number;
    cart.sessionId = null;
    cart.updatedAt = 'stamp-healed';
    return { data: 'healed', error: null };
  });
  return {
    client: { rpc } as HoldRpcClient,
    failNextCall: (message: string) => failures.push(message),
  };
}

/** One Pay click as stripe-checkout runs it: read the cart under the lease, then heal. */
async function payAttempt(
  db: HoldRpcClient,
  cart: FakeCart,
  leaseId: string,
  releasePriorSession: () => Promise<PriorSessionRelease> = async () => ({ kind: 'released' })
) {
  const read = {
    updatedAt: cart.updatedAt,
    sessionId: cart.sessionId,
    items: cart.items.map(item => ({ ...item })),
  };
  const drifted = findDriftedCartItems(read.items, AUTHORITATIVE);
  const subtotal = read.items.reduce((sum, item) => sum + (AUTHORITATIVE.get(item.id) ?? 0), 0);
  const outcome = await healDriftedCart(
    'cart-1',
    drifted.map(({ item, authoritativeCents }) => ({ itemId: item.id, authoritativeCents })),
    {
      releasePriorSession,
      applyHeal: healed =>
        healCartFees(
          db,
          { cartId: 'cart-1', leaseId },
          {
            expectedUpdatedAt: read.updatedAt,
            observedSessionId: read.sessionId,
            lines: healed,
            subtotalCents: subtotal,
            platformFeeCents: FEE_CENTS,
            totalCents: subtotal + FEE_CENTS,
          }
        ),
      logError: vi.fn(),
    }
  );
  return feeHealResponse(outcome);
}

describe('the heal is all or nothing under the lease (MYK9-2455)', () => {
  it('leaves the retry its new page when the lease expired mid-heal, and asks to try again', async () => {
    const cart = driftedCart();
    const db = fakeHealDb(cart);

    const response = await payAttempt(db.client, cart, 'lease-1', async () => {
      // A slow Stripe call outlives the 90-second lease: the exhibitor's retry
      // claims the cart and links a new page before this request writes.
      cart.leaseId = 'lease-2';
      cart.sessionId = 'cs_retry';
      cart.updatedAt = 'stamp-2';
      return { kind: 'released' };
    });

    expect(response).toEqual({ status: 409, body: { error: CART_CHANGED_MESSAGE } });
    expect(cart.sessionId).toBe('cs_retry');
    expect(cart.items).toEqual(driftedCart().items);
    expect(cart.subtotalCents).toBe(4500);
  });

  it('writes nothing when the heal fails, so the retry still finds the drift and heals it', async () => {
    const cart = driftedCart();
    const db = fakeHealDb(cart);
    db.failNextCall('could not write the cart totals');

    expect(await payAttempt(db.client, cart, 'lease-1')).toEqual({
      status: 500,
      body: { error: FEES_HEAL_FAILED_MESSAGE },
    });
    expect(cart).toEqual(driftedCart());
    expect(findDriftedCartItems(cart.items, AUTHORITATIVE)).toHaveLength(1);

    // The exhibitor clicks Pay again: a new request, a new lease.
    cart.leaseId = 'lease-retry';
    expect(await payAttempt(db.client, cart, 'lease-retry')).toEqual({
      status: 409,
      body: { error: FEES_HEALED_MESSAGE },
    });
    expect(cart.items).toEqual([
      { id: 'item-1', entry_fee_cents: 3000 },
      { id: 'item-2', entry_fee_cents: 2500 },
    ]);
    expect(cart.subtotalCents).toBe(5500);
    expect(cart.totalCents).toBe(5500 + FEE_CENTS);
    expect(cart.sessionId).toBeNull();
    expect(findDriftedCartItems(cart.items, AUTHORITATIVE)).toEqual([]);
  });
});
