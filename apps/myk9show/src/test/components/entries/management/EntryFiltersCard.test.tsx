import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntryFiltersCard } from '@/components/entries/management/EntryFiltersCard';
import { PaymentStatus } from '@/types/show-registration-types';
import type {
  FilterBarProps,
  FilterBarState,
} from '@/components/common/FilterBar/types';

// Capture the props EntryFiltersCard hands the shared FilterBar so we can assert
// the payment wiring without depending on FilterBar's own (separately tested) UI.
let lastFilterBarProps: FilterBarProps | null = null;

vi.mock('@/components/common/FilterBar', () => ({
  FilterBar: (props: FilterBarProps) => {
    lastFilterBarProps = props;
    return <div data-testid="filter-bar" />;
  },
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

describe('EntryFiltersCard', () => {
  it('does NOT render a status dropdown (status lives in the tab row)', () => {
    setup();
    // The old card had an "Entry Status" placeholder Select; it must be gone so
    // the tabs are the single status surface.
    expect(screen.queryByText('Entry Status')).not.toBeInTheDocument();
    expect(screen.queryByText('All Status')).not.toBeInTheDocument();
  });

  it('renders the search input and forwards typing to setSearchTerm', async () => {
    const user = userEvent.setup();
    const { setSearchTerm } = setup();
    const input = screen.getByLabelText('Search entries');
    await user.type(input, 'R');
    expect(setSearchTerm).toHaveBeenCalledWith('R');
  });

  it('hides the clear button when search is empty', () => {
    setup({ searchTerm: '' });
    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
  });

  it('shows a clear button when search has text and clears it on click', async () => {
    const user = userEvent.setup();
    const { setSearchTerm } = setup({ searchTerm: 'Rex' });
    const clearBtn = screen.getByLabelText('Clear search');
    await user.click(clearBtn);
    expect(setSearchTerm).toHaveBeenCalledWith('');
  });

  it('passes a Payment select filter definition to FilterBar', () => {
    setup();
    expect(lastFilterBarProps).not.toBeNull();
    const defs = lastFilterBarProps!.filterDefs;
    expect(defs).toHaveLength(1);
    expect(defs[0]).toMatchObject({ key: 'payment', label: 'Payment', type: 'select' });
    expect(defs[0].options?.map(o => o.value)).toEqual([
      PaymentStatus.PENDING,
      PaymentStatus.PAID_ONLINE,
      PaymentStatus.PAID_BY_CHECK,
      PaymentStatus.REFUNDED,
    ]);
  });

  it('maps an inactive paymentFilter ("all") to an empty FilterBar state', () => {
    setup({ paymentFilter: 'all' });
    expect(lastFilterBarProps!.state.filters).toEqual({});
  });

  it('maps an active paymentFilter into the FilterBar state', () => {
    setup({ paymentFilter: PaymentStatus.REFUNDED });
    expect(lastFilterBarProps!.state.filters).toEqual({ payment: PaymentStatus.REFUNDED });
  });

  it('forwards a FilterBar payment selection to setPaymentFilter', () => {
    const { setPaymentFilter } = setup();
    const next: FilterBarState = {
      filters: { payment: PaymentStatus.PAID_ONLINE },
      sortKey: null,
      sortDirection: 'asc',
    };
    lastFilterBarProps!.onStateChange(next);
    expect(setPaymentFilter).toHaveBeenCalledWith(PaymentStatus.PAID_ONLINE);
  });

  it('maps a cleared FilterBar state back to "all"', () => {
    const { setPaymentFilter } = setup({ paymentFilter: PaymentStatus.REFUNDED });
    const next: FilterBarState = { filters: {}, sortKey: null, sortDirection: 'asc' };
    lastFilterBarProps!.onStateChange(next);
    expect(setPaymentFilter).toHaveBeenCalledWith('all');
  });
});
