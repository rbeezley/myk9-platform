/**
 * MYK9-873: what a payment link's entries came to, rendered against the REAL cart
 * store, in both /cart states. Every branch must name an action available on the
 * page it renders on (INTENT: no dead ends): Checkout when the cart has lines, the
 * My Entries link otherwise.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import { useCartStore } from '@/store/cartStore';
import type { StoredPaymentLinkOutcome } from '@/store/cartStore.types';
import { PaymentLinkNotice } from './ClosedClassRemovedNotice';

afterEach(() => {
  useCartStore.getState().reset();
});

function show(outcome: Omit<StoredPaymentLinkOutcome, 'linkKey'>, cart: object | null = null) {
  useCartStore.setState({
    cart: cart as never,
    paymentLinkOutcome: { linkKey: 'e1,e2,e3', ...outcome },
  });
  return render(<PaymentLinkNotice linkKey="e1,e2,e3" />);
}

const myEntriesLink = () => screen.getByRole('link', { name: 'My Entries' });

describe('PaymentLinkNotice', () => {
  it('none-left with no cart at all: says so and links to My Entries', () => {
    show({ kind: 'none-left', requested: 3, unavailable: 3, stillUnpaid: 0 });

    expect(
      screen.getByText('None of the 3 entries in your payment link can be paid here.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('3 are already paid, withdrawn, or no longer open for payment.')
    ).toBeInTheDocument();
    expect(myEntriesLink()).toHaveAttribute('href', '/exhibitor/entries');
    expect(screen.queryByText(/Check out this cart/)).toBeNull();
  });

  it('none-left for a single entry reads in the singular', () => {
    show({ kind: 'none-left', requested: 1, unavailable: 0, stillUnpaid: 1 });

    expect(
      screen.getByText('The entry in your payment link cannot be paid here.')
    ).toBeInTheDocument();
    expect(screen.getByText('1 could not be added to a cart.')).toBeInTheDocument();
    expect(myEntriesLink()).toBeInTheDocument();
  });

  it('some-missing with a still-unpaid entry points at checking out this cart', () => {
    show({ kind: 'some-missing', requested: 3, unavailable: 0, stillUnpaid: 1 }, { id: 'c1' });

    expect(
      screen.getByText('1 of the 3 entries in your payment link is not in this cart.')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 still needs paying. Check out this cart first, then open your payment link again.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My Entries' })).toBeNull();
  });

  it('some-missing with unavailable entries links to My Entries; both reasons when both apply', () => {
    show({ kind: 'some-missing', requested: 3, unavailable: 1, stillUnpaid: 1 }, { id: 'c1' });

    expect(
      screen.getByText('2 of the 3 entries in your payment link are not in this cart.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('1 is already paid, withdrawn, or no longer open for payment.')
    ).toBeInTheDocument();
    expect(screen.getByText(/^1 still needs paying/)).toBeInTheDocument();
    expect(myEntriesLink()).toHaveAttribute('href', '/exhibitor/entries');
  });

  it('renders nothing when every linked entry is in the cart', () => {
    const { container } = show(
      { kind: 'all-present', requested: 3, unavailable: 0, stillUnpaid: 0 },
      { id: 'c1' }
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("never shows another link's outcome, or one with no link on the page", () => {
    useCartStore.setState({
      paymentLinkOutcome: {
        linkKey: 'e9',
        kind: 'none-left',
        requested: 1,
        unavailable: 1,
        stillUnpaid: 0,
      },
    });
    const { container, rerender } = render(<PaymentLinkNotice linkKey="e1,e2,e3" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PaymentLinkNotice linkKey={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('dismisses', () => {
    show({ kind: 'none-left', requested: 3, unavailable: 3, stillUnpaid: 0 });

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(useCartStore.getState().paymentLinkOutcome).toBeNull();
  });
});
