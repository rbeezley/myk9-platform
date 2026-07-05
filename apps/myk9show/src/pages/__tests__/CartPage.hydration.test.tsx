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
    loadInitiated: false,
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
    cartState.loadInitiated = false;
    cartState.error = null;
    cartState.items = [];
    profileState.profile = null;
    profileState.isLoading = false;
  });

  it('shows the loading state, not the empty zero-state, while the cart store hydrates', () => {
    cartState.isLoading = true;
    render(<CartPage />);
    expect(screen.getByRole('status', { name: 'Loading cart' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument();
  });

  it('shows the loading state while the exhibitor profile is still resolving', () => {
    profileState.isLoading = true;
    render(<CartPage />);
    expect(screen.getByRole('status', { name: 'Loading cart' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument();
  });

  it('shows the loading state on the first frame: profile resolved with an id but the cart-load effect has not started', () => {
    // isProfileLoading and isCartLoading are both false, but the cart-load
    // effect runs after the first render, so the store has not flipped
    // loadInitiated yet. The gate must still hold the loading state rather than
    // flashing the empty zero-state.
    profileState.profile = { id: 'p1' };
    profileState.isLoading = false;
    cartState.isLoading = false;
    cartState.loadInitiated = false;
    cartState.items = [];
    render(<CartPage />);
    expect(screen.getByRole('status', { name: 'Loading cart' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument();
  });

  it('falls through to the empty zero-state once a profiled load completes with no items', () => {
    // Profile resolved, the load has run (loadInitiated true) and settled with
    // no items — this is a genuinely empty cart, so show the zero-state.
    profileState.profile = { id: 'p1' };
    profileState.isLoading = false;
    cartState.isLoading = false;
    cartState.loadInitiated = true;
    cartState.items = [];
    render(<CartPage />);
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading cart' })).not.toBeInTheDocument();
  });

  it('shows the empty zero-state for a visitor with no exhibitor profile', () => {
    cartState.isLoading = false;
    profileState.profile = null;
    profileState.isLoading = false;
    render(<CartPage />);
    expect(screen.getByText('Your cart is empty')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading cart' })).not.toBeInTheDocument();
  });
});
