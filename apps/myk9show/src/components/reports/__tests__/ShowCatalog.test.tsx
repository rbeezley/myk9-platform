import { render, screen } from '@testing-library/react';
import { ShowCatalog } from '../ShowCatalog';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  sortOrder: 'armband',
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
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      trialId: 't1',
      trialNumber: '1',
      trialDate: '2026-04-12',
      classElement: 'Container',
      classLevel: 'Novice',
      classId: 'c2',
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
      isScored: false,
      resultText: null,
      searchTimeSeconds: null,
      totalFaults: null,
      finalPlacement: null,
      trialId: 't1',
      trialNumber: '1',
      trialDate: '2026-04-12',
      classElement: 'Buried',
      classLevel: 'Novice',
      classId: 'c1',
    },
  ],
  allTrials: [{ id: 't1', date: '2026-04-12', trialNumber: '1' }],
  allClasses: [
    { id: 'c1', trialId: 't1', element: 'Buried', level: 'Novice' },
    { id: 'c2', trialId: 't1', element: 'Container', level: 'Novice' },
  ],
};

describe('ShowCatalog', () => {
  it('renders report title', () => {
    render(<ShowCatalog {...baseProps} />);
    expect(screen.getByText(/Show Catalog/i)).toBeInTheDocument();
  });

  it('renders show name', () => {
    render(<ShowCatalog {...baseProps} />);
    expect(screen.getByText('Spring Scent Trial 2026')).toBeInTheDocument();
  });

  it('renders trial section header', () => {
    render(<ShowCatalog {...baseProps} />);
    expect(screen.getByText(/Trial 1/i)).toBeInTheDocument();
  });

  it('sorts entries by armband number within trial', () => {
    render(<ShowCatalog {...baseProps} />);
    const rows = screen.getAllByRole('row');
    // First data row (after header) should be armband 101 (Buddy), not 108 (Max)
    expect(rows[1]).toHaveTextContent('101');
    expect(rows[1]).toHaveTextContent('Buddy');
  });

  it('shows class info for each entry', () => {
    render(<ShowCatalog {...baseProps} />);
    expect(screen.getByText('Buried Novice')).toBeInTheDocument();
    expect(screen.getByText('Container Novice')).toBeInTheDocument();
  });

  it('shows handler name', () => {
    render(<ShowCatalog {...baseProps} />);
    expect(screen.getByText('Jane Mitchell')).toBeInTheDocument();
  });

  it('renders empty state when no entries', () => {
    render(<ShowCatalog {...baseProps} entries={[]} />);
    expect(screen.getByText(/no entries/i)).toBeInTheDocument();
  });

  it('sorts by handler name when sortOrder=handler', () => {
    render(<ShowCatalog {...baseProps} sortOrder="handler" />);
    const rows = screen.getAllByRole('row');
    // Carlos Rivera (C) comes before Jane Mitchell (J) alphabetically
    expect(rows[1]).toHaveTextContent('Carlos Rivera');
  });

  it('sorts by breed when sortOrder=breed', () => {
    render(<ShowCatalog {...baseProps} sortOrder="breed" />);
    const rows = screen.getAllByRole('row');
    // Golden Retriever sorts before GSD alphabetically (G-o vs G-S, locale-aware)
    expect(rows[1]).toHaveTextContent('Golden Retriever');
  });
});
