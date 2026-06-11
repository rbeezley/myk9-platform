import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryFiltersCard } from '@/components/entries/management/EntryFiltersCard';
import { PaymentStatus } from '@/types/show-registration-types';

// Render the Base UI Popover inline. It portals + doesn't open in jsdom, so the
// shared FilterBar.test.tsx stubs it the same way. Everything else here — the
// real FilterBar AND the real FilterPill — is exercised unmocked, so this proves
// EntryFiltersCard actually round-trips a payment selection through the shared
// component, which the unit test (which mocks FilterBar) cannot.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => (
    <div data-testid="popover" data-open={open} onClick={() => onOpenChange?.(!open)}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function setup(overrides: Partial<React.ComponentProps<typeof EntryFiltersCard>> = {}) {
  const props = {
    searchTerm: '',
    setSearchTerm: vi.fn(),
    paymentFilter: 'all',
    setPaymentFilter: vi.fn(),
    ...overrides,
  };
  render(<EntryFiltersCard {...props} />);
  return props;
}

describe('EntryFiltersCard — FilterBar integration (real FilterBar + FilterPill)', () => {
  it('offers Payment as an addable filter and no active pill when none is set', () => {
    setup({ paymentFilter: 'all' });
    // The shared FilterBar renders a "Payment" option (its add list is rendered
    // inline by the popover stub). No active pill exists yet.
    expect(screen.getByRole('button', { name: 'Payment' })).toBeInTheDocument();
    expect(screen.queryByText('Payment:')).not.toBeInTheDocument();
  });

  it('renders an active Payment pill reflecting the current filter value', () => {
    setup({ paymentFilter: PaymentStatus.REFUNDED });
    // Target the pill by its accessible name — the inline popover stub also
    // renders the (normally hidden) option list, so "Refunded" appears twice.
    // The real FilterPill formats the value via its option label, not the raw
    // enum, so the accessible name proves the human-readable mapping.
    expect(
      screen.getByRole('status', { name: 'Filter: Payment is Refunded' })
    ).toBeInTheDocument();
  });

  it('round-trips a payment selection back to setPaymentFilter with the enum value', async () => {
    const user = userEvent.setup();
    const { setPaymentFilter } = setup({ paymentFilter: 'all' });

    // Add the Payment filter, then pick "Refunded" from the real FilterPill.
    await user.click(screen.getByRole('button', { name: 'Payment' }));
    await user.click(screen.getByRole('button', { name: 'Refunded' }));

    expect(setPaymentFilter).toHaveBeenCalledWith(PaymentStatus.REFUNDED);
  });
});
