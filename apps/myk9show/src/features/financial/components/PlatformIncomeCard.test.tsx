import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { PlatformFinancialOverview } from './usePlatformFinancialOverview';

const overviewState: {
  data: PlatformFinancialOverview | undefined;
  isLoading: boolean;
  isError: boolean;
} = {
  data: undefined,
  isLoading: false,
  isError: false,
};

vi.mock('./usePlatformFinancialOverview', () => ({
  usePlatformFinancialOverview: () => overviewState,
}));

import { PlatformIncomeCard } from './PlatformIncomeCard';

function overview(overrides: Partial<PlatformFinancialOverview> = {}): PlatformFinancialOverview {
  return {
    summary: {
      scope: 'platform',
      entryAccounting: { lines: [], totals: {} } as never,
      platformIncome: {
        onlineCollectedCents: 100000,
        grossPlatformFeeCents: 10000,
        netPlatformIncome: {
          availableCents: 8500,
          pendingResidualCents: 0,
          pendingOrderCount: 0,
        },
        processingFeePendingCount: 0,
        refundedCents: 2000,
        makeWholeRefundedCents: 0,
        snapshotMissingCount: 0,
        nonEntry: {
          orderCount: 0,
          grossCents: 0,
          refundedCents: 0,
          makeWholeRefundedCents: 0,
          netCents: 0,
        },
      },
      chargeVerification: {
        verifiedCount: 0,
        attestedCount: 0,
        pendingNetCount: 0,
        snapshotMissingCount: 0,
      },
      payoutSettlement: {
        payoutCount: 2,
        completedCents: 50000,
        pendingCents: 30000,
        failedCents: 0,
        failedCount: 0,
        outstandingCents: 30000,
      },
    },
    attention: {
      failedTransferCount: 0,
      missingPlatformFeeSnapshotCount: 0,
      totalCount: 0,
    },
    detailTruncated: false,
    ...overrides,
  };
}

describe('PlatformIncomeCard', () => {
  beforeEach(() => {
    overviewState.data = undefined;
    overviewState.isLoading = false;
    overviewState.isError = false;
  });

  it('shows a loading skeleton while the summary is in flight', () => {
    overviewState.isLoading = true;
    const { container } = render(<PlatformIncomeCard />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('surfaces an error, not a fake $0, when the RPC throws (e.g. unauthorized caller)', () => {
    overviewState.isError = true;
    render(<PlatformIncomeCard />);
    expect(
      screen.getByText(/Could not load platform financial reconciliation/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('presents online collected, gross fee income, and net income as three separate figures with formula labels', () => {
    overviewState.data = overview();
    render(<PlatformIncomeCard />);

    expect(screen.getByText('Online collected')).toBeInTheDocument();
    expect(screen.getByText('$1000.00')).toBeInTheDocument();
    expect(screen.getByText(/Gross charged − post-hoc refunds/)).toBeInTheDocument();

    expect(screen.getByText('Gross platform-fee income')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText(/platform-fee snapshot on each online order/)).toBeInTheDocument();

    expect(screen.getByText('Net platform income')).toBeInTheDocument();
    expect(screen.getByText('$85.00')).toBeInTheDocument();
    expect(
      screen.getByText(/captured Stripe processing fees − post-hoc refunds the platform absorbed/)
    ).toBeInTheDocument();
  });

  it('renders a negative net income as-is (absorbed refunds exceeded fee income), not clamped or hidden', () => {
    overviewState.data = overview({
      summary: {
        ...overview().summary,
        platformIncome: {
          ...overview().summary.platformIncome,
          netPlatformIncome: {
            availableCents: -5180,
            pendingResidualCents: 0,
            pendingOrderCount: 0,
          },
        },
      },
    });
    render(<PlatformIncomeCard />);
    expect(screen.getByText('Net platform income')).toBeInTheDocument();
    expect(screen.getByText('$-51.80')).toBeInTheDocument();
    // Not clamped to zero, not swapped for a pending placeholder.
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/Pending/)).not.toBeInTheDocument();
  });

  // ── ROOT FIX (review finding 2). This used to assert the whole figure read
  // "Pending (4)". One uncaptured fee latched the platform-wide net forever,
  // because nothing retries the fee capture. It must now show a real net over
  // the captured orders AND name the excluded residual.
  it('shows an available net plus a labeled pending residual when a processing fee is uncaptured', () => {
    overviewState.data = overview({
      summary: {
        ...overview().summary,
        platformIncome: {
          ...overview().summary.platformIncome,
          netPlatformIncome: {
            availableCents: 8500,
            pendingResidualCents: 1200,
            pendingOrderCount: 4,
          },
          processingFeePendingCount: 4,
        },
      },
    });
    render(<PlatformIncomeCard />);

    // The headline is a real number, not a "Pending" placeholder.
    expect(screen.getByText('Net platform income so far')).toBeInTheDocument();
    expect(screen.getByText('$85.00')).toBeInTheDocument();
    // ...and the excluded part is stated explicitly, never silently zeroed.
    expect(
      screen.getByText(/Excludes 4 orders whose Stripe processing fee is not captured yet/)
    ).toBeInTheDocument();
    expect(screen.getByText(/up to \$12\.00 of fee income still to net out/)).toBeInTheDocument();
  });

  it('drops the "so far" qualifier and the residual note when nothing is pending', () => {
    overviewState.data = overview();
    render(<PlatformIncomeCard />);
    expect(screen.getByText('Net platform income')).toBeInTheDocument();
    expect(screen.queryByText(/Excludes/)).not.toBeInTheDocument();
  });

  // ── ROOT FIX (review finding 3): non-entry refunds are visible.
  it('shows one-time (non-entry) payments NET of refunds, as their own figure', () => {
    overviewState.data = overview({
      summary: {
        ...overview().summary,
        platformIncome: {
          ...overview().summary.platformIncome,
          nonEntry: {
            orderCount: 3,
            grossCents: 7500,
            refundedCents: 4000,
            makeWholeRefundedCents: 250,
            netCents: 3250,
          },
        },
      },
    });
    render(<PlatformIncomeCard />);
    expect(screen.getByText('One-time payments (net)')).toBeInTheDocument();
    expect(screen.getByText('$32.50')).toBeInTheDocument();
    expect(screen.getByText(/\$75\.00 gross, less \$42\.50 refunded/)).toBeInTheDocument();
  });

  it('omits the one-time payments figure entirely when there are none', () => {
    overviewState.data = overview();
    render(<PlatformIncomeCard />);
    expect(screen.queryByText('One-time payments (net)')).not.toBeInTheDocument();
  });

  it('shows outstanding transfer liability as its own figure, separate from income', () => {
    overviewState.data = overview();
    render(<PlatformIncomeCard />);
    expect(screen.getByText('Outstanding transfer liability')).toBeInTheDocument();
    expect(screen.getByText('$300.00')).toBeInTheDocument();
  });

  it('shows a calm "no attention" state when there is no genuine drift', () => {
    overviewState.data = overview();
    render(<PlatformIncomeCard />);
    expect(screen.getByText(/No reconciliation attention items/i)).toBeInTheDocument();
  });

  it('lists only fact-grounded attention categories that have a nonzero count', () => {
    overviewState.data = overview({
      attention: {
        failedTransferCount: 2,
        missingPlatformFeeSnapshotCount: 1,
        totalCount: 3,
      },
    });
    render(<PlatformIncomeCard />);
    expect(screen.getByText('Failed transfers: 2')).toBeInTheDocument();
    expect(screen.getByText('Missing platform-fee snapshots: 1')).toBeInTheDocument();
    // The inference-based rows are gone from the UI entirely.
    expect(screen.queryByText(/Charge mismatches/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Refund ledger drift/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unrecorded refunds/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No reconciliation attention items/i)).not.toBeInTheDocument();
  });

  it('warns that counts are a floor when the detail walk was truncated', () => {
    overviewState.data = overview({ detailTruncated: true });
    render(<PlatformIncomeCard />);
    expect(screen.getByText(/Showing a partial scan/i)).toBeInTheDocument();
  });
});
