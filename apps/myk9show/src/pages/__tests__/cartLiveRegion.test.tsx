import { render, screen, waitFor } from '@/test/utils/testUtils';
import { describe, expect, it, vi } from 'vitest';

const cartState = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    cart: { id: 'cart-1', show_id: 'show-1' },
    items: [
      {
        id: 'item-1',
        cart_id: 'cart-1',
        dog_id: 'dog-1',
        class_id: 'class-1',
        entry_fee_cents: 2500,
        dog: { call_name: 'Poppy' },
        class: { name: 'Novice Containers', trial_id: 'trial-1' },
      },
    ],
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    removeItem: vi.fn(async () => {
      state.items = [];
      listeners.forEach(listener => listener());
      return true;
    }),
    loadActiveCart: vi.fn().mockResolvedValue(undefined),
  };
  return state;
});

vi.mock('@/store/cartStore', async () => {
  const { useSyncExternalStore } = await vi.importActual<typeof import('react')>('react');
  return {
    useCartStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        cart: cartState.cart,
        isLoading: false,
        loadInitiated: true,
        error: null,
        removeItem: cartState.removeItem,
        clearCart: vi.fn(),
        setError: vi.fn(),
        loadActiveCart: cartState.loadActiveCart,
        checkoutWithWaitlist: vi.fn(),
      }),
    useCartItems: () => useSyncExternalStore(cartState.subscribe, () => cartState.items),
  };
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'profile-1' }, isLoading: false }),
}));
vi.mock('@/hooks/queries/useCartCapacity', () => ({
  useCartCapacity: () => ({
    judgeDays: [],
    classSpots: [],
    judgeNameById: new Map(),
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/pages/useAuthoritativeCartQuote', () => ({
  useAuthoritativeCartQuote: () => ({ ready: true, error: null, retry: vi.fn() }),
}));
vi.mock('@/components/cart/CartItemCard', () => ({
  CartItemCard: ({ onRemove }: { onRemove: () => void }) => (
    <button type="button" onClick={onRemove}>
      Remove Poppy
    </button>
  ),
}));
vi.mock('@/components/cart/CartSummary', () => ({ CartSummary: () => null }));

import CartPage from '../CartPage';

describe('CartPage removal announcement', () => {
  it('keeps the mounted live region when removing the last item', async () => {
    const { user } = render(<CartPage />, { initialRoute: '/cart' });
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toHaveTextContent('');

    await user.click(screen.getByRole('button', { name: 'Remove Poppy' }));

    await waitFor(() => expect(screen.getByText('Your cart is empty')).toBeInTheDocument());
    expect(document.querySelector('[aria-live="polite"]')).toBe(liveRegion);
    expect(liveRegion).toHaveTextContent(
      'Removed Poppy from Novice Containers. Your cart is now empty.'
    );
  });
});
