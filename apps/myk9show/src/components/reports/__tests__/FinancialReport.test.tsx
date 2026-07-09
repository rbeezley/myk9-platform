import { render, screen } from '@/test/utils/testUtils';
import { FinancialReport } from '../FinancialReport';
import { PaymentStatus } from '@/types/show-registration-types';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: 'current',
  entries: [
    {
      id: 'e1',
      armband: 101,
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
      entryFee: 25,
      entryStatus: 'accepted',
      paymentStatus: PaymentStatus.PAID_BY_CHECK,
      paymentMethod: 'check',
      trialNumber: '1',
    },
    {
      id: 'e2',
      armband: 102,
      runOrder: 2,
      callName: 'Rex',
      breed: 'Beagle',
      handler: 'Jane Mitchell',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      entryFee: 25,
      discountAmount: 5,
      entryStatus: 'accepted',
      paymentStatus: PaymentStatus.PAID_BY_CHECK,
      paymentMethod: 'check',
      trialNumber: '1',
    },
    {
      id: 'e3',
      armband: 103,
      runOrder: 3,
      callName: 'Max',
      breed: 'GSD',
      handler: 'Bob Smith',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      entryFee: 30,
      entryStatus: 'accepted',
      paymentStatus: PaymentStatus.PENDING,
      trialNumber: '2',
    },
    {
      id: 'e4',
      armband: 104,
      runOrder: 4,
      callName: 'Daisy',
      breed: 'Poodle',
      handler: 'Carlos',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      entryFee: 25,
      entryStatus: 'waitlist',
      paymentStatus: PaymentStatus.PENDING,
      trialNumber: '2',
    },
  ],
};

describe('FinancialReport', () => {
  it('renders report title', () => {
    render(<FinancialReport {...baseProps} />);
    expect(screen.getByText(/Financial Report/i)).toBeInTheDocument();
  });

  it('groups entries by exhibitor', () => {
    render(<FinancialReport {...baseProps} />);
    expect(screen.getByText('Jane Mitchell')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
  });

  it('shows per-entry gross fee', () => {
    render(<FinancialReport {...baseProps} />);
    const feeCells = screen.getAllByText('$25.00');
    expect(feeCells.length).toBeGreaterThanOrEqual(2);
  });

  it('shows exhibitor net retained subtotal', () => {
    render(<FinancialReport {...baseProps} />);
    expect(screen.getByText('Jane Mitchell Net Retained: $45.00')).toBeInTheDocument();
  });

  it('shows closeout totals', () => {
    render(<FinancialReport {...baseProps} />);
    expect(screen.getByText('Current Entries')).toBeInTheDocument();
    expect(screen.getByText('Payment Method Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Trial Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Net Retained: $45.00')).toBeInTheDocument();
    expect(screen.getAllByText('$30.00').length).toBeGreaterThanOrEqual(1);
  });

  it('filters to waitlisted when sortOrder=waitlist', () => {
    render(<FinancialReport {...baseProps} sortOrder="waitlist" />);
    expect(screen.getByText('Daisy')).toBeInTheDocument();
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.queryByText('Jane Mitchell')).not.toBeInTheDocument();
  });

  it('shows empty state when no entries match filter', () => {
    render(
      <FinancialReport
        {...baseProps}
        sortOrder="waitlist"
        entries={baseProps.entries.filter(e => e.entryStatus === 'accepted')}
      />
    );
    expect(screen.getByText(/No entries match/i)).toBeInTheDocument();
  });

  it('renders unassigned armbands as an em dash', () => {
    render(
      <FinancialReport
        {...baseProps}
        entries={[
          {
            ...baseProps.entries[0],
            id: 'e-unassigned',
            armband: 0,
            callName: 'NoArm',
            handler: 'Unassigned Handler',
          },
        ]}
      />
    );

    const noArmCell = screen.getByText('NoArm');
    expect(noArmCell.parentElement?.querySelectorAll('td')[1]).toHaveTextContent('—');
  });
});
