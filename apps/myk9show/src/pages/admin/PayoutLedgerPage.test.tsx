import { fireEvent, screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { LedgerRow } from '@/features/payments/payoutLedger';

const mutate = vi.fn();
const refetchLedger = vi.fn();
vi.mock('@/hooks/queries/usePlatformFeePercent', () => ({
  usePlatformFeePercent: () => 7,
}));
vi.mock('@/features/payments/useUpdatePlatformFee', () => ({
  useUpdatePlatformFee: () => ({ mutate, isPending: false }),
}));
const ledgerState = { data: [] as LedgerRow[], isLoading: false, isError: false };
vi.mock('@/features/payments/usePlatformPayoutLedger', () => ({
  usePlatformPayoutLedger: () => ({ ...ledgerState, refetch: refetchLedger }),
}));

// PlatformIncomeCard has its own colocated tests (features/financial/components) —
// stub it here so this page's tests aren't exercising the shared financial RPC.
vi.mock('@/features/financial/components/PlatformIncomeCard', () => ({
  PlatformIncomeCard: () => <div data-testid="platform-income-card-stub" />,
}));

import PayoutLedgerPage from './PayoutLedgerPage';

const row: LedgerRow = {
  showId: 's1',
  showName: 'Spring Trial',
  clubId: 'c1',
  clubName: 'Club One',
  onlineCollectedCents: 5000,
  refundedCents: 0,
  unresolvedRefundDecisionCount: 0,
  netOwedCents: 5000,
  settleDate: '2026-06-13',
  payoutStatus: 'completed',
  stripeTransferId: 'tr_1',
};

describe('PayoutLedgerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledgerState.data = [row];
    ledgerState.isLoading = false;
    ledgerState.isError = false;
  });

  it('renders the platform fee card with the current rate', () => {
    render(<PayoutLedgerPage />);
    expect(screen.getByText('Platform fee')).toBeInTheDocument();
    expect(screen.getByText('7%')).toBeInTheDocument();
  });

  it('connects fee validation to the field and announces a successful update inline', () => {
    mutate.mockImplementationOnce((_percent, options) => options.onSuccess(8));
    render(<PayoutLedgerPage />);

    const input = screen.getByRole('spinbutton', { name: /fee percent/i });
    fireEvent.change(input, { target: { value: '21' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/between 0 and 20/i);

    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: /update fee/i }));
    expect(screen.getByRole('status')).toHaveTextContent('Platform fee updated to 8%');
  });

  it('does not treat an empty fee field as zero', () => {
    render(<PayoutLedgerPage />);

    const input = screen.getByRole('spinbutton', { name: /fee percent/i });
    fireEvent.change(input, { target: { value: '' } });

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Update fee' })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('prioritizes platform income and the payout ledger above checkout settings', () => {
    render(<PayoutLedgerPage />);
    const headings = screen.getAllByRole('heading').map(heading => heading.textContent);
    expect(headings.indexOf('Platform income')).toBeLessThan(headings.indexOf('Payout ledger'));
    expect(headings.indexOf('Payout ledger')).toBeLessThan(headings.indexOf('Checkout settings'));
    expect(screen.getByTestId('platform-income-card-stub')).toBeInTheDocument();
  });

  it('renders ledger rows + summary from the hook data', () => {
    render(<PayoutLedgerPage />);
    const table = screen.getByRole('table', { name: /payout ledger by show/i });
    expect(within(table).getByText('Club One')).toBeInTheDocument();
    expect(within(table).getByText('Spring Trial')).toBeInTheDocument();
    expect(within(table).getByText('tr_1')).toBeInTheDocument();
    expect(within(table).getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Outstanding to clubs')).toBeInTheDocument();
    // Completed payout → counts toward "paid out", not outstanding.
    expect(screen.getByText('Paid out to date')).toBeInTheDocument();
  });

  it('shows the empty state when there are no online payments', () => {
    ledgerState.data = [];
    render(<PayoutLedgerPage />);
    expect(screen.getByText(/No online payments yet/i)).toBeInTheDocument();
  });

  it('renders an error state, not a zero ledger, when the load fails', () => {
    ledgerState.data = [];
    ledgerState.isError = true;
    render(<PayoutLedgerPage />);
    expect(screen.getByText(/Could not load the payout ledger/i)).toBeInTheDocument();
    // The error must not masquerade as "no payments / zero owed".
    expect(screen.queryByText(/No online payments yet/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetchLedger).toHaveBeenCalledTimes(1);
    ledgerState.isError = false;
  });

  it('renders a refund as a signed deduction', () => {
    ledgerState.data = [{ ...row, refundedCents: 1500 }];
    render(<PayoutLedgerPage />);
    expect(
      within(screen.getByRole('table', { name: /payout ledger by show/i })).getByText('-$15.00')
    ).toBeInTheDocument();
  });

  it('shows a non-blocking advisory with a link to unresolved pulled entries', () => {
    ledgerState.data = [{ ...row, unresolvedRefundDecisionCount: 2 }];

    render(<PayoutLedgerPage />);

    expect(
      screen.getByText(/2 pulled entries with unresolved refund decisions/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /review pulled entries for spring trial/i })
    ).toHaveAttribute('href', '/shows/s1/entry-management?tab=exceptions&exception=pulls');
  });

  it('provides a stacked payout list for narrow screens without hiding row context', () => {
    render(<PayoutLedgerPage />);

    const list = screen.getByRole('list', { name: /payouts by show/i });
    expect(within(list).getByText('Club One')).toBeInTheDocument();
    expect(within(list).getByText('Spring Trial')).toBeInTheDocument();
    const netOwed = within(list).getByText('Net owed').parentElement;
    expect(netOwed).not.toBeNull();
    expect(within(netOwed as HTMLElement).getByText('$50.00')).toBeInTheDocument();
  });

  it('omits the refund advisory when every pulled entry is resolved', () => {
    ledgerState.data = [{ ...row, unresolvedRefundDecisionCount: 0 }];

    render(<PayoutLedgerPage />);

    expect(
      screen.queryByText(/pulled entries? with unresolved refund decisions/i)
    ).not.toBeInTheDocument();
  });

  it('labels a missing club and unscheduled settle date without an em dash', () => {
    ledgerState.data = [{ ...row, clubName: null, settleDate: null }];
    render(<PayoutLedgerPage />);
    const table = screen.getByRole('table', { name: /payout ledger by show/i });
    expect(within(table).getByText('Unknown club')).toBeInTheDocument();
    expect(within(table).getByText('Not scheduled')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
