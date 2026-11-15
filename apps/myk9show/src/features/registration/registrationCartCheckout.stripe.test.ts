/**
 * MYK9-1964: the wizard's card Pay fills the cart and opens Stripe through the
 * same `startCartCheckout` /cart's Pay runs. A checkout that does not start
 * leaves no lines behind; the wizard keeps the selections.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createEntryCheckoutSessionMock = vi.hoisted(() => vi.fn());
const fetchCartCapacityMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe', async () => ({
  ...(await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe')),
  createEntryCheckoutSession: createEntryCheckoutSessionMock,
}));
vi.mock('@/hooks/queries/useCartCapacity', () => ({
  fetchCartCapacity: fetchCartCapacityMock,
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { CAPACITY_UNCONFIRMED_MESSAGE } from '@/features/payments/startCartCheckout';
import { CheckoutSessionError } from '@/lib/stripe';
import type { CartItemWithDetails, CartWithDetails } from '@/store/cartStore';
import { PlainEntryError } from './entrySubmitErrorCopy';
import {
  startWizardCardCheckout,
  submitRegistrationCartCheckout,
} from './registrationCartCheckout';

function makeDeps() {
  return {
    clearCart: vi.fn().mockResolvedValue(true),
    ensureCart: vi.fn().mockResolvedValue({ kind: 'ready', cart: { id: 'cart-1', items: [] } }),
    addItem: vi.fn().mockResolvedValue(true),
    abandonCart: vi.fn().mockResolvedValue(true),
    startCheckout: vi.fn().mockResolvedValue({ kind: 'redirecting' }),
    navigate: vi.fn(),
  };
}

function submit(deps: ReturnType<typeof makeDeps>) {
  return submitRegistrationCartCheckout({
    showId: 'show-1',
    ownerResolution: { ok: true, ownerId: 'people-1' },
    exhibitorProfileId: 'profile-1',
    classSelections: [
      { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
    ],
    handlerAssignments: {},
    classes: [{ id: 'class-1' }],
    showFeeInfo: { preEntryFee: '25', startDate: '2099-05-01' },
    deps,
  });
}

describe('submitRegistrationCartCheckout opens Stripe (MYK9-1964)', () => {
  it('opens checkout once, after every line is in the cart', async () => {
    const deps = makeDeps();
    const order: string[] = [];
    deps.addItem.mockImplementation(async () => {
      order.push('addItem');
      return true;
    });
    deps.startCheckout.mockImplementation(async () => {
      order.push('startCheckout');
      return { kind: 'redirecting' };
    });

    await expect(submit(deps)).resolves.toBe('redirecting');
    expect(order).toEqual(['addItem', 'startCheckout']);
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('empties the cart it filled when checkout does not start, and says why', async () => {
    const deps = makeDeps();
    deps.startCheckout.mockResolvedValue({
      kind: 'failed',
      message: 'This club cannot take card payments yet.',
      status: 403,
    });

    const outcome = submit(deps);
    await expect(outcome).rejects.toBeInstanceOf(PlainEntryError);
    await expect(outcome).rejects.toThrow('This club cannot take card payments yet.');
    // Once to start the fill, once to roll it back.
    expect(deps.clearCart).toHaveBeenCalledTimes(2);
    expect(deps.abandonCart).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('abandons the cart when the roll-back clear itself fails', async () => {
    const deps = makeDeps();
    deps.clearCart.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    deps.startCheckout.mockResolvedValue({ kind: 'failed', message: 'No.', status: null });

    await expect(submit(deps)).rejects.toThrow('No.');
    expect(deps.abandonCart).toHaveBeenCalledTimes(1);
  });

  it('goes where checkout says when every line went to a wait list', async () => {
    const deps = makeDeps();
    deps.startCheckout.mockResolvedValue({
      kind: 'waitlistOnly',
      path: '/checkout/success?waitlist=1',
    });

    await expect(submit(deps)).resolves.toBe('navigated');
    expect(deps.navigate).toHaveBeenCalledWith('/checkout/success?waitlist=1');
    expect(deps.clearCart).toHaveBeenCalledTimes(1);
  });
});

function cartFor(showId: string): CartWithDetails {
  const item = {
    id: 'item-1',
    cart_id: 'cart-1',
    dog_id: 'dog-1',
    class_id: 'class-1',
    entry_fee_cents: 2500,
  } as CartItemWithDetails;
  return { id: 'cart-1', show_id: showId, items: [item] } as CartWithDetails;
}

describe('startWizardCardCheckout', () => {
  beforeEach(() => {
    createEntryCheckoutSessionMock.mockReset().mockResolvedValue(undefined);
    fetchCartCapacityMock
      .mockReset()
      .mockResolvedValue({ judgeDays: [], classSpots: [], waitlistClassIds: [] });
  });

  const run = (cart: CartWithDetails | null) =>
    startWizardCardCheckout({
      showId: 'show-1',
      exhibitorProfileId: 'profile-1',
      getCart: () => cart,
      checkoutWithWaitlist: vi.fn().mockResolvedValue({ confirmed: ['class-1'], waitlisted: [] }),
      removeItem: vi.fn().mockResolvedValue(true),
    });

  it("creates the session /cart creates: the cart's id and show, never an amount", async () => {
    await expect(run(cartFor('show-1'))).resolves.toEqual({ kind: 'redirecting' });
    expect(fetchCartCapacityMock).toHaveBeenCalledWith('show-1');
    expect(createEntryCheckoutSessionMock).toHaveBeenCalledTimes(1);
    expect(createEntryCheckoutSessionMock).toHaveBeenCalledWith('cart-1', { showId: 'show-1' });
  });

  it('fails closed when availability cannot be read', async () => {
    fetchCartCapacityMock.mockRejectedValue(new Error('rpc down'));
    await expect(run(cartFor('show-1'))).resolves.toEqual({
      kind: 'failed',
      message: CAPACITY_UNCONFIRMED_MESSAGE,
      status: null,
    });
    expect(createEntryCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("refuses a store cart that is not this show's", async () => {
    await expect(run(cartFor('show-other'))).resolves.toMatchObject({ kind: 'failed' });
    await expect(run(null)).resolves.toMatchObject({ kind: 'failed' });
    expect(createEntryCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("passes the server's own words and status back when the session is refused", async () => {
    createEntryCheckoutSessionMock.mockRejectedValue(
      new CheckoutSessionError('This club cannot take card payments yet.', 403, null, true)
    );
    await expect(run(cartFor('show-1'))).resolves.toEqual({
      kind: 'failed',
      message: 'This club cannot take card payments yet.',
      status: 403,
    });
  });
});
