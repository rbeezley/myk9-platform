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
      armband: '108',
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
      armband: '101',
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
  allTrials: [{ id: 't1', date: '2026-04-12', name: 'Trial 1', trialNumber: 'Trial 1' }],
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

  it('renders unassigned armbands as an em dash', () => {
    render(
      <ShowCatalog
        {...baseProps}
        entries={[
          {
            ...baseProps.entries[0],
            id: 'e-unassigned',
            armband: '0',
            callName: 'NoArm',
          },
        ]}
      />
    );

    const rows = screen.getAllByRole('row');
    expect(rows[1].querySelectorAll('td')[0]).toHaveTextContent('—');
  });

  describe('class section (MYK9-1385)', () => {
    const base = baseProps.entries[0]!;
    const withClass = (
      id: string,
      armband: string,
      classElement: string,
      classLevel: string,
      classSection?: string
    ) => ({
      ...base,
      id,
      armband,
      classElement,
      classLevel,
      ...(classSection === undefined ? {} : { classSection }),
    });

    it('prints the A/B section so Novice A and Novice B entries are distinguishable', () => {
      render(
        <ShowCatalog
          {...baseProps}
          entries={[
            withClass('a', '101', 'Interior', 'Novice', 'A'),
            withClass('b', '102', 'Interior', 'Novice', 'B'),
          ]}
        />
      );
      expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
      expect(screen.getByText('Interior Novice B')).toBeInTheDocument();
    });

    it('leaves non-sectioned and empty-section classes unchanged', () => {
      render(
        <ShowCatalog
          {...baseProps}
          entries={[
            withClass('m', '101', 'Interior', 'Master'),
            withClass('e', '102', 'Exterior', 'Excellent', ''),
          ]}
        />
      );
      expect(screen.getByText('Interior Master')).toBeInTheDocument();
      expect(screen.getByText('Exterior Excellent')).toBeInTheDocument();
    });
  });

  it("titles a UKC show with UKC's own sport name", () => {
    render(<ShowCatalog {...baseProps} organization="UKC" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'UKC Nosework Show Catalog'
    );
  });
});
