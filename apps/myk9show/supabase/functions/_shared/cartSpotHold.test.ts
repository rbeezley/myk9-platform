// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  CART_SPOT_HOLD_SECONDS,
  CartHoldRefusedError,
  CartHoldUnavailableError,
  attachCartSpotHolds,
  cartSpotHoldUntilEpoch,
  createSessionUnderHold,
  describeRefusedLines,
  epochToIso,
  holdCartSpots,
  releaseCartSpotHolds,
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

describe('holdCartSpots', () => {
  it('asks hold_cart_spots for the cart, the expiry and the session', async () => {
    const { client, rpc } = rpcClient({
      hold_cart_spots: { data: [{ outcome: 'held' }, { outcome: 'held' }], error: null },
    });
    expect(await holdCartSpots(client, 'cart-1', HOLD_UNTIL, 'cs_1')).toEqual({
      kind: 'held',
      heldCount: 2,
    });
    expect(rpc).toHaveBeenCalledWith('hold_cart_spots', {
      p_cart_id: 'cart-1',
      p_expires_at: epochToIso(HOLD_UNTIL),
      p_checkout_session_id: 'cs_1',
    });
  });

  it('returns only the refused lines when any line has no room', async () => {
    const { client } = rpcClient({
      hold_cart_spots: { data: [{ outcome: 'refused', ...zivaFull }], error: null },
    });
    expect(await holdCartSpots(client, 'cart-1', HOLD_UNTIL)).toEqual({
      kind: 'refused',
      lines: [zivaFull],
    });
  });

  it('reports a database error instead of reading it as held', async () => {
    const { client } = rpcClient({
      hold_cart_spots: { data: null, error: { message: 'boom' } },
    });
    expect(await holdCartSpots(client, 'cart-1', HOLD_UNTIL)).toEqual({
      kind: 'error',
      message: 'boom',
    });
  });
});

describe('createSessionUnderHold: hold first, then a page that ends with the hold', () => {
  it('opens the page with the hold expiry, after the hold is taken', async () => {
    const { client, rpc } = rpcClient({
      hold_cart_spots: { data: [{ outcome: 'held' }], error: null },
    });
    const create = vi.fn(async (expiresAtEpoch: number) => ({ id: 'cs_new', expiresAtEpoch }));

    const session = await createSessionUnderHold(client, 'cart-1', HOLD_UNTIL, create);

    expect(session).toEqual({ id: 'cs_new', expiresAtEpoch: HOLD_UNTIL });
    expect(rpc).toHaveBeenCalledWith(
      'hold_cart_spots',
      expect.objectContaining({ p_expires_at: epochToIso(HOLD_UNTIL) })
    );
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]!);
  });

  it('never opens a page when a line has no room', async () => {
    const { client } = rpcClient({
      hold_cart_spots: { data: [{ outcome: 'refused', ...zivaFull }], error: null },
    });
    const create = vi.fn();

    const attempt = createSessionUnderHold(client, 'cart-1', HOLD_UNTIL, create);

    await expect(attempt).rejects.toBeInstanceOf(CartHoldRefusedError);
    await expect(attempt).rejects.toMatchObject({ lines: [zivaFull] });
    expect(create).not.toHaveBeenCalled();
  });

  it('never opens a page when the hold could not be taken', async () => {
    const { client } = rpcClient({ hold_cart_spots: { data: null, error: { message: 'down' } } });
    const create = vi.fn();
    await expect(
      createSessionUnderHold(client, 'cart-1', HOLD_UNTIL, create)
    ).rejects.toBeInstanceOf(CartHoldUnavailableError);
    expect(create).not.toHaveBeenCalled();
  });

  it('gives the spots back when the page fails to open', async () => {
    const { client, rpc } = rpcClient({
      hold_cart_spots: { data: [{ outcome: 'held' }], error: null },
    });
    const create = vi.fn(async () => {
      throw new Error('stripe down');
    });

    await expect(createSessionUnderHold(client, 'cart-1', HOLD_UNTIL, create)).rejects.toThrow(
      'stripe down'
    );
    expect(rpc).toHaveBeenCalledWith('release_cart_spot_holds', {
      p_cart_id: 'cart-1',
      p_reason: 'checkout_failed',
    });
  });
});

describe('attach and release', () => {
  it('ties the holds to the page with the expiry Stripe returned', async () => {
    const { client, rpc } = rpcClient({});
    expect(await attachCartSpotHolds(client, 'cart-1', 'cs_1', HOLD_UNTIL + 7)).toEqual({
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith('attach_cart_spot_holds', {
      p_cart_id: 'cart-1',
      p_checkout_session_id: 'cs_1',
      p_expires_at: epochToIso(HOLD_UNTIL + 7),
    });
  });

  it('surfaces a failed attach or release', async () => {
    const { client } = rpcClient({
      attach_cart_spot_holds: { data: null, error: { message: 'nope' } },
      release_cart_spot_holds: { data: null, error: { message: 'nope' } },
    });
    expect(await attachCartSpotHolds(client, 'cart-1', 'cs_1', HOLD_UNTIL)).toEqual({
      error: 'nope',
    });
    expect(await releaseCartSpotHolds(client, 'cart-1')).toEqual({ error: 'nope' });
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
