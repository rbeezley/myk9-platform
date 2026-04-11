import { render, screen } from '@/test/utils/testUtils';
import { FinancialReport } from '../FinancialReport';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: 'accepted',
  entries: [
    { id: 'e1', armband: 101, runOrder: 1, callName: 'Buddy', breed: 'Lab', handler: 'Jane Mitchell', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, entryFee: 25, paymentStatus: 'accepted', paymentMethod: 'Check' },
    { id: 'e2', armband: 102, runOrder: 2, callName: 'Rex', breed: 'Beagle', handler: 'Jane Mitchell', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, entryFee: 25, paymentStatus: 'accepted', paymentMethod: 'Check' },
    { id: 'e3', armband: 103, runOrder: 3, callName: 'Max', breed: 'GSD', handler: 'Bob Smith', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, entryFee: 30, paymentStatus: 'accepted', paymentMethod: 'PayPal' },
    { id: 'e4', armband: 104, runOrder: 4, callName: 'Daisy', breed: 'Poodle', handler: 'Carlos', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, entryFee: 25, paymentStatus: 'waitlisted', paymentMethod: 'Check' },
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

  it('shows per-entry fee', () => {
    render(<FinancialReport {...baseProps} />);
    const feeCells = screen.getAllByText('$25.00');
    expect(feeCells.length).toBeGreaterThanOrEqual(2);
  });

  it('shows exhibitor subtotal', () => {
    render(<FinancialReport {...baseProps} />);
    expect(screen.getByText('Jane Mitchell Subtotal: $50.00')).toBeInTheDocument();
  });

  it('shows grand total', () => {
    render(<FinancialReport {...baseProps} />);
    // accepted entries: Jane $50 + Bob $30 = $80
    expect(screen.getByText('Grand Total: $80.00')).toBeInTheDocument();
  });

  it('filters to waitlisted when sortOrder=waitlist', () => {
    render(<FinancialReport {...baseProps} sortOrder="waitlist" />);
    expect(screen.getByText('Daisy')).toBeInTheDocument();
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.queryByText('Jane Mitchell')).not.toBeInTheDocument();
  });

  it('shows empty state when no entries match filter', () => {
    render(<FinancialReport {...baseProps} sortOrder="waitlist" entries={baseProps.entries.filter(e => e.paymentStatus === 'accepted')} />);
    expect(screen.getByText(/No entries match/i)).toBeInTheDocument();
  });
});
