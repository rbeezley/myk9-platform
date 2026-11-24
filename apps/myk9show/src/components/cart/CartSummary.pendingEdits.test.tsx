/**
 * MYK9-2340 — Pay is held while cart edits are still being saved.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CartSummary } from './CartSummary';
import { resetCartMutationQueue, runCartMutation } from '@/store/cartStore.helpers';

vi.mock('@/store/cartStore', () => ({
  useCartStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      cart: {
        id: 'cart-1',
        exhibitor_id: 'ex-1',
        show_id: 'show-1',
        status: 'active',
        expires_at: '2099-01-01T00:00:00.000Z',
        show: {
          id: 'show-1',
          name: 'Heartland Scent Work Classic',
          start_date: '2099-08-01',
          entry_close_date: '2099-06-30',
        },
      },
      getTotalEntryFees: () => 2500,
      getItemCount: () => 1,
      extendExpiration: vi.fn().mockResolvedValue(true),
    }),
}));

describe('CartSummary while cart edits are pending (MYK9-2340)', () => {
  afterEach(() => {
    resetCartMutationQueue();
  });

  it('disables Pay and says so until the queued edit settles', async () => {
    const onCheckout = vi.fn();
    let release: () => void = () => undefined;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });

    const { user } = render(<CartSummary onCheckout={onCheckout} />);
    const pay = () => screen.getByRole('button', { name: /^Pay / });
    expect(pay()).toBeEnabled();
    expect(screen.queryByText('Saving your changes…')).not.toBeInTheDocument();

    let mutation: Promise<void> = Promise.resolve();
    act(() => {
      mutation = runCartMutation('cart-1', () => held);
    });

    expect(pay()).toBeDisabled();
    expect(screen.getByText('Saving your changes…')).toBeInTheDocument();
    await user.click(pay());
    expect(onCheckout).not.toHaveBeenCalled();

    await act(async () => {
      release();
      await mutation;
    });

    expect(pay()).toBeEnabled();
    expect(screen.queryByText('Saving your changes…')).not.toBeInTheDocument();
  });
});
