import { render, screen } from '@testing-library/react';
import { JudgesSchedule } from '../JudgesSchedule';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: 'trial-date',
  entries: [
    {
      id: 'e1',
      armband: 101,
      runOrder: 1,
      callName: 'Buddy',
      breed: 'Lab',
      handler: 'Jane',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      trialId: 't1',
      classId: 'c1',
    },
    {
      id: 'e2',
      armband: 102,
      runOrder: 2,
      callName: 'Rex',
      breed: 'Beagle',
      handler: 'Bob',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      trialId: 't1',
      classId: 'c1',
    },
  ],
  allTrials: [{ id: 't1', date: '2026-04-12', trialNumber: '1' }],
  allClasses: [
    { id: 'c1', trialId: 't1', element: 'Buried', level: 'Novice', judgeName: 'Dr. Jane Smith' },
    { id: 'c2', trialId: 't1', element: 'Container', level: 'Novice', judgeName: 'Alice Brown' },
  ],
};

describe('JudgesSchedule', () => {
  it('renders report title', () => {
    render(<JudgesSchedule {...baseProps} />);
    expect(screen.getByText(/Judging Schedule/i)).toBeInTheDocument();
  });

  it('renders trial section with date', () => {
    render(<JudgesSchedule {...baseProps} />);
    expect(screen.getByText(/Trial 1/i)).toBeInTheDocument();
    expect(screen.getByText(/4\/12\/2026/)).toBeInTheDocument();
  });

  it('shows class with entry count', () => {
    render(<JudgesSchedule {...baseProps} />);
    expect(screen.getByText(/Buried Novice/i)).toBeInTheDocument();
    // 2 entries in c1
    const cells = screen.getAllByRole('cell');
    expect(cells.some(c => c.textContent === '2')).toBe(true);
  });

  it('shows estimated time — 2 entries × 45s = 1:30', () => {
    render(<JudgesSchedule {...baseProps} />);
    expect(screen.getByText('1:30')).toBeInTheDocument();
  });

  it('shows judge name per class', () => {
    render(<JudgesSchedule {...baseProps} />);
    expect(screen.getByText('Dr. Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('Alice Brown')).toBeInTheDocument();
  });

  it('sorts classes by judge name when sortOrder=judge-name', () => {
    render(<JudgesSchedule {...baseProps} sortOrder="judge-name" />);
    const rows = screen.getAllByRole('row');
    // Alice Brown (A) should appear before Dr. Jane Smith (D)
    expect(rows[1]).toHaveTextContent('Alice Brown');
    expect(rows[2]).toHaveTextContent('Dr. Jane Smith');
  });
});
