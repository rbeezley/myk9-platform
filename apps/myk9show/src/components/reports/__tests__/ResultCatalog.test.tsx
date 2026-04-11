import { render, screen } from '@testing-library/react';
import { ResultCatalog } from '../ResultCatalog';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: 'placement',
  entries: [
    {
      id: 'e1',
      armband: 108,
      runOrder: 2,
      callName: 'Max',
      breed: 'GSD',
      handler: 'Carlos Rivera',
      registrationNumber: 'DN99999999',
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'NQ',
      searchTimeSeconds: 90,
      totalFaults: 2,
      finalPlacement: 9996,
      trialId: 't1',
      classId: 'c1',
      classElement: 'Buried',
      classLevel: 'Novice',
    },
    {
      id: 'e2',
      armband: 101,
      runOrder: 1,
      callName: 'Buddy',
      breed: 'Golden Retriever',
      handler: 'Jane Mitchell',
      registrationNumber: 'DN12345678',
      checkInStatus: null,
      section: null,
      isScored: true,
      resultText: 'Q',
      searchTimeSeconds: 47.5,
      totalFaults: 0,
      finalPlacement: 1,
      trialId: 't1',
      classId: 'c1',
      classElement: 'Buried',
      classLevel: 'Novice',
    },
  ],
  allTrials: [{ id: 't1', date: '2026-04-12', trialNumber: '1' }],
  allClasses: [{ id: 'c1', trialId: 't1', element: 'Buried', level: 'Novice' }],
};

describe('ResultCatalog', () => {
  it('renders report title', () => {
    render(<ResultCatalog {...baseProps} />);
    expect(screen.getByText(/Work Show Results/i)).toBeInTheDocument();
  });

  it('renders class section heading', () => {
    render(<ResultCatalog {...baseProps} />);
    expect(screen.getByText(/Buried Novice/i)).toBeInTheDocument();
  });

  it('shows Q for qualified entry', () => {
    render(<ResultCatalog {...baseProps} />);
    expect(screen.getByText('Qualified')).toBeInTheDocument();
  });

  it('shows NQ for non-qualifying entry', () => {
    render(<ResultCatalog {...baseProps} />);
    expect(screen.getByText('NQ')).toBeInTheDocument();
  });

  it('lists qualified entries before NQ entries', () => {
    render(<ResultCatalog {...baseProps} />);
    const rows = screen.getAllByRole('row');
    // First data row (after header) should be the Q entry — Buddy (armband 101)
    expect(rows[1]).toHaveTextContent('Buddy');
  });

  it('renders empty state when no entries', () => {
    render(<ResultCatalog {...baseProps} entries={[]} />);
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  it('sorts by armband when sortOrder=armband', () => {
    render(<ResultCatalog {...baseProps} sortOrder="armband" />);
    const rows = screen.getAllByRole('row');
    // armband 101 (Buddy, Q) should come before 108 (Max, NQ) when sorted by armband
    expect(rows[1]).toHaveTextContent('101');
  });

  it('sorts by handler when sortOrder=handler', () => {
    render(<ResultCatalog {...baseProps} sortOrder="handler" />);
    const rows = screen.getAllByRole('row');
    // Carlos Rivera (C) comes before Jane Mitchell (J)
    expect(rows[1]).toHaveTextContent('Carlos Rivera');
  });
});
