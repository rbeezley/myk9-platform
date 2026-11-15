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
import type {
  CartItemWithDetails,
  CartWithDetails,
  NewCartItem,
  WaitlistEntryResult,
} from '@/store/cartStore';
import { PlainEntryError } from './entrySubmitErrorCopy';
import {
  describeSavedWaitlist,
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

    await expect(submit(deps)).resolves.toEqual({ kind: 'redirecting' });
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

  it('a 409 leaves the healed cart alone and opens /cart to review it', async () => {
    const deps = makeDeps();
    const message =
      'Entry fees were updated to current show pricing. Review your entry and try again.';
    deps.startCheckout.mockResolvedValue({ kind: 'failed', message, status: 409 });

    await expect(submit(deps)).resolves.toEqual({ kind: 'reviewOnCart', message });
    expect(deps.navigate).toHaveBeenCalledWith('/cart?showId=show-1');
    // Only the fill's own clear: the server-healed row is not thrown away.
    expect(deps.clearCart).toHaveBeenCalledTimes(1);
    expect(deps.abandonCart).not.toHaveBeenCalled();
  });

  it('a 500 still empties the cart and keeps her on the Payment step', async () => {
    const deps = makeDeps();
    deps.startCheckout.mockResolvedValue({
      kind: 'failed',
      message: 'We could not open the payment page, so nothing was charged. Try again.',
      status: 500,
    });

    await expect(submit(deps)).rejects.toThrow('We could not open the payment page');
    expect(deps.clearCart).toHaveBeenCalledTimes(2);
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

    await expect(submit(deps)).resolves.toEqual({ kind: 'navigated' });
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

describe('a mixed entry whose payment does not start after a wait list is saved', () => {
  // A cart in memory, filled and emptied the way the store does it.
  function makeMixedEntry() {
    let items: CartItemWithDetails[] = [];
    let nextId = 1;
    const waitlistRows = new Map<string, WaitlistEntryResult>();
    const className: Record<string, string> = {
      'class-open': 'Novice Interior',
      'class-full': 'Novice Container',
    };
    // Stands in for `add_to_waitlist`, which answers with the request it already
    // holds for a dog and class (20260629015413) instead of adding a second one.
    const addToWaitlist = vi.fn((classId: string, dogId: string) => {
      const key = `${classId}|${dogId}`;
      const row = waitlistRows.get(key) ?? {
        id: `wl-${waitlistRows.size + 1}`,
        class_id: classId,
        dog_id: dogId,
        exhibitor_id: 'profile-1',
        handler_id: null,
        position: 1,
        status: 'waiting',
      };
      waitlistRows.set(key, row);
      return row;
    });
    const getCart = () => ({ id: 'cart-1', show_id: 'show-1', items }) as CartWithDetails;
    const checkoutWithWaitlist = vi.fn(async (_exhibitorId: string, ids: Set<string>) => {
      const confirmed: string[] = [];
      const waitlisted: WaitlistEntryResult[] = [];
      for (const item of items) {
        if (!ids.has(item.id)) {
          confirmed.push(item.class_id);
          continue;
        }
        waitlisted.push({
          ...addToWaitlist(item.class_id, item.dog_id),
          className: item.class?.name,
        });
      }
      return { confirmed, waitlisted };
    });
    const removeItem = vi.fn(async (itemId: string) => {
      items = items.filter(item => item.id !== itemId);
      return true;
    });
    const deps = {
      ...makeDeps(),
      clearCart: vi.fn(async () => {
        items = [];
        return true;
      }),
      addItem: vi.fn(async (line: NewCartItem) => {
        items.push({
          id: `item-${nextId++}`,
          cart_id: 'cart-1',
          dog_id: line.dogId,
          class_id: line.classId,
          entry_fee_cents: line.entryFeeCents,
          class: { name: className[line.classId] },
        } as CartItemWithDetails);
        return true;
      }),
      startCheckout: vi.fn(() =>
        startWizardCardCheckout({
          showId: 'show-1',
          exhibitorProfileId: 'profile-1',
          getCart,
          checkoutWithWaitlist,
          removeItem,
        })
      ),
    };
    const submitMixed = () =>
      submitRegistrationCartCheckout({
        showId: 'show-1',
        ownerResolution: { ok: true, ownerId: 'people-1' },
        exhibitorProfileId: 'profile-1',
        classSelections: [
          {
            dogId: 'dog-1',
            trialId: 'trial-1',
            selectedClasses: [{ classId: 'class-open' }, { classId: 'class-full' }],
          },
        ],
        handlerAssignments: {},
        classes: [{ id: 'class-open' }, { id: 'class-full' }],
        showFeeInfo: { preEntryFee: '25', startDate: '2099-05-01' },
        deps,
      });
    return { deps, submitMixed, addToWaitlist, waitlistRows, getItems: () => items };
  }

  beforeEach(() => {
    sessionStorage.clear();
    createEntryCheckoutSessionMock.mockReset();
    fetchCartCapacityMock.mockReset().mockResolvedValue({
      judgeDays: [],
      classSpots: [
        { classId: 'class-open', availableSpots: 5 },
        { classId: 'class-full', availableSpots: 0 },
      ],
      waitlistClassIds: ['class-full'],
    });
  });

  it('says the wait list is saved, sends no amount, and a retry adds no second request', async () => {
    createEntryCheckoutSessionMock.mockRejectedValueOnce(
      new CheckoutSessionError('This club cannot take card payments yet.', 403, null, true)
    );
    const entry = makeMixedEntry();

    const first = entry.submitMixed();
    await expect(first).rejects.toBeInstanceOf(PlainEntryError);
    await expect(first).rejects.toThrow(
      'Your waitlist request for Novice Container is saved. Payment for the other classes did not start. This club cannot take card payments yet.'
    );
    // Only the cart id and show travel; the server prices the cart row.
    expect(createEntryCheckoutSessionMock).toHaveBeenCalledWith('cart-1', {
      showId: 'show-1',
      splitCheckoutId: expect.any(String),
    });
    expect(entry.getItems()).toEqual([]);

    createEntryCheckoutSessionMock.mockResolvedValueOnce(undefined);
    await expect(entry.submitMixed()).resolves.toEqual({ kind: 'redirecting' });

    // The retry re-sends the same dog and class, and the server answers with the
    // request it already holds: one wait-list request, never two.
    expect(entry.addToWaitlist).toHaveBeenCalledTimes(2);
    expect(entry.addToWaitlist).toHaveBeenNthCalledWith(2, 'class-full', 'dog-1');
    expect(entry.waitlistRows.size).toBe(1);
    expect(createEntryCheckoutSessionMock).toHaveBeenCalledTimes(2);
    expect(createEntryCheckoutSessionMock).toHaveBeenLastCalledWith('cart-1', {
      showId: 'show-1',
      splitCheckoutId: expect.any(String),
    });
    // Only the open class is left to pay for.
    expect(entry.getItems().map(item => item.class_id)).toEqual(['class-open']);
  });

  it('a payment failure with nothing waitlisted shows only the payment copy', async () => {
    fetchCartCapacityMock.mockResolvedValue({
      judgeDays: [],
      classSpots: [],
      waitlistClassIds: [],
    });
    createEntryCheckoutSessionMock.mockRejectedValueOnce(
      new CheckoutSessionError('This club cannot take card payments yet.', 403, null, true)
    );
    const entry = makeMixedEntry();

    const outcome = entry.submitMixed();
    await expect(outcome).rejects.toThrow(/^This club cannot take card payments yet\.$/);
    expect(entry.addToWaitlist).not.toHaveBeenCalled();
  });
});

describe('describeSavedWaitlist', () => {
  const row = (className?: string): WaitlistEntryResult => ({
    id: 'wl',
    class_id: 'c',
    dog_id: 'd',
    exhibitor_id: 'e',
    handler_id: null,
    position: 1,
    status: 'waiting',
    className,
  });

  it('names every class in plain words', () => {
    expect(describeSavedWaitlist([row('Novice Container'), row('Novice Exterior')])).toBe(
      'Your waitlist requests for Novice Container and Novice Exterior are saved. Payment for the other classes did not start.'
    );
    expect(describeSavedWaitlist([row()])).toBe(
      'Your waitlist request is saved. Payment for the other classes did not start.'
    );
  });
});
