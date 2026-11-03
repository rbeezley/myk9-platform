/**
 * MYK9-1673: a full-page Stripe cancel return resolves the checkout's OWN show.
 *
 * Another tab can open a different show while Checkout is open, which rewrites
 * the shared recovery info. The cancel URL's `show` param must win over it.
 */
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/stripe', () => ({
  verifyCheckoutSession: vi.fn().mockResolvedValue({ success: false }),
}));
vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => ({ profile: { id: 'exhibitor-1' }, isLoading: false }),
}));

import CheckoutCancelPage from '@/pages/CheckoutCancelPage';
import { useCartStore } from '@/store/cartStore';

const SHOW_A = '11111111-1111-4111-8111-111111111111';
const SHOW_D = '44444444-4444-4444-8444-444444444444';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

const renderAt = (url: string) =>
  rtlRender(
    <MemoryRouter initialEntries={[url]}>
      <CheckoutCancelPage />
      <Where />
    </MemoryRouter>
  );

beforeEach(() => {
  // Cold return: no in-memory cart; another tab left show D in shared storage.
  useCartStore.setState({
    cart: null,
    cartRecoveryInfo: { id: 'cart-D', showId: SHOW_D, exhibitorId: 'exhibitor-1' },
  });
});

describe('CheckoutCancelPage cold return', () => {
  it("returns to the checkout's own show from the cancel URL, not the stored one", async () => {
    renderAt(`/checkout/cancel?session_id=cs_x&show=${SHOW_A}`);
    await userEvent.click(await screen.findByRole('button', { name: /return to your entry/i }));
    const where = screen.getByTestId('where').textContent ?? '';
    expect(where).toContain(SHOW_A);
    expect(where).not.toContain(SHOW_D);
  });

  it('keeps legacy links (no show param) on the trusted recovery show', async () => {
    renderAt('/checkout/cancel?session_id=cs_x');
    await userEvent.click(await screen.findByRole('button', { name: /return to your entry/i }));
    expect(screen.getByTestId('where').textContent).toContain(SHOW_D);
  });
});
