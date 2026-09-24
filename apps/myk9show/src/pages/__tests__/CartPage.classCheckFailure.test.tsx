/**
 * MYK9-656: when the closed-class re-check cannot be read, /cart keeps the
 * saved cart on screen, says why checkout is blocked, and offers Try again.
 *
 * The earlier shape settled the failure as `cart: null`, so the page rendered
 * "Your cart is empty" over items that still exist. Rendered through the real
 * CartPage and the real cart store, against the in-memory tables, because the
 * store alone cannot show what the exhibitor sees.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { mockSupabase } from '@/test/mocks/supabase';
import { createFakeCartDb, fakeCart, fakeCartItem, type FakeCartDb } from '@/test/utils/fakeCartDb';
import { useCartStore } from '@/store/cartStore';
import CartPage from '@/pages/CartPage';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'exhibitor-1' }, isLoading: false }),
}));
vi.mock('@/hooks/queries/useJudgeDayCapacity', () => ({
  useJudgeDayCapacity: () => ({
    judgeDays: [],
    fullClassIds: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
// The account boundary is not under test here; its sign-out reset on mount
// would race the page's own load.
vi.mock('@/hooks/useNotifyAccountBoundary', () => ({ useNotifyAccountBoundary: () => {} }));

const CART_TABLES = new Set(['entry_carts', 'entry_cart_items', 'classes', 'entries']);
let db: FakeCartDb;

beforeEach(() => {
  db = createFakeCartDb({
    carts: [fakeCart({ id: 'cart-1' })],
    dogs: [{ id: 'dog-1', name: 'Rover', call_name: 'Rover' }],
    classes: [
      {
        id: 'class-1',
        name: 'Novice Interior',
        level: 'Novice',
        trial_id: 'trial-1',
        allow_waitlist: false,
        status: 'upcoming',
      },
    ],
    items: [fakeCartItem({ id: 'item-1', cart_id: 'cart-1' })],
  });
  const fallback = mockSupabase.from.getMockImplementation();
  mockSupabase.from.mockImplementation(table =>
    CART_TABLES.has(table)
      ? (db.from(table) as unknown as ReturnType<typeof mockSupabase.from>)
      : (fallback?.(table) as ReturnType<typeof mockSupabase.from>)
  );
  useCartStore.getState().reset();
});

const failNextClassRead = () =>
  db.hold(q => q.table === 'classes', {
    data: null,
    error: { code: '08006', message: 'connection failure' },
  })();

const payButton = () => screen.findByRole('button', { name: /^Pay /i });

describe('CartPage when the closed-class check fails (MYK9-656)', () => {
  it('control: with the check readable, the cart renders and checkout is enabled', async () => {
    render(<CartPage />, { initialRoute: '/cart' });

    expect(await screen.findByText('Rover')).toBeInTheDocument();
    expect(await payButton()).toBeEnabled();
  });

  it('keeps the saved items on screen instead of reading as empty', async () => {
    failNextClassRead();

    render(<CartPage />, { initialRoute: '/cart' });

    expect(await screen.findByText('Rover')).toBeInTheDocument();
    expect(screen.queryByText('Your cart is empty')).not.toBeInTheDocument();
    expect(
      screen.getByText('We could not check the classes in your saved cart. Please try again.')
    ).toBeInTheDocument();
  });

  it('blocks checkout and says why', async () => {
    failNextClassRead();

    render(<CartPage />, { initialRoute: '/cart' });

    const pay = await payButton();
    expect(pay).toBeDisabled();
    expect(pay).toHaveAccessibleDescription(
      /could not check whether the classes in this cart are still open/i
    );
  });

  it('re-enables checkout once Try again succeeds', async () => {
    failNextClassRead();

    const { user } = render(<CartPage />, { initialRoute: '/cart' });
    expect(await payButton()).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await vi.waitFor(async () => expect(await payButton()).toBeEnabled());
    expect(
      screen.queryByText('We could not check the classes in your saved cart. Please try again.')
    ).not.toBeInTheDocument();
    expect(screen.getByText('Rover')).toBeInTheDocument();
  });
});
