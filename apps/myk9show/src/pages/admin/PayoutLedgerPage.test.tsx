import { fireEvent, screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { LedgerRow } from '@/features/payments/payoutLedger';
import type { PlatformFeeRateState } from '@/hooks/queries/usePlatformFeePercent';

const mutate = vi.fn();
const refetchLedger = vi.fn();
// Mutable so each test can drive the states the page must distinguish. The old
// stub was a literal `() => 7`, which made "loading" and "read failed"
// inexpressible — the exact reason the fee card could assert a rate it had never
// read without failing a test.
const feeState: { percent: number | null; state: PlatformFeeRateState } = {
  percent: 7,
  state: 'ready',
};
vi.mock('@/hooks/queries/usePlatformFeePercent', () => ({
  usePlatformFeePercentQuery: () => feeState,
}));
vi.mock('@/features/payments/useUpdatePlatformFee', () => ({
  useUpdatePlatformFee: () => ({ mutate, isPending: false }),
}));
// `data` is deliberately `LedgerRow[] | undefined`: a paused (offline) query
// delivers undefined with isLoading:false AND isError:false, and the previous
// fixture could not represent that at all.
const ledgerState: { data: LedgerRow[] | undefined; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
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
  showUnavailable: false,
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
    feeState.percent = 7;
    feeState.state = 'ready';
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

/**
 * The three states in which this page previously stated something it did not know.
 * Each of these fails on the unfixed page — that is what makes them worth having.
 */
describe('PayoutLedgerPage — never reports an unknown as a fact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledgerState.data = [row];
    ledgerState.isLoading = false;
    ledgerState.isError = false;
    feeState.percent = 7;
    feeState.state = 'ready';
  });

  it('a PAUSED ledger query is not a platform that owes nothing', () => {
    // networkMode:'online' + no connectivity => neither loading nor errored, and
    // data undefined. The old guard fell through to `rows ?? []` and rendered
    // "Outstanding to clubs $0.00" plus "No online payments yet".
    ledgerState.data = undefined;

    render(<PayoutLedgerPage />);

    expect(screen.getByText(/could not load the payout ledger/i)).toBeInTheDocument();
    expect(screen.getByText(/unavailable right now, not zero/i)).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/no online payments yet/i)).not.toBeInTheDocument();
  });

  it('keeps an unreadable show’s money in the totals and says the show is missing', () => {
    // MYK9-233: entries survive a soft-deleted show; the show row does not.
    ledgerState.data = [
      { ...row, netOwedCents: 5000, payoutStatus: 'completed' },
      {
        ...row,
        showId: 'deadbeef-0000-4000-8000-000000000000',
        showName: null,
        clubId: null,
        clubName: null,
        showUnavailable: true,
        payoutStatus: null,
        settleDate: null,
        onlineCollectedCents: 15_000,
        refundedCents: 2_500,
        netOwedCents: 12_500,
      },
    ];

    render(<PayoutLedgerPage />);

    // Scoped to the table because the page renders the ledger twice (a mobile
    // list and a table, both always in the DOM under jsdom).
    const table = screen.getByRole('table', { name: /payout ledger by show/i });
    // The money is counted, not dropped.
    expect(within(table).getByText('$125.00')).toBeInTheDocument();
    expect(within(table).getByText(/Show unavailable \(deadbeef\)/)).toBeInTheDocument();
    // And the operator is told why a row has no name.
    expect(screen.getByText(/1 show below could not be identified/i)).toBeInTheDocument();
  });

  it('does not state a fee rate it has not read, and refuses the edit', () => {
    feeState.percent = null;
    feeState.state = 'unavailable';

    render(<PayoutLedgerPage />);

    expect(screen.queryByText('7%')).not.toBeInTheDocument();
    expect(screen.getByText(/current rate could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /update fee/i })).toBeDisabled();
  });

  it('does not state a fee rate while it is still loading', () => {
    feeState.percent = null;
    feeState.state = 'loading';

    render(<PayoutLedgerPage />);

    expect(screen.queryByText('7%')).not.toBeInTheDocument();
    expect(screen.getByText(/loading the current rate/i)).toBeInTheDocument();
  });

  it('clears the field when a loaded rate later becomes unavailable', () => {
    // A successful read followed by a failed/paused refetch. The hook stops
    // returning the number; the field must stop showing it too, or the stale
    // claim just moves from the paragraph into the input.
    const { rerender } = render(<PayoutLedgerPage />);
    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(7);

    feeState.percent = null;
    feeState.state = 'unavailable';
    rerender(<PayoutLedgerPage />);

    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(null);
  });

  it('offers no dead-end link for pulled entries on an unreadable show', () => {
    // Entry Management resolves the show through the same reads that failed
    // here, so the page would open with nothing selected. The count still has to
    // be visible — it is money awaiting a decision — but as text, not a trip.
    ledgerState.data = [
      {
        ...row,
        showId: 'deadbeef-0000-4000-8000-000000000000',
        showName: null,
        showUnavailable: true,
        unresolvedRefundDecisionCount: 2,
      },
    ];

    render(<PayoutLedgerPage />);

    expect(
      screen.getByText(/2 pulled entries with unresolved refund decisions/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /review pulled entries/i })).not.toBeInTheDocument();
    expect(screen.getByText(/show record unavailable/i)).toBeInTheDocument();
  });

  it('still links pulled entries for a show it CAN read', () => {
    ledgerState.data = [{ ...row, unresolvedRefundDecisionCount: 2 }];

    render(<PayoutLedgerPage />);

    expect(
      screen.getByRole('link', { name: /review pulled entries for spring trial/i })
    ).toHaveAttribute('href', '/shows/s1/entry-management?tab=exceptions&exception=pulls');
  });

  it('never offers a CACHED rate for editing after a failed refetch', () => {
    // React Query keeps the last good `data` when a refetch fails, and
    // refetchOnWindowFocus is on. Showing that stale number as "current" would
    // let an admin overwrite the live checkout rate from a value we no longer
    // know to be true. The hook reports 'unavailable' with percent: null.
    feeState.percent = null;
    feeState.state = 'unavailable';

    render(<PayoutLedgerPage />);

    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /update fee/i })).toBeDisabled();
    expect(screen.queryByText(/current rate:/i)).not.toBeInTheDocument();
  });

  it('does not claim NO rate is set when the query never ran', () => {
    // A paused (offline) fee query is not loading and not errored. Reporting it
    // as "No platform fee rate is set. Contact support" would raise a false
    // alarm about a row that was never read — the same class of mistake this
    // whole change set exists to remove.
    feeState.percent = null;
    feeState.state = 'unavailable';

    render(<PayoutLedgerPage />);

    expect(screen.queryByText(/no platform fee rate is set/i)).not.toBeInTheDocument();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it('does say so when the rate genuinely resolved to nothing', () => {
    feeState.percent = null;
    feeState.state = 'absent';

    render(<PayoutLedgerPage />);

    expect(screen.getByText(/no platform fee rate is set/i)).toBeInTheDocument();
  });

  it('does not invert the Save gate when the rate is unknown', () => {
    // The sharpest edge of the old bug: with a live rate of 4.5 and a failed
    // read, the page compared against a fabricated 7 — so typing the TRUE rate
    // looked unchanged (Save disabled) and typing 7 looked like an edit.
    feeState.percent = null;
    feeState.state = 'unavailable';

    render(<PayoutLedgerPage />);

    const input = screen.getByRole('spinbutton', { name: /fee percent/i });
    fireEvent.change(input, { target: { value: '4.5' } });
    expect(screen.getByRole('button', { name: /update fee/i })).toBeDisabled();
  });
});
