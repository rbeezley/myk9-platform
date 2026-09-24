/**
 * MYK9-651: the persisted cart recovery ids are trusted only for the exhibitor
 * who saved them.
 *
 * A real Stripe cancel returns through a full document load, so the cancel page
 * has only the persisted `cartRecoveryInfo` to offer "Add or change entries" for
 * a show. Those ids live in localStorage and outlive the session: account A's
 * can still be there when account B opens the tab. They are honoured only when
 * their `exhibitorId` is the signed-in exhibitor's profile id; anything else,
 * including the legacy shape with no exhibitor id, is treated as absent.
 */
import { render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const profileHolder = vi.hoisted(() => ({ id: 'exhibitor-B' as string | null }));

vi.mock('@/lib/stripe', () => ({ verifyCheckoutSession: vi.fn() }));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({
    profile: profileHolder.id ? { id: profileHolder.id } : null,
    isLoading: false,
  }),
}));

import CheckoutCancelPage from '@/pages/CheckoutCancelPage';
import { useCartStore } from '@/store/cartStore';

// Deliberately NOT the shared render: its AuthProvider signs out on mount and
// the account boundary then clears the ids, which would pass these tests
// without the page ever checking whose ids they are. The check must hold even
// when nothing has cleared them.
const renderPage = () =>
  rtlRender(
    <MemoryRouter initialEntries={['/checkout/cancel']}>
      <CheckoutCancelPage />
    </MemoryRouter>
  );

const amendButton = () => screen.queryByRole('button', { name: /add or change entries/i });

beforeEach(() => {
  profileHolder.id = 'exhibitor-B';
  useCartStore.setState({ cart: null, cartRecoveryInfo: null });
});

describe('CheckoutCancelPage trusts recovery ids only for their own exhibitor', () => {
  it("does not offer account A's show to account B", async () => {
    useCartStore.setState({
      cartRecoveryInfo: { id: 'cart-A', showId: 'show-A', exhibitorId: 'exhibitor-A' },
    });

    renderPage();

    await screen.findByRole('button', { name: /browse shows/i });
    expect(amendButton()).not.toBeInTheDocument();
  });

  it('ignores ids saved in the legacy shape, with no exhibitor id', async () => {
    useCartStore.setState({
      cartRecoveryInfo: { id: 'cart-A', showId: 'show-A' } as never,
    });

    renderPage();

    await screen.findByRole('button', { name: /browse shows/i });
    expect(amendButton()).not.toBeInTheDocument();
  });

  it('offers the saved show back to the exhibitor who saved it', async () => {
    useCartStore.setState({
      cartRecoveryInfo: { id: 'cart-B', showId: 'show-B', exhibitorId: 'exhibitor-B' },
    });

    renderPage();

    expect(await screen.findByRole('button', { name: /add or change entries/i })).toBeVisible();
  });

  it('treats the ids as absent while no exhibitor is signed in', async () => {
    profileHolder.id = null;
    useCartStore.setState({
      cartRecoveryInfo: { id: 'cart-B', showId: 'show-B', exhibitorId: 'exhibitor-B' },
    });

    renderPage();

    await screen.findByRole('button', { name: /browse shows/i });
    expect(amendButton()).not.toBeInTheDocument();
  });
});
