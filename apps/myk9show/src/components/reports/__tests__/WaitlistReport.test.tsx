import { render, screen } from '@/test/utils/testUtils';
import { WaitlistReport } from '../WaitlistReport';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: '',
  entries: [
    { id: 'e1', armband: 101, runOrder: 1, callName: 'Buddy', breed: 'Lab', handler: 'Jane Mitchell', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, paymentStatus: 'waitlisted', paymentMethod: 'Check', entryFee: 25, trialId: 't1', trialNumber: '1', trialDate: '2026-04-12', classId: 'c1', classElement: 'Container', classLevel: 'Novice', classSection: null },
    { id: 'e2', armband: 102, runOrder: 2, callName: 'Rex', breed: 'Beagle', handler: 'Bob Smith', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, paymentStatus: 'waitlisted', paymentMethod: 'PayPal', entryFee: 25, trialId: 't1', trialNumber: '1', trialDate: '2026-04-12', classId: 'c1', classElement: 'Container', classLevel: 'Novice', classSection: null },
    { id: 'e3', armband: 103, runOrder: 3, callName: 'Max', breed: 'GSD', handler: 'Carlos Rivera', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, paymentStatus: 'accepted', paymentMethod: 'Check', entryFee: 25, trialId: 't1', trialNumber: '1', trialDate: '2026-04-12', classId: 'c1', classElement: 'Container', classLevel: 'Novice', classSection: null },
  ],
};

describe('WaitlistReport', () => {
  it('renders report title', () => {
    render(<WaitlistReport {...baseProps} />);
    expect(screen.getByText(/Waitlist/i)).toBeInTheDocument();
  });

  it('shows only waitlisted entries', () => {
    render(<WaitlistReport {...baseProps} />);
    expect(screen.getByText('Jane Mitchell')).toBeInTheDocument();
    expect(screen.getByText('Bob Smith')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Rivera')).not.toBeInTheDocument();
  });

  it('groups entries under trial section', () => {
    render(<WaitlistReport {...baseProps} />);
    expect(screen.getByText(/Trial 1/i)).toBeInTheDocument();
  });

  it('groups entries under class section', () => {
    render(<WaitlistReport {...baseProps} />);
    expect(screen.getByText(/Container Novice/i)).toBeInTheDocument();
  });

  it('shows armband numbers', () => {
    render(<WaitlistReport {...baseProps} />);
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
  });

  it('shows empty state when no waitlisted entries', () => {
    const props = { ...baseProps, entries: baseProps.entries.filter(e => e.paymentStatus === 'accepted') };
    render(<WaitlistReport {...props} />);
    expect(screen.getByText(/No waitlisted entries/i)).toBeInTheDocument();
  });
});
