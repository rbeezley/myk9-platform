/**
 * MYK9-873: when a Finish Payment link names entries the recovered cart could
 * not hold, the exhibitor is told how many and why, against the REAL cart store.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useCartStore } from '@/store/cartStore';
import { RecoveryEntriesDroppedNotice } from './ClosedClassRemovedNotice';

afterEach(() => {
  useCartStore.getState().reset();
});

describe('RecoveryEntriesDroppedNotice', () => {
  it('renders nothing when recovery left nothing out', () => {
    useCartStore.setState({ cart: { id: 'cart-1' } as never });
    const { container } = render(<RecoveryEntriesDroppedNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says how many entries were left out and why, then dismisses', () => {
    useCartStore.setState({
      cart: { id: 'cart-1' } as never,
      droppedRecoveryEntries: { cartId: 'cart-1', requested: 3, dropped: 2 },
    });

    render(<RecoveryEntriesDroppedNotice />);

    expect(
      screen.getByText('2 of the 3 entries in your payment link are not in this cart.')
    ).toBeInTheDocument();
    expect(screen.getByText(/already paid, withdrawn, or no longer open/)).toBeInTheDocument();
    expect(screen.getByText(/enter again any that still need paying/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(useCartStore.getState().droppedRecoveryEntries).toBeNull();
  });

  it('uses the singular for one entry', () => {
    useCartStore.setState({
      cart: { id: 'cart-1' } as never,
      droppedRecoveryEntries: { cartId: 'cart-1', requested: 2, dropped: 1 },
    });

    render(<RecoveryEntriesDroppedNotice />);

    expect(
      screen.getByText('1 of the 2 entries in your payment link is not in this cart.')
    ).toBeInTheDocument();
  });

  it("never shows another cart's notice", () => {
    useCartStore.setState({
      cart: { id: 'cart-2' } as never,
      droppedRecoveryEntries: { cartId: 'cart-1', requested: 3, dropped: 2 },
    });

    const { container } = render(<RecoveryEntriesDroppedNotice />);

    expect(container).toBeEmptyDOMElement();
  });
});
