import { fireEvent, screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { LedgerRow } from '@/features/payments/payoutLedger';
import type { PlatformFeeRateState } from '@/hooks/queries/usePlatformFeeRates';
import type { PlatformFeeRates } from '@/store/cartStore.helpers';

const mutate = vi.fn();
const refetchLedger = vi.fn();
// Mutable so each test can drive the states the page must distinguish. The old
// stub was a literal `() => 7`, which made "loading" and "read failed"
// inexpressible — the exact reason the fee card could assert a rate it had never
// read without failing a test.
const feeState: { rates: PlatformFeeRates | null; state: PlatformFeeRateState } = {
  rates: { percent: 7, flatCents: 0, minCents: 0 },
  state: 'ready',
};
vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRatesQuery: () => feeState,
}));
vi.mock('@/features/payments/useUpdatePlatformFee', () => ({
  useUpdatePlatformFee: () => ({ mutate, isPending: false }),
}));
// `data` is deliberately `LedgerRow[] | undefined`: a paused (offline) query
// delivers undefined with isLoading:false AND isError:false, and the previous
// fixture could not represent that at all.
const ledgerState: {
  data: LedgerRow[] | undefined;
  refundDecisionChecked: boolean;
  isLoading: boolean;
  isError: boolean;
} = {
  data: [],
  refundDecisionChecked: true,
  isLoading: false,
  isError: false,
};
vi.mock('@/features/payments/usePlatformPayoutLedger', () => ({
  usePlatformPayoutLedger: () => ({
    // The hook returns { rows, refundDecisionChecked }; `data: undefined` still
    // has to be representable, so the wrapper is built conditionally.
    data:
      ledgerState.data === undefined
        ? undefined
        : { rows: ledgerState.data, refundDecisionChecked: ledgerState.refundDecisionChecked },
    isLoading: ledgerState.isLoading,
    isError: ledgerState.isError,
    refetch: refetchLedger,
  }),
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
  netOwedSource: 'transfer',
  settleDate: '2026-06-13',
  payoutStatus: 'completed',
  stripeTransferId: 'tr_1',
};

describe('PayoutLedgerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledgerState.data = [row];
    ledgerState.refundDecisionChecked = true;
    ledgerState.isLoading = false;
    ledgerState.isError = false;
    feeState.rates = { percent: 7, flatCents: 0, minCents: 0 };
    feeState.state = 'ready';
  });

  it('renders the platform fee card with the current rate', () => {
    render(<PayoutLedgerPage />);
    expect(screen.getByText('Platform fee')).toBeInTheDocument();
    expect(screen.getByText('7%')).toBeInTheDocument();
  });

  it('connects fee validation to the field and announces a successful update inline', () => {
    mutate.mockImplementationOnce((_rates, options) =>
      options.onSuccess({ percent: 8, flatCents: 0, minCents: 0 })
    );
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
    expect(screen.getByText('Owed to clubs')).toBeInTheDocument();
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
    ledgerState.refundDecisionChecked = true;
    ledgerState.isLoading = false;
    ledgerState.isError = false;
    feeState.rates = { percent: 7, flatCents: 0, minCents: 0 };
    feeState.state = 'ready';
  });

  it('a PAUSED ledger query is not a platform that owes nothing', () => {
    // networkMode:'online' + no connectivity => neither loading nor errored, and
    // data undefined. The old guard fell through to `rows ?? []` and rendered
    // "Owed to clubs $0.00" plus "No online payments yet".
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
    feeState.rates = null;
    feeState.state = 'unavailable';

    render(<PayoutLedgerPage />);

    expect(screen.queryByText('7%')).not.toBeInTheDocument();
    expect(screen.getByText(/current fee could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /update fee/i })).toBeDisabled();
  });

  it('does not state a fee rate while it is still loading', () => {
    feeState.rates = null;
    feeState.state = 'loading';

    render(<PayoutLedgerPage />);

    expect(screen.queryByText('7%')).not.toBeInTheDocument();
    expect(screen.getByText(/loading the current fee/i)).toBeInTheDocument();
  });

  it('makes no rate claim once the read fails, and locks the field', () => {
    // A successful read followed by a failed/paused refetch. The field keeps
    // what the admin was editing — clearing it would destroy an in-progress
    // edit on a transient blip — but the CLAIM about the live rate has to go,
    // and nothing may be submitted against a rate we cannot read.
    const { rerender } = render(<PayoutLedgerPage />);
    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(7);

    feeState.rates = null;
    feeState.state = 'unavailable';
    rerender(<PayoutLedgerPage />);

    expect(screen.queryByText(/current fee:/i)).not.toBeInTheDocument();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /update fee/i })).toBeDisabled();
    // The VALUE goes too. A bare number in a field labelled "Fee percent" is a
    // claim, even disabled. An earlier revision of this test dropped this
    // assertion and the regression became invisible.
    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(null);
  });

  it('keeps a TYPED value when the read fails, rather than destroying the edit', () => {
    // The other half of the same rule: clearing is safe only for a value the
    // page put there itself.
    const { rerender } = render(<PayoutLedgerPage />);
    fireEvent.change(screen.getByRole('spinbutton', { name: /fee percent/i }), {
      target: { value: '9' },
    });

    feeState.rates = null;
    feeState.state = 'unavailable';
    rerender(<PayoutLedgerPage />);

    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(9);
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
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
    feeState.rates = null;
    feeState.state = 'unavailable';

    render(<PayoutLedgerPage />);

    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /update fee/i })).toBeDisabled();
    expect(screen.queryByText(/current fee:/i)).not.toBeInTheDocument();
  });

  it('does not claim NO fee is set when the query never ran', () => {
    // A paused (offline) fee query is not loading and not errored. Reporting it
    // as "No platform fee is set. Contact support" would raise a false
    // alarm about a row that was never read — the same class of mistake this
    // whole change set exists to remove.
    feeState.rates = null;
    feeState.state = 'unavailable';

    render(<PayoutLedgerPage />);

    expect(screen.queryByText(/no platform fee is set/i)).not.toBeInTheDocument();
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it('does say so when the rate genuinely resolved to nothing', () => {
    feeState.rates = null;
    feeState.state = 'absent';

    render(<PayoutLedgerPage />);

    expect(screen.getByText(/no platform fee is set/i)).toBeInTheDocument();
  });

  it('does not invert the Save gate when the rate is unknown', () => {
    // The sharpest edge of the old bug: with a live rate of 4.5 and a failed
    // read, the page compared against a fabricated 7 — so typing the TRUE rate
    // looked unchanged (Save disabled) and typing 7 looked like an edit.
    feeState.rates = null;
    feeState.state = 'unavailable';

    render(<PayoutLedgerPage />);

    const input = screen.getByRole('spinbutton', { name: /fee percent/i });
    fireEvent.change(input, { target: { value: '4.5' } });
    expect(screen.getByRole('button', { name: /update fee/i })).toBeDisabled();
  });
});
/**
 * The majors: things the page showed accurately but described in a way that led
 * the operator to the wrong conclusion.
 */
describe('PayoutLedgerPage — says which situation a row is actually in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledgerState.data = [row];
    ledgerState.refundDecisionChecked = true;
    ledgerState.isLoading = false;
    ledgerState.isError = false;
    feeState.rates = { percent: 7, flatCents: 0, minCents: 0 };
    feeState.state = 'ready';
  });

  it('distinguishes a payout past its settle date from one merely scheduled', () => {
    // Both used to render "Not settled". One is money stuck behind a cron that
    // did not run; the other is a show settling next month.
    ledgerState.data = [
      {
        ...row,
        showId: 'past',
        showName: 'Overdue Show',
        payoutStatus: null,
        settleDate: '2020-01-01',
      },
      {
        ...row,
        showId: 'future',
        showName: 'Future Show',
        payoutStatus: null,
        settleDate: '2099-01-01',
      },
    ];

    render(<PayoutLedgerPage />);
    const table = screen.getByRole('table', { name: /payout ledger by show/i });

    expect(within(table).getByText('Past due')).toBeInTheDocument();
    expect(within(table).getByText('Scheduled')).toBeInTheDocument();
    expect(within(table).queryByText('Not settled')).not.toBeInTheDocument();
  });

  it('marks a Net owed figure that came from the transfer, not from the columns', () => {
    // Collected / Refunds / Net owed read as a subtraction. For a row whose
    // amount was frozen onto the payout record, it is not one.
    ledgerState.data = [
      {
        ...row,
        onlineCollectedCents: 5000,
        refundedCents: 1000,
        netOwedCents: 5000,
        netOwedSource: 'transfer',
      },
    ];

    render(<PayoutLedgerPage />);
    const table = screen.getByRole('table', { name: /payout ledger by show/i });

    expect(within(table).getByText('as transferred')).toBeInTheDocument();
  });

  it('does not mark a row whose columns do subtract', () => {
    ledgerState.data = [
      {
        ...row,
        onlineCollectedCents: 5000,
        refundedCents: 1000,
        netOwedCents: 4000,
        netOwedSource: 'computed',
      },
    ];

    render(<PayoutLedgerPage />);
    const table = screen.getByRole('table', { name: /payout ledger by show/i });

    expect(within(table).queryByText('as transferred')).not.toBeInTheDocument();
  });

  it('says the pull-refund check did not run, instead of rendering its count', () => {
    // The schema fallback backfills refund_decision null for every row, and
    // isUnresolvedPullRefundDecision REQUIRES null — so the count INFLATES:
    // already-denied entries read as unresolved too. The fixture therefore
    // carries a non-zero count, which is what the fallback actually produces.
    // Asserting against 0 would model a state the fallback cannot reach.
    ledgerState.refundDecisionChecked = false;
    ledgerState.data = [{ ...row, unresolvedRefundDecisionCount: 3 }];

    render(<PayoutLedgerPage />);

    expect(screen.getByText(/could not be checked/i)).toBeInTheDocument();
    // ...and the fictional count is not rendered anywhere.
    expect(screen.queryByText(/3 pulled entries/i)).not.toBeInTheDocument();
  });

  it('shows the ordinary advisory when the check did run', () => {
    ledgerState.refundDecisionChecked = true;
    ledgerState.data = [{ ...row, unresolvedRefundDecisionCount: 2 }];

    render(<PayoutLedgerPage />);

    expect(
      screen.getByText(/2 pulled entries with unresolved refund decisions/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/could not be checked/i)).not.toBeInTheDocument();
  });

  it('keeps the scrolling ledger reachable from the keyboard', () => {
    render(<PayoutLedgerPage />);

    const region = screen.getByRole('region', { name: /payout ledger/i });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('does not overwrite an in-progress fee edit when the rate refetches', () => {
    // refetchOnWindowFocus is on. Typing 9, tabbing away and returning used to
    // replace the edit with whatever came back — on the field that sets the
    // live checkout rate.
    const { rerender } = render(<PayoutLedgerPage />);
    const input = screen.getByRole('spinbutton', { name: /fee percent/i });
    fireEvent.change(input, { target: { value: '9' } });

    feeState.rates = { percent: 8, flatCents: 0, minCents: 0 };
    rerender(<PayoutLedgerPage />);

    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(9);
  });
});
/**
 * Codex round 7. All three were consequences of the majors fixes themselves.
 */
describe('PayoutLedgerPage — the majors fixes do not misfire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledgerState.data = [row];
    ledgerState.refundDecisionChecked = true;
    ledgerState.isLoading = false;
    ledgerState.isError = false;
    feeState.rates = { percent: 7, flatCents: 0, minCents: 0 };
    feeState.state = 'ready';
  });

  it('does not call a fully refunded show past due', () => {
    // The cron SKIPS amountCents <= 0, so no payout row is the correct outcome.
    // "Past due" would report correct behaviour as a cron failure.
    ledgerState.data = [
      {
        ...row,
        payoutStatus: null,
        settleDate: '2020-01-01',
        onlineCollectedCents: 5000,
        refundedCents: 5000,
        netOwedCents: 0,
        netOwedSource: 'computed',
      },
    ];

    render(<PayoutLedgerPage />);
    const table = screen.getByRole('table', { name: /payout ledger by show/i });

    expect(within(table).getByText('Nothing owed')).toBeInTheDocument();
    expect(within(table).queryByText('Past due')).not.toBeInTheDocument();
  });

  it('still flags an overdue show that IS owed money', () => {
    ledgerState.data = [
      {
        ...row,
        payoutStatus: null,
        settleDate: '2020-01-01',
        netOwedCents: 5000,
        netOwedSource: 'computed',
      },
    ];

    render(<PayoutLedgerPage />);
    const table = screen.getByRole('table', { name: /payout ledger by show/i });

    expect(within(table).getByText('Past due')).toBeInTheDocument();
  });
});
describe('PayoutLedgerPage — the fee field never contradicts the save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledgerState.data = [row];
    ledgerState.refundDecisionChecked = true;
    ledgerState.isLoading = false;
    ledgerState.isError = false;
    feeState.rates = { percent: 7, flatCents: 0, minCents: 0 };
    feeState.state = 'ready';
  });

  it('does not flash the pre-save rate while the refetch is in flight', () => {
    // On success the cache still holds the OLD rate for a moment. Adopting it
    // would show 7% in the field while the confirmation says it was set to 9%.
    mutate.mockImplementationOnce((_rates, options) =>
      options.onSuccess({ percent: 9, flatCents: 0, minCents: 0 })
    );
    const { rerender } = render(<PayoutLedgerPage />);

    fireEvent.change(screen.getByRole('spinbutton', { name: /fee percent/i }), {
      target: { value: '9' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update fee/i }));

    // The refetch has not landed: the hook still reports the pre-save 7.
    rerender(<PayoutLedgerPage />);

    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(9);
    expect(screen.getByRole('status')).toHaveTextContent('Platform fee updated to 9%');
  });

  it('shows an outside rate change without silently rewriting the field', () => {
    // Seed-once means the input is the admin's editing context, not a mirror of
    // the query. When someone else moves the rate, that shows up in the live
    // line and in what the Save button says it would write — visible, rather
    // than resolved behind the admin's back.
    const { rerender } = render(<PayoutLedgerPage />);
    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(7);

    feeState.rates = { percent: 12, flatCents: 0, minCents: 0 };
    rerender(<PayoutLedgerPage />);

    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(7);
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /update fee to 7%/i })).toBeInTheDocument();
  });
});
describe('PayoutLedgerPage — an unreadable show makes no claims about itself', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledgerState.data = [row];
    ledgerState.refundDecisionChecked = true;
    ledgerState.isLoading = false;
    ledgerState.isError = false;
    feeState.rates = { percent: 7, flatCents: 0, minCents: 0 };
    feeState.state = 'ready';
  });

  const orphan: LedgerRow = {
    ...row,
    showId: 'deadbeef-0000-4000-8000-000000000000',
    showName: null,
    clubId: null,
    clubName: null,
    showUnavailable: true,
    payoutStatus: null,
    settleDate: null,
    netOwedCents: 12_500,
    netOwedSource: 'computed',
  };

  it('does not tell a screen reader the show has no end date', () => {
    // settleDate is null because the shows row was UNREADABLE, not because the
    // show lacks an end date. "the show has no end date" is a claim about a
    // record we could not read — the exact overclaim this page exists to stop,
    // delivered to the audience least able to cross-check it.
    ledgerState.data = [orphan];

    render(<PayoutLedgerPage />);
    const table = screen.getByRole('table', { name: /payout ledger by show/i });

    expect(within(table).getByText('Settle date unknown')).toBeInTheDocument();
    expect(within(table).queryByText(/the show has no end date/i)).not.toBeInTheDocument();
    expect(within(table).queryByText('Not scheduled')).not.toBeInTheDocument();
  });

  it('keeps the settle-date cell agreeing with the badge', () => {
    ledgerState.data = [orphan];

    render(<PayoutLedgerPage />);
    const table = screen.getByRole('table', { name: /payout ledger by show/i });

    expect(within(table).getByText('Unknown')).toBeInTheDocument();
  });

  it('still says "Not scheduled" for a readable show that genuinely has no end date', () => {
    ledgerState.data = [{ ...row, payoutStatus: null, settleDate: null, netOwedCents: 5000 }];

    render(<PayoutLedgerPage />);
    const table = screen.getByRole('table', { name: /payout ledger by show/i });

    expect(within(table).getAllByText('Not scheduled').length).toBeGreaterThan(0);
    expect(within(table).queryByText('Settle date unknown')).not.toBeInTheDocument();
  });
});

/**
 * MYK9-197 — the flat per-checkout component and the floor are editable here,
 * beside the percent, because they are three parts of ONE fee expression and a
 * surface that edits only one of them would leave the row describing a fee
 * nobody chose.
 */
describe('PayoutLedgerPage — the flat component and the floor are editable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ledgerState.data = [row];
    ledgerState.refundDecisionChecked = true;
    ledgerState.isLoading = false;
    ledgerState.isError = false;
    feeState.rates = { percent: 7, flatCents: 0, minCents: 0 };
    feeState.state = 'ready';
  });

  it('seeds all three fields from the live settings', () => {
    feeState.rates = { percent: 7, flatCents: 30, minCents: 100 };
    render(<PayoutLedgerPage />);

    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(7);
    expect(screen.getByRole('spinbutton', { name: /flat amount per checkout/i })).toHaveValue(30);
    expect(screen.getByRole('spinbutton', { name: /minimum fee/i })).toHaveValue(100);
  });

  it('describes the whole fee, not just the percent — "7%" is a lie once a flat component exists', () => {
    feeState.rates = { percent: 7, flatCents: 30, minCents: 100 };
    render(<PayoutLedgerPage />);

    expect(screen.getByText('7% + $0.30, $1.00 minimum')).toBeInTheDocument();
    expect(screen.queryByText('7%')).not.toBeInTheDocument();
  });

  it('writes all three components together', () => {
    render(<PayoutLedgerPage />);

    fireEvent.change(screen.getByRole('spinbutton', { name: /flat amount per checkout/i }), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update fee/i }));

    expect(mutate).toHaveBeenCalledWith(
      { percent: 7, flatCents: 30, minCents: 0 },
      expect.anything()
    );
  });

  it('names the fee it would actually write on the Save button', () => {
    render(<PayoutLedgerPage />);

    fireEvent.change(screen.getByRole('spinbutton', { name: /flat amount per checkout/i }), {
      target: { value: '30' },
    });

    expect(screen.getByRole('button', { name: 'Update fee to 7% + $0.30' })).toBeInTheDocument();
  });

  it('refuses a fractional cent, which the integer column could not hold anyway', () => {
    render(<PayoutLedgerPage />);

    const flat = screen.getByRole('spinbutton', { name: /flat amount per checkout/i });
    fireEvent.change(flat, { target: { value: '30.5' } });

    expect(flat).toHaveAttribute('aria-invalid', 'true');
    expect(flat).toHaveAccessibleDescription(/whole cents between 0 and 500/i);
    expect(screen.getByRole('button', { name: 'Update fee' })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('refuses an out-of-range floor', () => {
    render(<PayoutLedgerPage />);

    const min = screen.getByRole('spinbutton', { name: /minimum fee/i });
    fireEvent.change(min, { target: { value: '2001' } });

    expect(min).toHaveAttribute('aria-invalid', 'true');
    expect(min).toHaveAccessibleDescription(/whole cents between 0 and 2000/i);
    expect(screen.getByRole('button', { name: 'Update fee' })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('does not treat an empty flat/floor field as zero', () => {
    render(<PayoutLedgerPage />);

    fireEvent.change(screen.getByRole('spinbutton', { name: /flat amount per checkout/i }), {
      target: { value: '' },
    });

    expect(screen.getByRole('button', { name: 'Update fee' })).toBeDisabled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('keeps Save disabled while nothing has changed, across all three fields', () => {
    feeState.rates = { percent: 7, flatCents: 30, minCents: 100 };
    render(<PayoutLedgerPage />);

    expect(screen.getByRole('button', { name: 'Update fee' })).toBeDisabled();
  });

  it('clears every field, not just the percent, when the fee stops being readable', () => {
    // A bare number in a field labelled "Flat amount per checkout", beside a line
    // saying the fee could not be loaded, is still a claim.
    feeState.rates = { percent: 7, flatCents: 30, minCents: 100 };
    const { rerender } = render(<PayoutLedgerPage />);

    feeState.rates = null;
    feeState.state = 'unavailable';
    rerender(<PayoutLedgerPage />);

    expect(screen.getByRole('spinbutton', { name: /fee percent/i })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: /flat amount per checkout/i })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: /minimum fee/i })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: /flat amount per checkout/i })).toBeDisabled();
  });
});
