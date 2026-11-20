/**
 * MYK9-2303: money the club paid back directly after the payout is its own figure. It lowers what
 * the club retained, never what was collected, and never reads as a Stripe refund.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { FinancialReport } from '../FinancialReport';
import { buildFinancialReportLine, calculateFinancialReportTotals } from '../financialReportTotals';
import { PaymentStatus } from '@/types/show-registration-types';
import type { ReportEntry } from '@/lib/reports/types';

function entry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    id: 'e1',
    armband: '101',
    runOrder: 1,
    callName: 'Buddy',
    breed: 'Lab',
    handler: 'Jane Mitchell',
    registrationNumber: null,
    checkInStatus: null,
    section: null,
    isScored: false,
    resultText: null,
    searchTimeSeconds: null,
    totalFaults: null,
    finalPlacement: null,
    entryFee: 40,
    entryStatus: 'accepted',
    paymentStatus: PaymentStatus.PAID_ONLINE,
    paymentMethod: 'online',
    trialNumber: '1',
    ...overrides,
  };
}

describe('club-settled refund in the Financial Report', () => {
  it('a $40 entry with a $10 club refund: collected 40, club refunded 10, retained 30', () => {
    const line = buildFinancialReportLine(entry({ clubRefundedAmount: 10 }));
    expect(line).toMatchObject({
      collected: 40,
      refunded: 0,
      clubRefunded: 10,
      netRetained: 30,
    });
  });

  it('carries the figure into the summary, payment and trial buckets', () => {
    const totals = calculateFinancialReportTotals([
      entry({ clubRefundedAmount: 10 }),
      entry({ id: 'e2' }),
    ]);
    expect(totals.summary).toMatchObject({ collected: 80, clubRefunded: 10, netRetained: 70 });
    expect(totals.paymentBreakdown[0]).toMatchObject({ clubRefunded: 10, netRetained: 70 });
    expect(totals.trialBreakdown[0]).toMatchObject({ clubRefunded: 10, netRetained: 70 });
  });

  it('caps the club figure at what the Stripe refund left of the fee', () => {
    const line = buildFinancialReportLine(entry({ refundAmount: 40, clubRefundedAmount: 10 }));
    expect(line).toMatchObject({ refunded: 40, clubRefunded: 0, netRetained: 0 });

    const partial = buildFinancialReportLine(entry({ refundAmount: 35, clubRefundedAmount: 10 }));
    expect(partial).toMatchObject({ refunded: 35, clubRefunded: 5, netRetained: 0 });
  });

  it('is zero when no club refund is recorded, and never negative', () => {
    expect(buildFinancialReportLine(entry()).clubRefunded).toBe(0);
    expect(buildFinancialReportLine(entry({ clubRefundedAmount: -5 })).clubRefunded).toBe(0);
  });

  it('shows the "Refunded by the club" column only when the scope has any', () => {
    const base = { showName: 'Spring', organization: 'AKC', sortOrder: 'current' } as const;
    const { unmount } = render(<FinancialReport {...base} entries={[entry()]} />);
    expect(screen.queryByText('Refunded by the club')).not.toBeInTheDocument();
    unmount();

    render(<FinancialReport {...base} entries={[entry({ clubRefundedAmount: 10 })]} />);
    expect(screen.getAllByText('Refunded by the club').length).toBeGreaterThan(0);
  });
});
