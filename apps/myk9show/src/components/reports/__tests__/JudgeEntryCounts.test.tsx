import { render, screen } from '@/test/utils/testUtils';
import { JudgeEntryCounts } from '../JudgeEntryCounts';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: 'standard',
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
      classId: 'c1',
    },
    {
      id: 'e3',
      armband: 103,
      runOrder: 3,
      callName: 'Max',
      breed: 'GSD',
      handler: 'Carlos',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      classId: 'c2',
    },
  ],
  allClasses: [
    { id: 'c1', trialId: 't1', element: 'Container', level: 'Novice', judgeName: 'Dr. Smith' },
    { id: 'c2', trialId: 't1', element: 'Interior', level: 'Advanced', judgeName: 'Alice Brown' },
    { id: 'c3', trialId: 't1', element: 'Buried', level: 'Novice', judgeName: 'Dr. Smith' },
  ],
};

describe('JudgeEntryCounts', () => {
  it('renders report title', () => {
    render(<JudgeEntryCounts {...baseProps} />);
    expect(screen.getByText('Judge Entry Counts')).toBeInTheDocument();
  });

  it('renders judge name sections', () => {
    render(<JudgeEntryCounts {...baseProps} />);
    expect(screen.getByText('Dr. Smith')).toBeInTheDocument();
    expect(screen.getByText('Alice Brown')).toBeInTheDocument();
  });

  it('shows entry count per class', () => {
    render(<JudgeEntryCounts {...baseProps} />);
    // c1 has 2 entries, c2 has 1, c3 has 0
    const cells = screen.getAllByRole('cell');
    const countValues = cells.map(c => c.textContent);
    expect(countValues).toContain('2');
    expect(countValues).toContain('1');
    expect(countValues).toContain('0');
  });

  it('shows judge total entry count', () => {
    render(<JudgeEntryCounts {...baseProps} />);
    // Dr. Smith: c1(2) + c3(0) = 2 entries
    expect(screen.getByText(/Dr\. Smith.*2 entries/)).toBeInTheDocument();
  });

  it('does not show time column when sortOrder=standard', () => {
    render(<JudgeEntryCounts {...baseProps} />);
    expect(screen.queryByText('Est. Time')).not.toBeInTheDocument();
  });

  it('shows estimated time column when sortOrder=with-time', () => {
    render(<JudgeEntryCounts {...baseProps} sortOrder="with-time" />);
    const headers = screen.getAllByText('Est. Time');
    expect(headers.length).toBeGreaterThan(0);
    // 2 entries × 45s = 90s = 1:30
    expect(screen.getByText('1:30')).toBeInTheDocument();
  });

  it('shows estimated time column when includeEstimatedTime=true', () => {
    render(<JudgeEntryCounts {...baseProps} includeEstimatedTime={true} />);
    expect(screen.getAllByText('Est. Time').length).toBeGreaterThan(0);
  });
});
