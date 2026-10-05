// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  CART_SPOT_HOLD_SECONDS,
  CartHoldRefusedError,
  CartHoldUnavailableError,
  cartSpotHoldUntilEpoch,
  claimCartCheckout,
  createSessionUnderHold,
  describeRefusedLines,
  endCartCheckout,
  epochToIso,
  holdCartSpots,
  linkCartCheckout,
  type CartLease,
  type HoldRpcClient,
  type RefusedCartLine,
} from './cartSpotHold';

type RpcAnswer = { data: unknown; error: { message?: string } | null };

function rpcClient(answers: Record<string, RpcAnswer>) {
  const rpc = vi.fn(async (fn: string, _args: Record<string, unknown>) => {
    return answers[fn] ?? { data: null, error: null };
  });
  return { client: { rpc } as HoldRpcClient, rpc };
}

const HOLD_UNTIL = 1_800_000_000;
const lease: CartLease = { cartId: 'cart-1', leaseId: 'lease-1' };

const zivaFull: RefusedCartLine = {
  cart_item_id: 'item-ziva',
  class_id: 'class-container',
  dog_id: 'dog-ziva',
  allow_waitlist: false,
  denial_reason: null,
};

const items = [
  { id: 'item-ziva', dog: { call_name: 'Ziva' }, class: { name: 'Novice Container' } },
  { id: 'item-rex', dog: { call_name: 'Rex' }, class: { name: 'Advanced Interior' } },
];

describe('the hold window', () => {
  it('lasts 31 minutes: Stripe refuses an exact 30:00 measured after the network hop', () => {
    expect(CART_SPOT_HOLD_SECONDS).toBe(31 * 60);
    expect(cartSpotHoldUntilEpoch(1_000_000_000_500)).toBe(1_000_000_000 + 31 * 60);
  });
});

describe('the checkout lease: one checkout per cart', () => {
  it('claims the cart for this request', async () => {
    const { client, rpc } = rpcClient({
      claim_cart_checkout: { data: [{ outcome: 'claimed' }], error: null },
    });
    expect(await claimCartCheckout(client, lease)).toEqual({ kind: 'claimed' });
    expect(rpc).toHaveBeenCalledWith('claim_cart_checkout', {
      p_cart_id: 'cart-1',
      p_lease_id: 'lease-1',
    });
  });

  it('reports a checkout already in progress instead of starting a second one', async () => {
    const { client } = rpcClient({
      claim_cart_checkout: { data: [{ outcome: 'in_progress' }], error: null },
    });
    expect(await claimCartCheckout(client, lease)).toEqual({ kind: 'in_progress' });
  });

  it('never reads an unreadable answer as claimed', async () => {
    const down = rpcClient({ claim_cart_checkout: { data: null, error: { message: 'down' } } });
    expect(await claimCartCheckout(down.client, lease)).toEqual({ kind: 'error', message: 'down' });
    const odd = rpcClient({ claim_cart_checkout: { data: [], error: null } });
    expect((await claimCartCheckout(odd.client, lease)).kind).toBe('error');
  });

  it('ends the checkout with the same lease', async () => {
    const { client, rpc } = rpcClient({ end_cart_checkout: { data: true, error: null } });
    expect(await endCartCheckout(client, lease)).toEqual({ error: null });
    expect(rpc).toHaveBeenCalledWith('end_cart_checkout', {
      p_cart_id: 'cart-1',
      p_lease_id: 'lease-1',
    });
  });
});

describe('holdCartSpots', () => {
  it('asks hold_cart_spots under the lease, for the expiry and the page', async () => {
    const { client, rpc } = rpcClient({
      hold_cart_spots: { data: [{ outcome: 'held' }, { outcome: 'held' }], error: null },
    });
    expect(await holdCartSpots(client, lease, HOLD_UNTIL, 'cs_1')).toEqual({
      kind: 'held',
      heldCount: 2,
    });
    expect(rpc).toHaveBeenCalledWith('hold_cart_spots', {
      p_cart_id: 'cart-1',
      p_lease_id: 'lease-1',
      p_expires_at: epochToIso(HOLD_UNTIL),
      p_checkout_session_id: 'cs_1',
    });
  });

  it('returns only the refused lines when any line has no room', async () => {
    const { client } = rpcClient({
      hold_cart_spots: { data: [{ outcome: 'refused', ...zivaFull }], error: null },
    });
    expect(await holdCartSpots(client, lease, HOLD_UNTIL)).toEqual({
      kind: 'refused',
      lines: [zivaFull],
    });
  });

  it('reports a database error (a lapsed lease included) instead of reading it as held', async () => {
    const { client } = rpcClient({
      hold_cart_spots: { data: null, error: { message: 'no live checkout lease' } },
    });
    expect(await holdCartSpots(client, lease, HOLD_UNTIL)).toEqual({
      kind: 'error',
      message: 'no live checkout lease',
    });
  });
});

describe('createSessionUnderHold: hold first, then a page that ends with the hold', () => {
  it('opens the page with the hold expiry, after the hold is taken', async () => {
    const { client, rpc } = rpcClient({
      hold_cart_spots: { data: [{ outcome: 'held' }], error: null },
    });
    const create = vi.fn(async (expiresAtEpoch: number) => ({ id: 'cs_new', expiresAtEpoch }));

    const created = await createSessionUnderHold(client, lease, HOLD_UNTIL, create);

    expect(created).toEqual({
      session: { id: 'cs_new', expiresAtEpoch: HOLD_UNTIL },
      heldCount: 1,
    });
    expect(rpc).toHaveBeenCalledWith(
      'hold_cart_spots',
      expect.objectContaining({ p_lease_id: 'lease-1', p_expires_at: epochToIso(HOLD_UNTIL) })
    );
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]!);
  });

  it('never opens a page when a line has no room', async () => {
    const { client } = rpcClient({
      hold_cart_spots: { data: [{ outcome: 'refused', ...zivaFull }], error: null },
    });
    const create = vi.fn();

    const refused = createSessionUnderHold(client, lease, HOLD_UNTIL, create);

    await expect(refused).rejects.toBeInstanceOf(CartHoldRefusedError);
    await expect(refused).rejects.toMatchObject({ lines: [zivaFull] });
    expect(create).not.toHaveBeenCalled();
  });

  it('never opens a page when the hold could not be taken', async () => {
    const { client } = rpcClient({ hold_cart_spots: { data: null, error: { message: 'down' } } });
    const create = vi.fn();
    await expect(createSessionUnderHold(client, lease, HOLD_UNTIL, create)).rejects.toBeInstanceOf(
      CartHoldUnavailableError
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe('linkCartCheckout: link and tie in one call', () => {
  const link = {
    sessionId: 'cs_1',
    sessionExpiresAtEpoch: HOLD_UNTIL + 7,
    expectedUpdatedAt: '2026-10-05T00:00:00.123456+00:00',
    heldCount: 2,
    subtotalCents: 6000,
    platformFeeCents: 420,
    totalCents: 6420,
  };

  it('sends the page, its expiry, the cart stamp and the held count under the lease', async () => {
    const { client, rpc } = rpcClient({ link_cart_checkout: { data: 'linked', error: null } });
    expect(await linkCartCheckout(client, lease, link)).toEqual({ kind: 'linked' });
    expect(rpc).toHaveBeenCalledWith('link_cart_checkout', {
      p_cart_id: 'cart-1',
      p_lease_id: 'lease-1',
      p_checkout_session_id: 'cs_1',
      p_expires_at: epochToIso(HOLD_UNTIL + 7),
      p_expected_updated_at: '2026-10-05T00:00:00.123456+00:00',
      p_held_count: 2,
      p_subtotal_cents: 6000,
      p_platform_fee_cents: 420,
      p_total_cents: 6420,
    });
  });

  it('passes the refusals through and never reads an odd answer as linked', async () => {
    for (const answer of ['cart_changed', 'holds_lost'] as const) {
      const { client } = rpcClient({ link_cart_checkout: { data: answer, error: null } });
      expect(await linkCartCheckout(client, lease, link)).toEqual({ kind: answer });
    }
    const odd = rpcClient({ link_cart_checkout: { data: null, error: null } });
    expect((await linkCartCheckout(odd.client, lease, link)).kind).toBe('error');
    const down = rpcClient({ link_cart_checkout: { data: null, error: { message: 'lapsed' } } });
    expect(await linkCartCheckout(down.client, lease, link)).toEqual({
      kind: 'error',
      message: 'lapsed',
    });
  });
});

describe('describeRefusedLines: which dog, which class, nothing charged', () => {
  it('names the dog and the class, and asks to remove it when the class has no wait list', () => {
    expect(describeRefusedLines([zivaFull], items)).toBe(
      'Novice Container just filled, so nothing was charged. Remove Ziva from Novice Container to continue.'
    );
  });

  it('offers the wait list when the class has one', () => {
    expect(describeRefusedLines([{ ...zivaFull, allow_waitlist: true }], items)).toBe(
      'Novice Container just filled, so nothing was charged. Ziva can join its wait list, or you can remove Ziva from Novice Container.'
    );
  });

  it('does not call a refused re-entry a full class', () => {
    expect(
      describeRefusedLines(
        [{ ...zivaFull, denial_reason: 'dog was withdrawn or pulled from this class' }],
        items
      )
    ).toBe(
      "Ziva can't be entered in Novice Container online, so nothing was charged. Remove Ziva from Novice Container to continue."
    );
  });

  it('lists every refused line', () => {
    const rex: RefusedCartLine = { ...zivaFull, cart_item_id: 'item-rex', allow_waitlist: true };
    expect(describeRefusedLines([zivaFull, rex], items)).toBe(
      'Spots just filled for Ziva in Novice Container, Rex in Advanced Interior, so nothing was charged. Your cart shows which can join a wait list; remove the others to continue.'
    );
    expect(describeRefusedLines([zivaFull, { ...rex, allow_waitlist: false }], items)).toBe(
      'Spots just filled for Ziva in Novice Container, Rex in Advanced Interior, so nothing was charged. Remove them from your cart to continue.'
    );
  });

  it('still reads when the names are missing', () => {
    expect(describeRefusedLines([zivaFull], [])).toBe(
      'The class just filled, so nothing was charged. Remove your dog from the class to continue.'
    );
  });

  it('never mentions a hold to the exhibitor who lost the spot', () => {
    for (const lines of [[zivaFull], [{ ...zivaFull, allow_waitlist: true }]]) {
      expect(describeRefusedLines(lines, items)).not.toMatch(/\bhold|\bheld/i);
    }
  });
});
