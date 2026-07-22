import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { LedgerRow } from '@/features/payments/payoutLedger';

const mutate = vi.fn();
vi.mock('@/hooks/queries/usePlatformFeePercent', () => ({
  usePlatformFeePercent: () => 7,
}));
vi.mock('@/features/payments/useUpdatePlatformFee', () => ({
  useUpdatePlatformFee: () => ({ mutate, isPending: false }),
}));
const ledgerState = { data: [] as LedgerRow[], isLoading: false, isError: false };
vi.mock('@/features/payments/usePlatformPayoutLedger', () => ({
  usePlatformPayoutLedger: () => ledgerState,
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
    expect(screen.getByText('Platform Fee')).toBeInTheDocument();
    expect(screen.getByText('7%')).toBeInTheDocument();
  });

  it('renders the platform income section above the payout ledger', () => {
    render(<PayoutLedgerPage />);
    expect(screen.getByText('Platform income')).toBeInTheDocument();
    expect(screen.getByTestId('platform-income-card-stub')).toBeInTheDocument();
  });

  it('renders ledger rows + summary from the hook data', () => {
    render(<PayoutLedgerPage />);
    expect(screen.getByText('Club One')).toBeInTheDocument();
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    expect(screen.getByText('tr_1')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
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
    ledgerState.isError = false;
  });

  it('renders a refund as a signed deduction', () => {
    ledgerState.data = [{ ...row, refundedCents: 1500 }];
    render(<PayoutLedgerPage />);
    expect(screen.getByText('-$15.00')).toBeInTheDocument();
  });

  it('shows a non-blocking advisory with a link to unresolved pulled entries', () => {
    ledgerState.data = [{ ...row, unresolvedRefundDecisionCount: 2 }];

    render(<PayoutLedgerPage />);

    expect(
      screen.getByText(/2 pulled entries with unresolved refund decisions/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /review pulled entries for spring trial/i })
    ).toHaveAttribute('href', '/shows/s1/entry-management?attention=pulled');
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
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
    expect(screen.getByText('Unknown club')).toBeInTheDocument();
    expect(screen.getByText('Not scheduled')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});
