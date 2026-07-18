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
        netPlatformIncome: { status: 'available', netCents: 8500 },
        processingFeePendingCount: 0,
        refundedCents: 2000,
        postHocRefundedCents: 2000,
        snapshotMissingCount: 0,
      },
      chargeVerification: {
        verifiedCount: 0,
        attestedCount: 0,
        mismatchCount: 0,
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
      unrecordedRefundCount: 0,
      chargeMismatchCount: 0,
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
    expect(screen.getByText(/Gross charged − refunded/)).toBeInTheDocument();

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
          netPlatformIncome: { status: 'available', netCents: -5180 },
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

  it('shows net income as pending — never a fake $0/net — when a processing fee is uncaptured', () => {
    overviewState.data = overview({
      summary: {
        ...overview().summary,
        platformIncome: {
          ...overview().summary.platformIncome,
          netPlatformIncome: { status: 'pending', grossCents: 10000 },
          processingFeePendingCount: 4,
        },
      },
    });
    render(<PlatformIncomeCard />);
    expect(screen.getByText('Pending (4)')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
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

  it('lists only genuine attention categories that have a nonzero count', () => {
    overviewState.data = overview({
      attention: {
        failedTransferCount: 2,
        unrecordedRefundCount: 0,
        chargeMismatchCount: 3,
        missingPlatformFeeSnapshotCount: 1,
        totalCount: 6,
      },
    });
    render(<PlatformIncomeCard />);
    expect(screen.getByText('Failed transfers: 2')).toBeInTheDocument();
    expect(screen.getByText('Charge mismatches: 3')).toBeInTheDocument();
    expect(screen.getByText('Missing platform-fee snapshots: 1')).toBeInTheDocument();
    expect(screen.queryByText(/Unrecorded refunds/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No reconciliation attention items/i)).not.toBeInTheDocument();
  });

  it('warns that counts are a floor when the detail walk was truncated', () => {
    overviewState.data = overview({ detailTruncated: true });
    render(<PlatformIncomeCard />);
    expect(screen.getByText(/Showing a partial scan/i)).toBeInTheDocument();
  });
});
