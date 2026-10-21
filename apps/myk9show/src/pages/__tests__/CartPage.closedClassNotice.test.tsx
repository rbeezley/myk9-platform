/**
 * MYK9-656 (Codex P2 on PR #2438): when the saved-cart re-check removes EVERY
 * line, /cart takes its empty-cart branch. That branch must still say what was
 * removed and why, or an exhibitor with one closed-class entry sees only "Your
 * cart is empty".
 */
import { render, screen } from '@/test/utils/testUtils';
import { vi, describe, it, expect } from 'vitest';
import CartPage from '@/pages/CartPage';

const { cartState } = vi.hoisted(() => ({
  cartState: {
    cart: { id: 'cart-1', show_id: 'show-1' } as { id: string; show_id: string } | null,
    isLoading: false,
    loadInitiated: true,
    error: null as string | null,
    items: [] as unknown[],
    removeItem: () => {},
    clearCart: () => {},
    setError: () => {},
    loadActiveCart: vi.fn(),
    dismissDroppedClosedClassItems: vi.fn(),
    droppedClosedClassItems: [
      {
        cartId: 'cart-1',
        itemId: 'item-1',
        dogName: 'Rover',
        className: 'Exterior Master',
        reason: 'This class was cancelled',
      },
    ],
  },
}));

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (s: typeof cartState) => unknown) => selector(cartState),
  useCartItems: () => cartState.items,
}));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'p1' }, isLoading: false }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'u1' } }),
}));

describe('CartPage when the re-check emptied the cart', () => {
  it('explains the removal above "Nothing in your entry yet"', () => {
    render(<CartPage />);

    expect(screen.getByText('Nothing in your entry yet')).toBeInTheDocument();
    expect(
      screen.getByText('Rover in Exterior Master: this class was cancelled.')
    ).toBeInTheDocument();
  });

  // MYK9-873: a payment link whose lookup FAILED with no cart shell left lands
  // here too; the retryable error must show, not a bare "Nothing in your entry yet".
  it('shows the cart error on the empty-cart branch', () => {
    const saved = { cart: cartState.cart, error: cartState.error };
    cartState.cart = null;
    cartState.error =
      'We could not check the entries in your payment link. Please reload the page to try again.';
    try {
      render(<CartPage />);

      expect(screen.getByText('Nothing in your entry yet')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'We could not check the entries in your payment link. Please reload the page to try again.'
      );
    } finally {
      Object.assign(cartState, saved);
    }
  });
});
