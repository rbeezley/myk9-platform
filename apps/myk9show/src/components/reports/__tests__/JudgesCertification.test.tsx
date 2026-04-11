import { render, screen } from '@testing-library/react';
import { JudgesCertification } from '../JudgesCertification';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  clubName: 'Norwegian Elkhound Association of America',
  organization: 'AKC',
  sortOrder: '',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Kathy R Echols' },
  allClasses: [
    { id: 'c1', trialId: 't1', element: 'Container', level: 'Novice', judgeName: 'Kathy R Echols' },
    { id: 'c2', trialId: 't1', element: 'Buried', level: 'Novice', judgeName: 'Kathy R Echols' },
  ],
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
      isScored: true,
      resultText: 'Q',
      searchTimeSeconds: null,
      totalFaults: 0,
      finalPlacement: 1,
      classId: 'c1',
      classElement: 'Container',
    },
    {
      id: 'e2',
      armband: 102,
      runOrder: 2,
      callName: 'Max',
      breed: 'GSD',
      handler: 'Bob',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'NQ',
      searchTimeSeconds: null,
      totalFaults: 1,
      finalPlacement: 9996,
      classId: 'c1',
      classElement: 'Container',
    },
    {
      id: 'e3',
      armband: 103,
      runOrder: 3,
      callName: 'Rex',
      breed: 'Beagle',
      handler: 'Alice',
      registrationNumber: null,
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'Q',
      searchTimeSeconds: null,
      totalFaults: 0,
      finalPlacement: 1,
      classId: 'c2',
      classElement: 'Buried',
    },
  ],
};

describe('JudgesCertification', () => {
  it('renders certification title', () => {
    render(<JudgesCertification {...baseProps} />);
    expect(screen.getByText(/Scent Work Judge.?s Certification/i)).toBeInTheDocument();
  });

  it('shows judge name', () => {
    render(<JudgesCertification {...baseProps} />);
    expect(screen.getByText('Kathy R Echols')).toBeInTheDocument();
  });

  it('shows qualifying count per element', () => {
    render(<JudgesCertification {...baseProps} />);
    const rows = screen.getAllByRole('row');
    expect(
      rows.some(r => r.textContent?.includes('Container') && r.textContent?.includes('1'))
    ).toBe(true);
    expect(rows.some(r => r.textContent?.includes('Buried') && r.textContent?.includes('1'))).toBe(true);
  });

  it('shows correct total qualifying count', () => {
    render(<JudgesCertification {...baseProps} />);
    // Total = 2 (1 Container Q + 1 Buried Q)
    expect(screen.getByText(/Total/i).closest('tr')).toHaveTextContent('2');
  });

  it('renders signature line', () => {
    render(<JudgesCertification {...baseProps} />);
    expect(screen.getByText(/Judge.?s Signature/i)).toBeInTheDocument();
  });
});
