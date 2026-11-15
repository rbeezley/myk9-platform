import { describe, expect, it, vi } from 'vitest';
import type { CartItemWithDetails } from '@/store/cartStore.types';
import { CART_CHECKOUT_COPY, runCartCheckout } from './runCartCheckout';

function line(id: string, classId: string, entryId: string | null = null): CartItemWithDetails {
  return {
    id,
    cart_id: 'cart-1',
    dog_id: 'dog-1',
    class_id: classId,
    entry_id: entryId,
    entry_fee_cents: 2500,
    class: { id: classId, name: classId, level: 'Novice', trial_id: 'trial-1' },
  } as unknown as CartItemWithDetails;
}

function deps() {
  return {
    refetchCapacity: vi.fn().mockResolvedValue({
      isError: false,
      data: {
        judgeDays: [],
        classSpots: [{ classId: 'class-full', availableSpots: 0 }],
        waitlistClassIds: ['class-full'],
      },
    }),
    checkoutWithWaitlist: vi.fn().mockResolvedValue({
      confirmed: ['class-open'],
      waitlisted: [{ id: 'wl-1', position: 1 }],
    }),
    removeItem: vi.fn().mockResolvedValue(true),
    createCheckoutSession: vi.fn().mockResolvedValue(undefined),
    createCorrelationId: () => 'split-1',
  };
}

const base = {
  cartId: 'cart-1',
  showId: 'show-1',
  exhibitorProfileId: 'profile-1',
  onlyRecoveredItems: false,
};

describe('runCartCheckout (MYK9-1964: the one card checkout path)', () => {
  it('files the full class on its wait list, then opens Stripe for the rest by cart id', async () => {
    const d = deps();
    const outcome = await runCartCheckout({
      ...base,
      items: [line('item-open', 'class-open'), line('item-full', 'class-full')],
      deps: d,
    });

    expect(outcome).toEqual({ kind: 'redirecting' });
    expect(d.checkoutWithWaitlist).toHaveBeenCalledWith('profile-1', new Set(['item-full']));
    expect(d.removeItem).toHaveBeenCalledWith('item-full');
    expect(d.createCheckoutSession).toHaveBeenCalledWith('cart-1', {
      showId: 'show-1',
      splitCheckoutId: 'split-1',
    });
  });

  it('reads no capacity for a cart of already-submitted entries', async () => {
    const d = deps();
    d.checkoutWithWaitlist.mockResolvedValue({ confirmed: ['class-open'], waitlisted: [] });

    await runCartCheckout({
      ...base,
      onlyRecoveredItems: true,
      items: [line('item-1', 'class-open', 'entry-1')],
      deps: d,
    });

    expect(d.refetchCapacity).not.toHaveBeenCalled();
    expect(d.createCheckoutSession).toHaveBeenCalledWith('cart-1', { showId: 'show-1' });
  });

  it('marks the cart changed when a wait-list line could not leave it', async () => {
    const d = deps();
    d.removeItem.mockResolvedValue(false);

    const outcome = await runCartCheckout({
      ...base,
      items: [line('item-open', 'class-open'), line('item-full', 'class-full')],
      deps: d,
    });

    expect(outcome).toEqual({
      kind: 'refused',
      message: CART_CHECKOUT_COPY.waitlistRefreshFailed,
      waitlistCommitted: true,
    });
    expect(d.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('reports a thrown session failure with whether wait-list rows were filed', async () => {
    const d = deps();
    const refusal = new Error('stripe-checkout refused');
    d.createCheckoutSession.mockRejectedValue(refusal);
    d.refetchCapacity.mockResolvedValue({
      isError: false,
      data: { judgeDays: [], classSpots: [], waitlistClassIds: [] },
    });
    d.checkoutWithWaitlist.mockResolvedValue({ confirmed: ['class-open'], waitlisted: [] });

    const outcome = await runCartCheckout({
      ...base,
      items: [line('item-open', 'class-open')],
      deps: d,
    });

    expect(outcome).toEqual({ kind: 'failed', error: refusal, waitlistCommitted: false });
  });
});
