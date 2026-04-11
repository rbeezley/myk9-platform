import { render, screen } from '@/test/utils/testUtils';
import { ShowEntryCounts } from '../ShowEntryCounts';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: '',
  entries: [
    // Container Novice — 3 entries, 2 people, 2 dogs
    { id: 'e1', armband: 101, runOrder: 1, callName: 'Buddy', breed: 'Lab', handler: 'Jane', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, classElement: 'Container', classLevel: 'Novice', classSection: 'A' },
    { id: 'e2', armband: 102, runOrder: 2, callName: 'Max', breed: 'GSD', handler: 'Bob', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, classElement: 'Container', classLevel: 'Novice', classSection: 'A' },
    { id: 'e3', armband: 103, runOrder: 3, callName: 'Buddy', breed: 'Lab', handler: 'Jane', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, classElement: 'Container', classLevel: 'Novice', classSection: 'B' },
    // Interior Novice — 2 entries
    { id: 'e4', armband: 104, runOrder: 4, callName: 'Rex', breed: 'Beagle', handler: 'Alice', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, classElement: 'Interior', classLevel: 'Novice', classSection: null },
    { id: 'e5', armband: 105, runOrder: 5, callName: 'Daisy', breed: 'Poodle', handler: 'Carol', registrationNumber: null, checkInStatus: null, section: null, isScored: false, resultText: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, classElement: 'Interior', classLevel: 'Novice', classSection: null },
  ],
  allClasses: [],
  allTrials: [],
};

describe('ShowEntryCounts', () => {
  it('renders report title', () => {
    render(<ShowEntryCounts {...baseProps} />);
    expect(screen.getAllByText(/Entry Counts/i).length).toBeGreaterThan(0);
  });

  it('renders show name', () => {
    render(<ShowEntryCounts {...baseProps} />);
    expect(screen.getByText('Spring Scent Trial 2026')).toBeInTheDocument();
  });

  it('renders element section headers', () => {
    render(<ShowEntryCounts {...baseProps} />);
    expect(screen.getAllByText(/Container/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Interior/i).length).toBeGreaterThan(0);
  });

  it('shows entry count per class group', () => {
    render(<ShowEntryCounts {...baseProps} />);
    // Container Novice A: 2, Container Novice B: 1, Interior Novice: 2
    const cells = screen.getAllByRole('cell');
    expect(cells.some(c => c.textContent === '2')).toBe(true);
  });

  it('shows element total', () => {
    render(<ShowEntryCounts {...baseProps} />);
    // Container total = 3
    expect(screen.getByText('Container Element Total: 3')).toBeInTheDocument();
  });

  it('shows show entry total', () => {
    render(<ShowEntryCounts {...baseProps} />);
    const footer = document.querySelector('.stats-footer')!;
    expect(footer).toHaveTextContent('Show Entry Total: 5');
  });

  it('shows unique people count', () => {
    render(<ShowEntryCounts {...baseProps} />);
    const footer = document.querySelector('.stats-footer')!;
    expect(footer).toHaveTextContent('People: 4');
  });

  it('shows unique dogs count', () => {
    render(<ShowEntryCounts {...baseProps} />);
    // registrationNumber is null for all, falls back to callName
    // Unique dogs: Buddy (appears twice but same callName), Max, Rex, Daisy = 4
    const footer = document.querySelector('.stats-footer')!;
    expect(footer).toHaveTextContent('Dogs: 4');
  });
});
