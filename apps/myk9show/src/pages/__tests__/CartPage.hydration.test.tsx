/**
 * Regression for the impeccable p17 CartPage hydration gate.
 *
 * A direct visit (refresh, deep link, new device) mounts CartPage before the
 * profile resolves and the in-memory cart store hydrates. Without the gate, the
 * "Your cart is empty" zero-state flashes over a cart that is still loading.
 * The gate must render the loading state while EITHER the profile or the cart
 * store is loading and there are no items yet, and fall through to the empty
 * zero-state only once both have settled.
 */

import { render, screen } from '@/test/utils/testUtils';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import CartPage from '@/pages/CartPage';

// Hoisted so the vi.mock factories below can reference it safely.
const { cartState, profileState } = vi.hoisted(() => ({
  cartState: {
    cart: null as { show_id?: string } | null,
    isLoading: false,
    error: null as string | null,
    items: [] as unknown[],
    removeItem: () => {},
    clearCart: () => {},
    setError: () => {},
    loadActiveCart: () => {},
  },
  profileState: { profile: null as unknown, isLoading: false },
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (s: typeof cartState) => unknown) => selector(cartState),
  useCartItems: () => cartState.items,
}));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => profileState,
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1' } }),
}));

describe('CartPage hydration gate', () => {
  beforeEach(() => {
    cartState.cart = null;
    cartState.isLoading = false;
    cartState.error = null;
    cartState.items = [];
    profileState.profile = null;
    profileState.isLoading = false;
  });

  it('shows the loading state, not the empty zero-state, while the cart store hydrates', () => {
    cartState.isLoading = true;
    render(<CartPage />);
    expect(screen.getByText('Loading your cart…')).toBeInTheDocument();
    expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument();
  });

  it('shows the loading state while the exhibitor profile is still resolving', () => {
    profileState.isLoading = true;
    render(<CartPage />);
    expect(screen.getByText('Loading your cart…')).toBeInTheDocument();
    expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument();
  });

  it('falls through to the empty zero-state once loading settles with no items', () => {
    cartState.isLoading = false;
    profileState.isLoading = false;
    render(<CartPage />);
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.queryByText('Loading your cart…')).not.toBeInTheDocument();
  });
});
