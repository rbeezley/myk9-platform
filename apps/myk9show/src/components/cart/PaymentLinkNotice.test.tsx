/**
 * MYK9-873: what a payment link's entries came to, rendered against the REAL cart
 * store. The store keeps only the link's facts; the notice derives its outcome
 * from them and the LIVE cart on every render, so removing the last line or
 * clearing the cart switches it to the empty-cart copy at once (Codex P2 on
 * 3b4a410f2). Every branch names an action this page has (INTENT: no dead ends):
 * Checkout when the cart has lines; "add back" and My Entries when it has none.
 */
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/test/utils/testUtils';
import { useCartStore } from '@/store/cartStore';
import type { PaymentLinkFacts } from '@/store/cartStore.types';
import { PaymentLinkNotice } from './ClosedClassRemovedNotice';

afterEach(() => {
  useCartStore.getState().reset();
});

const LINK = 'e1,e2,e3';
const line = (entryId: string | null) => ({ id: `item-${entryId}`, entry_id: entryId });

function setup(
  facts: Omit<PaymentLinkFacts, 'linkKey' | 'linkIds'>,
  lines: Array<string | null> | null,
  onAddBack?: () => void
) {
  useCartStore.setState({
    cart: lines === null ? null : ({ id: 'cart-1', items: lines.map(line) } as never),
    paymentLinkFacts: { linkKey: LINK, linkIds: ['e1', 'e2', 'e3'], ...facts },
  });
  return render(<PaymentLinkNotice linkKey={LINK} {...(onAddBack ? { onAddBack } : {})} />);
}

const myEntriesLink = () => screen.getByRole('link', { name: 'My Entries' });

describe('PaymentLinkNotice', () => {
  it('no cart at all, every entry unavailable: says so and links to My Entries', () => {
    setup({ payableIds: [] }, null);

    expect(
      screen.getByText('None of the 3 entries in your payment link are in your cart.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('3 are already paid, withdrawn, or no longer open for payment.')
    ).toBeInTheDocument();
    expect(myEntriesLink()).toHaveAttribute('href', '/exhibitor/entries');
    expect(screen.queryByRole('button', { name: /back to your cart/ })).toBeNull();
  });

  it('some-missing with a still-unpaid entry points at checking out this cart', () => {
    setup({ payableIds: ['e1', 'e2', 'e3'] }, ['e1', 'e2']);

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
    setup({ payableIds: ['e1', 'e2'] }, ['e1']);

    expect(
      screen.getByText('2 of the 3 entries in your payment link are not in this cart.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('1 is already paid, withdrawn, or no longer open for payment.')
    ).toBeInTheDocument();
    expect(screen.getByText(/^1 still needs paying/)).toBeInTheDocument();
    expect(myEntriesLink()).toBeInTheDocument();
  });

  it('removing the last line switches to the empty-cart copy with an add-back action', () => {
    const onAddBack = vi.fn();
    setup({ payableIds: ['e1', 'e2', 'e3'] }, ['e1', 'e2'], onAddBack);
    expect(screen.getByText(/Check out this cart first/)).toBeInTheDocument();

    // What `removeItem` leaves behind once the last line is gone.
    act(() => {
      useCartStore.setState({ cart: { id: 'cart-1', items: [] } as never });
    });

    expect(screen.queryByText(/Check out this cart first/)).toBeNull();
    expect(
      screen.getByText('None of the 3 entries in your payment link are in your cart.')
    ).toBeInTheDocument();
    expect(screen.getByText('3 still need paying.')).toBeInTheDocument();
    expect(myEntriesLink()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add them back to your cart' }));
    expect(onAddBack).toHaveBeenCalledTimes(1);
  });

  it('clearing the cart (no cart at all) also switches to the empty-cart copy', () => {
    setup({ payableIds: ['e1', 'e2', 'e3'] }, ['e1', 'e2'], vi.fn());

    act(() => {
      useCartStore.setState({ cart: null });
    });

    expect(screen.queryByText(/Check out this cart first/)).toBeNull();
    expect(screen.getByText('3 still need paying.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add them back to your cart' })).toBeInTheDocument();
  });

  it('a single still-unpaid entry on an empty cart reads in the singular', () => {
    useCartStore.setState({
      cart: null,
      paymentLinkFacts: { linkKey: 'e1', linkIds: ['e1'], payableIds: ['e1'] },
    });
    render(<PaymentLinkNotice linkKey="e1" onAddBack={vi.fn()} />);

    expect(
      screen.getByText('The entry in your payment link is not in your cart.')
    ).toBeInTheDocument();
    expect(screen.getByText('1 still needs paying.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add it back to your cart' })).toBeInTheDocument();
  });

  it('renders nothing when every linked entry is in the cart, or after a failed load', () => {
    const { container } = setup({ payableIds: ['e1', 'e2', 'e3'] }, ['e1', 'e2', 'e3']);
    expect(container).toBeEmptyDOMElement();

    act(() => {
      useCartStore.setState({
        cart: null,
        paymentLinkFacts: { linkKey: LINK, linkIds: ['e1', 'e2', 'e3'], payableIds: null },
      });
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("never shows another link's facts, or any with no link on the page", () => {
    useCartStore.setState({
      paymentLinkFacts: { linkKey: 'e9', linkIds: ['e9'], payableIds: [] },
    });
    const { container, rerender } = render(<PaymentLinkNotice linkKey={LINK} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<PaymentLinkNotice linkKey={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  // INTENT.md 44px touch floor (Codex P2 on 96f89a03d): `min-h-11` is 44px, and
  // the shared Button's `touch` size; `sm` (h-8, 32px) is below the floor.
  it('every control in the notice meets the 44px touch floor', () => {
    setup({ payableIds: ['e1', 'e2', 'e3'] }, [], vi.fn());

    const addBack = screen.getByRole('button', { name: 'Add them back to your cart' });
    expect(addBack).toHaveClass('min-h-11');
    expect(addBack).not.toHaveClass('h-8');
    expect(myEntriesLink()).toHaveClass('min-h-11');
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    expect(dismiss).toHaveClass('min-h-[44px]', 'min-w-[44px]');
  });

  it('dismisses', () => {
    setup({ payableIds: [] }, null);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(useCartStore.getState().paymentLinkFacts).toBeNull();
  });
});
