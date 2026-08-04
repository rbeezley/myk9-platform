/**
 * CartItemCard presentation tests.
 *
 * Covers the impeccable p17 fixes: 44px touch floor on the Remove action and
 * the in-progress (isRemoving) feedback. Behavior/cart-math is untouched here.
 */

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CartItemCard } from './CartItemCard';
import type { CartItemWithDetails } from '@/store/cartStore';

// Minimal presentational fixture — CartItemCard only reads these fields.
const baseItem = {
  id: 'item-1',
  entry_fee_cents: 4500,
  jump_height: null,
  special_requests: null,
  dog: { id: 'dog-1', name: 'Willow Reg', call_name: 'Willow', breed: 'Border Collie' },
  class: { id: 'class-1', name: 'Novice A', level: 'Novice', trial_id: 'trial-1' },
  handler: { id: 'h-1', first_name: 'Pat', last_name: 'Jones' },
} as unknown as CartItemWithDetails;

describe('CartItemCard', () => {
  it('renders the entry fee formatted as currency', () => {
    render(<CartItemCard item={baseItem} onRemove={vi.fn()} />);
    expect(screen.getByText('$45.00')).toBeInTheDocument();
  });

  it('Remove button meets the 44px touch floor', () => {
    render(<CartItemCard item={baseItem} onRemove={vi.fn()} />);
    const removeBtn = screen.getByRole('button', { name: /remove/i });
    expect(removeBtn.className).toContain('min-h-[44px]');
  });

  it('shows in-progress feedback and disables while removing', () => {
    render(<CartItemCard item={baseItem} onRemove={vi.fn()} isRemoving />);
    const btn = screen.getByRole('button', { name: /removing/i });
    expect(btn).toBeDisabled();
  });

  // MYK9-122: a full class used to render exactly like a payable entry, so the
  // exhibitor had no way to tell it would not be charged or confirmed.
  it('renders a wait-list line as $0.00 due now, not as its entry fee', () => {
    render(<CartItemCard item={baseItem} onRemove={vi.fn()} fulfillment="waitlist" />);

    expect(screen.getByText('Wait list request')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.getByText('$45.00 if offered')).toBeInTheDocument();
    expect(
      screen.getByText(/availability is confirmed before any payment is requested/i)
    ).toBeInTheDocument();
  });

  it('renders a blocked line with the action that unblocks checkout', () => {
    render(<CartItemCard item={baseItem} onRemove={vi.fn()} fulfillment="blocked" />);

    expect(screen.getByText('Class full')).toBeInTheDocument();
    expect(screen.getByText('Cannot be paid')).toBeInTheDocument();
    expect(screen.getByText(/remove it to continue to payment/i)).toBeInTheDocument();
  });

  it('still renders an ordinary payable line by default', () => {
    render(<CartItemCard item={baseItem} onRemove={vi.fn()} />);

    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.queryByText('Wait list request')).not.toBeInTheDocument();
  });
});
