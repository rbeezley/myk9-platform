import { render, screen } from '@/test/utils/testUtils';
import { TrialEntryCounts } from '../TrialEntryCounts';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: '',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Smith' },
  entries: [
    { id: 'e1', armband: 101, runOrder: 1, callName: 'Buddy', breed: 'Lab', handler: 'Jane', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, classElement: 'Container', classLevel: 'Novice', classSection: null, classId: 'c1' },
    { id: 'e2', armband: 102, runOrder: 2, callName: 'Rex', breed: 'Beagle', handler: 'Bob', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, classElement: 'Container', classLevel: 'Novice', classSection: null, classId: 'c1' },
    { id: 'e3', armband: 103, runOrder: 3, callName: 'Max', breed: 'GSD', handler: 'Carlos', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, classElement: 'Interior', classLevel: 'Advanced', classSection: null, classId: 'c2' },
  ],
  allClasses: [],
  allTrials: [],
};

describe('TrialEntryCounts', () => {
  it('renders trial number in heading', () => {
    render(<TrialEntryCounts {...baseProps} />);
    expect(screen.getAllByText(/Trial 1/i).length).toBeGreaterThan(0);
  });

  it('renders element section headers', () => {
    render(<TrialEntryCounts {...baseProps} />);
    expect(screen.getAllByText(/Container/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Interior/i).length).toBeGreaterThan(0);
  });

  it('shows entry count per class group', () => {
    render(<TrialEntryCounts {...baseProps} />);
    // Container Novice: 2
    const cells = screen.getAllByRole('cell');
    expect(cells.some(c => c.textContent === '2')).toBe(true);
  });

  it('shows element total', () => {
    render(<TrialEntryCounts {...baseProps} />);
    // Container element total = 2
    expect(screen.getByText('Container Element Total: 2')).toBeInTheDocument();
  });

  it('shows trial entry total', () => {
    render(<TrialEntryCounts {...baseProps} />);
    const footer = document.querySelector('.stats-footer')!;
    expect(footer).toHaveTextContent('Trial Entry Total: 3');
  });

  it('shows unique people count', () => {
    render(<TrialEntryCounts {...baseProps} />);
    const footer = document.querySelector('.stats-footer')!;
    expect(footer).toHaveTextContent('People: 3');
  });

  it('shows unique dogs count', () => {
    render(<TrialEntryCounts {...baseProps} />);
    const footer = document.querySelector('.stats-footer')!;
    expect(footer).toHaveTextContent('Dogs: 3');
  });
});
