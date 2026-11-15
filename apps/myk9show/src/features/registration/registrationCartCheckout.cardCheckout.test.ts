/**
 * MYK9-1964: with card selected, the wizard goes straight to Stripe through the
 * checkout /cart runs, and every failure that leaves nothing filed keeps the
 * exhibitor on the Payment step with no cart left behind.
 */
import { describe, expect, it, vi } from 'vitest';
import { CheckoutSessionError } from '@/lib/stripe';
import { CART_ERROR } from '@/pages/cartErrorCopy';
import { CART_CHECKOUT_COPY } from '@/features/payments/runCartCheckout';
import type { CartItemWithDetails, CartWithDetails } from '@/store/cartStore.types';
import { PlainEntryError } from './entrySubmitErrorCopy';
import { submitRegistrationCartCheckout } from './registrationCartCheckout';
import { stubCardCheckoutDeps } from './registrationCartCheckout.testHelpers';

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function line(id: string, classId: string): CartItemWithDetails {
  return {
    id,
    cart_id: 'cart-1',
    dog_id: 'dog-1',
    class_id: classId,
    entry_id: null,
    entry_fee_cents: 2500,
    class: { id: classId, name: `Class ${classId}`, level: 'Novice', trial_id: 'trial-1' },
  } as unknown as CartItemWithDetails;
}

function makeDeps(items: CartItemWithDetails[] = [line('item-1', 'class-1')]) {
  const order: string[] = [];
  const stub = stubCardCheckoutDeps();
  stub.getCart.mockReturnValue({
    id: 'cart-1',
    show_id: 'show-1',
    items,
  } as unknown as CartWithDetails);
  stub.checkout.createCheckoutSession.mockImplementation(async () => {
    order.push('createCheckoutSession');
  });
  return {
    order,
    deps: {
      clearCart: vi.fn(async () => {
        order.push('clearCart');
        return true;
      }),
      ensureCart: vi.fn().mockResolvedValue({ kind: 'ready', cart: { id: 'cart-1', items: [] } }),
      addItem: vi.fn(async () => {
        order.push('addItem');
        return true;
      }),
      abandonCart: vi.fn().mockResolvedValue(true),
      navigate: vi.fn(),
      ...stub,
    },
  };
}

function submit(deps: ReturnType<typeof makeDeps>['deps']) {
  return submitRegistrationCartCheckout({
    showId: 'show-1',
    ownerResolution: { ok: true, ownerId: 'people-1' },
    exhibitorProfileId: 'profile-1',
    classSelections: [
      { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
    ],
    handlerAssignments: {},
    classes: [{ id: 'class-1', entryFee: 25 }],
    showFeeInfo: { preEntryFee: '25', startDate: '2099-05-01' },
    deps,
  });
}

/** A capacity read where `classId` is full and takes a wait list. */
function fullWithWaitlist(classId: string) {
  return {
    isError: false,
    data: {
      judgeDays: [],
      classSpots: [{ classId, availableSpots: 0 }],
      waitlistClassIds: [classId],
    },
  };
}

describe('submitRegistrationCartCheckout: card goes straight to Stripe (MYK9-1964)', () => {
  it('asks for a session with the cart id only, after the cart is refilled', async () => {
    const { deps, order } = makeDeps();

    await expect(submit(deps)).resolves.toEqual({ kind: 'redirecting' });

    // The server prices the cart ROW: the call carries its id and the show for
    // the cancel return, and nothing that could be read as an amount.
    expect(deps.checkout.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(deps.checkout.createCheckoutSession).toHaveBeenCalledWith('cart-1', {
      showId: 'show-1',
    });
    const [, options] = deps.checkout.createCheckoutSession.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(Object.keys(options)).toEqual(['showId']);
    // Cleared and refilled from the wizard's selections first, as before.
    expect(order).toEqual(['clearCart', 'addItem', 'createCheckoutSession']);
    // Fresh capacity, never the snapshot: the same re-check /cart runs.
    expect(deps.checkout.refetchCapacity).toHaveBeenCalledTimes(1);
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.abandonCart).not.toHaveBeenCalled();
  });

  it('stays on the step with the server sentence and no cart when Stripe refuses', async () => {
    const { deps } = makeDeps();
    const refusal = "This club's payment account is not set up to receive online entry fees.";
    deps.checkout.createCheckoutSession.mockRejectedValue(
      new CheckoutSessionError(refusal, 403, null, true)
    );

    const caught = await submit(deps).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(PlainEntryError);
    expect((caught as Error).message).toBe(refusal);
    expect(deps.abandonCart).toHaveBeenCalledTimes(1);
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('says the fixed sentence for a failure the server did not word', async () => {
    const { deps } = makeDeps();
    deps.checkout.createCheckoutSession.mockRejectedValue(new Error('network down'));

    await expect(submit(deps)).rejects.toThrow(CART_ERROR.checkoutFailed);
    expect(deps.abandonCart).toHaveBeenCalledTimes(1);
  });

  it('never opens Stripe when class availability cannot be confirmed', async () => {
    const { deps } = makeDeps();
    deps.checkout.refetchCapacity.mockResolvedValue({ isError: true });

    await expect(submit(deps)).rejects.toThrow(CART_CHECKOUT_COPY.capacityUnconfirmed);
    expect(deps.checkout.checkoutWithWaitlist).not.toHaveBeenCalled();
    expect(deps.checkout.createCheckoutSession).not.toHaveBeenCalled();
    expect(deps.abandonCart).toHaveBeenCalledTimes(1);
  });

  it('refuses a full class that takes no wait list, naming it', async () => {
    const { deps } = makeDeps();
    deps.checkout.refetchCapacity.mockResolvedValue({
      isError: false,
      data: {
        judgeDays: [],
        classSpots: [{ classId: 'class-1', availableSpots: 0 }],
        waitlistClassIds: [],
      },
    });

    await expect(submit(deps)).rejects.toThrow(/Class class-1: This class has no spots left/);
    expect(deps.checkout.createCheckoutSession).not.toHaveBeenCalled();
    expect(deps.abandonCart).toHaveBeenCalledTimes(1);
  });

  it('sends her to the wait-list confirmation when every class is full with a wait list', async () => {
    const { deps } = makeDeps();
    deps.checkout.refetchCapacity.mockResolvedValue(fullWithWaitlist('class-1'));
    deps.checkout.checkoutWithWaitlist.mockResolvedValue({
      confirmed: [],
      waitlisted: [{ id: 'wl-1', position: 1 }],
    });

    await expect(submit(deps)).resolves.toEqual({ kind: 'navigated' });
    expect(deps.checkout.removeItem).toHaveBeenCalledWith('item-1');
    expect(deps.navigate).toHaveBeenCalledWith(
      expect.stringMatching(/^\/checkout\/success\?waitlist=1&split=/)
    );
    expect(deps.checkout.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('keeps the cart and sends her to /cart when Stripe fails after a wait-list request was filed', async () => {
    const { deps } = makeDeps([line('item-1', 'class-1'), line('item-2', 'class-2')]);
    deps.checkout.refetchCapacity.mockResolvedValue(fullWithWaitlist('class-2'));
    deps.checkout.checkoutWithWaitlist.mockResolvedValue({
      confirmed: ['class-1'],
      waitlisted: [{ id: 'wl-2', position: 1 }],
    });
    deps.checkout.createCheckoutSession.mockRejectedValue(new Error('network down'));

    await expect(submit(deps)).resolves.toEqual({
      kind: 'sentToCart',
      message: CART_ERROR.checkoutFailed,
    });
    // Abandoning would lose the line still to pay; a wizard retry would file
    // the same wait-list request twice.
    expect(deps.abandonCart).not.toHaveBeenCalled();
    expect(deps.navigate).toHaveBeenCalledWith('/cart?showId=show-1');
  });

  it('stops before checkout when the store holds no cart for this show', async () => {
    const { deps } = makeDeps();
    deps.getCart.mockReturnValue(null as unknown as CartWithDetails);

    await expect(submit(deps)).rejects.toThrow('The entry was not ready for payment.');
    expect(deps.checkout.createCheckoutSession).not.toHaveBeenCalled();
  });
});
