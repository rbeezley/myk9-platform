import { render, screen, within } from '@/test/utils/testUtils';
import { TrialSecretaryCertification } from '../TrialSecretaryCertification';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  clubName: 'Twin Cities Dog Club',
  sortOrder: '',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Smith' },
  entries: [
    { id: 'e1', armband: 101, runOrder: 1, callName: 'Buddy', breed: 'Lab', handler: 'Jane', registrationNumber: null, checkInStatus: 'present', section: null, isScored: true, resultText: 'Q', searchTimeSeconds: 90, totalFaults: 0, finalPlacement: 1 },
    { id: 'e2', armband: 102, runOrder: 2, callName: 'Rex', breed: 'Beagle', handler: 'Bob', registrationNumber: null, checkInStatus: 'present', section: null, isScored: true, resultText: 'NQ', searchTimeSeconds: 130, totalFaults: 5, finalPlacement: 9999 },
    { id: 'e3', armband: 103, runOrder: 3, callName: 'Max', breed: 'GSD', handler: 'Carlos', registrationNumber: null, checkInStatus: 'present', section: null, isScored: true, resultText: 'Q', searchTimeSeconds: 85, totalFaults: 0, finalPlacement: 2 },
    { id: 'e4', armband: 104, runOrder: 4, callName: 'Daisy', breed: 'Poodle', handler: 'Ana', registrationNumber: null, checkInStatus: 'withdrawn', section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null },
    { id: 'e5', armband: 105, runOrder: 5, callName: 'Pepper', breed: 'Spaniel', handler: 'Tom', registrationNumber: null, checkInStatus: 'present', section: null, isScored: true, resultText: 'Q', searchTimeSeconds: 75, totalFaults: 0, finalPlacement: 3 },
  ],
};

/** Find the <tr> that contains the given label text and return it for scoped assertions. */
function getStatRow(labelPattern: RegExp) {
  return screen.getByText(labelPattern).closest('tr')!;
}

describe('TrialSecretaryCertification', () => {
  it('renders report title', () => {
    render(<TrialSecretaryCertification {...baseProps} />);
    expect(screen.getByText(/Secretary.s Certification/i)).toBeInTheDocument();
  });

  it('shows total entries count', () => {
    render(<TrialSecretaryCertification {...baseProps} />);
    // 5 total entries
    const row = getStatRow(/Total Entries/i);
    expect(within(row).getByText('5')).toBeInTheDocument();
  });

  it('shows total runs (present count)', () => {
    render(<TrialSecretaryCertification {...baseProps} />);
    // 4 present (e1, e2, e3, e5)
    const row = getStatRow(/Total Runs/i);
    expect(within(row).getByText('4')).toBeInTheDocument();
  });

  it('shows total withdrawals', () => {
    render(<TrialSecretaryCertification {...baseProps} />);
    // 1 withdrawn (e4)
    const row = getStatRow(/Total Withdrawals/i);
    expect(within(row).getByText('1')).toBeInTheDocument();
  });

  it('shows total qualifying scores', () => {
    render(<TrialSecretaryCertification {...baseProps} />);
    // 3 qualifying (e1, e3, e5)
    const row = getStatRow(/Total Qualifying/i);
    expect(within(row).getByText('3')).toBeInTheDocument();
  });

  it('renders a signature line', () => {
    render(<TrialSecretaryCertification {...baseProps} />);
    expect(screen.getByText(/Trial Secretary/i)).toBeInTheDocument();
  });

  it('renders trial date', () => {
    render(<TrialSecretaryCertification {...baseProps} />);
    expect(screen.getByText(/4\/12\/2026/)).toBeInTheDocument();
  });
});
