/**
 * MYK9-873: when a Finish Payment link names entries the cart does not hold, the
 * exhibitor is told how many and why, against the REAL cart store.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useCartStore } from '@/store/cartStore';
import { RecoveryEntriesDroppedNotice } from './ClosedClassRemovedNotice';

afterEach(() => {
  useCartStore.getState().reset();
});

function showNotice(stillUnpaid: number, unavailable: number, requested = 3) {
  useCartStore.setState({
    cart: { id: 'cart-1' } as never,
    droppedRecoveryEntries: { cartId: 'cart-1', requested, stillUnpaid, unavailable },
  });
  return render(<RecoveryEntriesDroppedNotice />);
}

describe('RecoveryEntriesDroppedNotice', () => {
  it('renders nothing when every linked entry is in the cart', () => {
    useCartStore.setState({ cart: { id: 'cart-1' } as never });
    const { container } = render(<RecoveryEntriesDroppedNotice />);
    expect(container).toBeEmptyDOMElement();
  });

  it('explains entries that can no longer be paid, then dismisses', () => {
    showNotice(0, 2);

    expect(
      screen.getByText('2 of the 3 entries in your payment link are not in this cart.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '2 are already paid, withdrawn, or no longer open for payment. Check My Entries, and enter again any that still need paying.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/open your payment link again/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(useCartStore.getState().droppedRecoveryEntries).toBeNull();
  });

  it('explains a still-unpaid entry this cart does not hold, in the singular', () => {
    showNotice(1, 0, 2);

    expect(
      screen.getByText('1 of the 2 entries in your payment link is not in this cart.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 still needs paying. Pay for this cart first, then open your payment link again.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/already paid/)).toBeNull();
  });

  it('gives both reasons when both apply', () => {
    showNotice(1, 1);

    expect(
      screen.getByText('2 of the 3 entries in your payment link are not in this cart.')
    ).toBeInTheDocument();
    expect(screen.getByText(/^1 is already paid, withdrawn/)).toBeInTheDocument();
    expect(screen.getByText(/^1 still needs paying/)).toBeInTheDocument();
  });

  it("never shows another cart's notice", () => {
    useCartStore.setState({
      cart: { id: 'cart-2' } as never,
      droppedRecoveryEntries: { cartId: 'cart-1', requested: 3, stillUnpaid: 0, unavailable: 2 },
    });

    const { container } = render(<RecoveryEntriesDroppedNotice />);

    expect(container).toBeEmptyDOMElement();
  });
});
