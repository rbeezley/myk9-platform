import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import CartPage from '../CartPage';

const mocks = vi.hoisted(() => ({
  retry: vi.fn(),
  remove: vi.fn(async () => true),
  quote: { ready: true, error: null as string | null },
}));
const item = {
  id: 'item-1',
  cart_id: 'cart-1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  handler_id: null,
  entry_id: null,
  entry_fee_cents: 1500,
  jump_height: null,
  special_requests: null,
  dog: { id: 'dog-1', name: 'Rex', call_name: 'Rex', registrations: [] },
  class: { id: 'class-1', name: 'Novice', level: null, trial_id: 'trial-1', allow_waitlist: true },
};
const cart = {
  id: 'cart-1',
  show_id: 'show-1',
  exhibitor_id: 'profile-1',
  status: 'active',
  expires_at: '2099-12-01T00:00:00Z',
  show: {
    id: 'show-1',
    name: 'Trial',
    start_date: '2099-12-01',
    entry_close_date: '2099-11-30',
    junior_handler_fee: 15,
  },
  items: [item],
};
const state = {
  cart,
  isLoading: false,
  loadInitiated: true,
  error: null,
  removeItem: mocks.remove,
  clearCart: vi.fn(),
  setError: vi.fn(),
  loadActiveCart: vi.fn(),
  checkoutWithWaitlist: vi.fn(),
};
vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (value: typeof state) => unknown) => selector(state),
  useCartItems: () => cart.items,
}));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ user: { id: 'user-1' } }) }));
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
vi.mock('../useAuthoritativeCartQuote', () => ({
  useAuthoritativeCartQuote: () => ({ ...mocks.quote, retry: mocks.retry }),
}));
vi.mock('@/components/cart/CartItemCard', () => ({
  CartItemCard: ({ onRemove }: { onRemove: () => void }) => (
    <button onClick={onRemove}>Remove Rex</button>
  ),
}));
vi.mock('@/components/cart/CartSummary', () => ({
  CartSummary: ({ feeUnavailable }: { feeUnavailable: boolean }) => (
    <button disabled={feeUnavailable}>Pay and confirm</button>
  ),
}));
vi.mock('@/components/cart/ClosedClassRemovedNotice', () => ({
  ClosedClassRemovedNotice: () => null,
}));

describe('CartPage re-quote after the first fee confirmation', () => {
  it('keeps the page, and its focus, mounted while a later quote runs; only Pay waits', () => {
    mocks.quote.ready = true;
    const { rerender } = render(<CartPage />, { initialRoute: '/cart' });
    const remove = screen.getByRole('button', { name: 'Remove Rex' });
    expect(screen.getByRole('button', { name: 'Pay and confirm' })).toBeEnabled();

    // An edit changed the quote key: the confirmation is pending again.
    mocks.quote.ready = false;
    rerender(<CartPage />);

    expect(screen.getByRole('heading', { name: 'Your Cart' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Rex' })).toBe(remove);
    expect(screen.getByRole('button', { name: 'Pay and confirm' })).toBeDisabled();
  });

  it('still shows the skeleton before the first confirmation lands', () => {
    mocks.quote.ready = false;
    render(<CartPage />, { initialRoute: '/cart' });
    expect(screen.queryByRole('heading', { name: 'Your Cart' })).not.toBeInTheDocument();
  });
});
