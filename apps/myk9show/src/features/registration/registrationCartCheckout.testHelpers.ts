import { vi } from 'vitest';
import type { CartWithDetails } from '@/store/cartStore.types';

/**
 * The card-checkout half of `submitRegistrationCartCheckout`'s deps (MYK9-1964),
 * stubbed so a test about the cart lines reaches a session request that only
 * records its arguments. Every class is open and none goes to a wait list.
 */
export function stubCardCheckoutDeps({
  showId = 'show-1',
  cartId = 'cart-1',
}: { showId?: string; cartId?: string } = {}) {
  return {
    getCart: vi.fn(
      () => ({ id: cartId, show_id: showId, items: [] }) as unknown as CartWithDetails
    ),
    checkout: {
      refetchCapacity: vi.fn().mockResolvedValue({
        isError: false,
        data: { judgeDays: [], classSpots: [], waitlistClassIds: [] },
      }),
      checkoutWithWaitlist: vi.fn().mockResolvedValue({ confirmed: ['class-1'], waitlisted: [] }),
      removeItem: vi.fn().mockResolvedValue(true),
      createCheckoutSession: vi.fn().mockResolvedValue(undefined),
    },
  };
}
