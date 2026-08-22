import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { MyPayment } from '@/features/payments/useMyPayments';
import type { EntryBalanceSummary } from '@/features/payments/entryBalanceSummary';

// Source guard: the phone-width disclosure must be driven by the measured
// container width (useElementWidth), not a CSS-only breakpoint that would
// force us to render a second, hidden copy of the row markup. Mocking this
// hook is the only way to force the narrow layout in jsdom, which has no
// real box layout (MYK9-71 elderly/novice audit, 390px Payments finding).
const useElementWidthMock = vi.fn();
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => useElementWidthMock(),
}));

const state: { data: MyPayment[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
const paymentYearsState: {
  data: string[] | undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: ReturnType<typeof vi.fn>;
} = {
  data: undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
};
const balanceState: {
  data: EntryBalanceSummary;
  isLoading: boolean;
  isError: boolean;
} = {
  data: {
    currentFeesCents: 0,
    amountDueCents: 0,
    onlineDueCents: 0,
    payAtShowDueCents: 0,
    onlineShowBalances: [],
  },
  isLoading: false,
  isError: false,
};
vi.mock('@/features/payments/useMyPayments', () => ({
  useMyPayments: () => state,
  useMyPaymentYears: () => paymentYearsState,
}));
vi.mock('@/features/payments/useMyEntryBalanceSummary', () => ({
  useMyEntryBalanceSummary: () => balanceState,
}));

import ExhibitorPaymentsPage from './ExhibitorPaymentsPage';

const payment: MyPayment = {
  id: 'o1',
  date: '2026-06-10T00:00:00Z',
  showId: 'show-1',
  showName: 'Spring Trial',
  amountCents: 5300,
  netPaidCents: 5300,
  currency: 'usd',
  status: 'succeeded',
  reference: 'pi_abc123',
  refundedAt: null,
  entryIds: ['e1'],
  refunds: [],
};

describe('ExhibitorPaymentsPage on a 390px phone', () => {
  beforeEach(() => {
    state.data = [payment];
    state.isLoading = false;
    state.isError = false;
    paymentYearsState.data = undefined;
    paymentYearsState.isError = false;
    paymentYearsState.isFetching = false;
    paymentYearsState.refetch = vi.fn();
    balanceState.data = {
      currentFeesCents: 0,
      amountDueCents: 0,
      onlineDueCents: 0,
      payAtShowDueCents: 0,
      onlineShowBalances: [],
    };
    balanceState.isLoading = false;
    balanceState.isError = false;
    useElementWidthMock.mockReset();
  });

  it('makes amount, status, and receipt discoverable via accessible queries at a 390px container width', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 390 });
    render(<ExhibitorPaymentsPage />);

    const card = screen.getByRole('group', { name: /payment for spring trial/i });

    // Amount: reachable by an accessible label, not just floating text.
    expect(within(card).getByLabelText(/amount: \$53\.00/i)).toBeInTheDocument();

    // Status: reachable by an accessible label.
    expect(within(card).getByLabelText(/status: paid/i)).toBeInTheDocument();

    // Receipt: an accessible, labeled link to where the receipt lives, scoped
    // to this order's entries exactly as on desktop.
    const receiptLink = within(card).getByRole('link', { name: /receipt for spring trial/i });
    expect(receiptLink).toHaveAttribute('href', '/exhibitor/entries?showId=show-1&entryIds=e1');
  });

  it('gives every interactive target a 44px minimum height on a 390px phone', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 390 });
    render(<ExhibitorPaymentsPage />);

    const receiptLink = screen.getByRole('link', { name: /receipt for spring trial/i });
    expect(receiptLink).toHaveClass('min-h-11');
  });

  it('offers the same cart-recovery retry link as desktop for a failed payment', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 390 });
    state.data = [{ ...payment, status: 'failed', showId: 'show-1', entryIds: ['e1', 'e2'] }];
    render(<ExhibitorPaymentsPage />);

    const retry = screen.getByRole('link', { name: /finish payment/i });
    expect(retry).toHaveAttribute('href', '/cart?showId=show-1&entryIds=e1%2Ce2');
    expect(retry).toHaveClass('min-h-11');
  });

  it('does not duplicate the row into a second CSS-hidden copy for the desktop table', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 390 });
    render(<ExhibitorPaymentsPage />);

    // A hidden-duplicate antipattern would produce two matches (one visible,
    // one display:none) for the same accessible name.
    expect(screen.getAllByRole('link', { name: /receipt for spring trial/i })).toHaveLength(1);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('states no receipt is available for a refunded row instead of a bare dash', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 390 });
    state.data = [
      {
        ...payment,
        netPaidCents: 2300,
        refunds: [
          {
            entryId: 'e1',
            amountCents: 3000,
            date: '2026-06-12T00:00:00Z',
            label: 'Copper - Advanced A',
          },
        ],
      },
    ];
    render(<ExhibitorPaymentsPage />);

    const groups = screen.getAllByRole('group');
    const refundCard = groups.find(g => within(g).queryByText(/refund - copper/i));
    expect(refundCard).toBeTruthy();
    // The "Receipt" dt/dd pairing must announce an explicit reason, not just
    // "-", which a screen-reader user can't distinguish from a truncated
    // reference number.
    expect(within(refundCard!).getByText('No receipt (refunded)')).toBeInTheDocument();
    expect(
      within(refundCard!).queryByRole('link', { name: /receipt for/i })
    ).not.toBeInTheDocument();
  });

  it('still renders the full desktop table at a wide container width', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 1024 });
    render(<ExhibitorPaymentsPage />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: /payment for spring trial/i })
    ).not.toBeInTheDocument();
  });
});
