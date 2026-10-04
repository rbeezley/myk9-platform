import { render, screen } from '@testing-library/react';
import { ResultCatalog } from '../ResultCatalog';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'UKC',
  sortOrder: 'placement',
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
      armband: '101',
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
  allTrials: [{ id: 't1', date: '2026-04-12', trialNumber: '1', registryId: 'UKC' }],
  allClasses: [{ id: 'c1', trialId: 't1', element: 'Buried', level: 'Novice' }],
};

describe('ResultCatalog', () => {
  it('renders report title', () => {
    render(<ResultCatalog {...baseProps} />);
    expect(screen.getByText(/Work Show Results/i)).toBeInTheDocument();
  });

  it('titles the report once per word (no "Scent Work Work")', () => {
    render(<ResultCatalog {...baseProps} organization="UKC" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      /^UKC Scent Work Show Results$/
    );
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

  // Non-AKC sign-off is unchanged by MYK9-1009: a signature + date per class.
  it('renders judge signature and date lines after each class section', () => {
    render(<ResultCatalog {...baseProps} />);
    expect(screen.getByText(/Judge.?s Signature/i)).toBeInTheDocument();
    expect(screen.getByText(/^Date:/i)).toBeInTheDocument();
    expect(screen.queryByText("Judge's initials")).not.toBeInTheDocument();
  });

  it('does not render a signature block for a class with no entries', () => {
    render(
      <ResultCatalog
        {...baseProps}
        allClasses={[
          { id: 'c1', trialId: 't1', element: 'Buried', level: 'Novice' },
          { id: 'c2', trialId: 't1', element: 'Container', level: 'Novice' },
        ]}
      />
    );
    expect(screen.getAllByText(/Judge.?s Signature/i)).toHaveLength(1);
    expect(screen.getByText(/No results for this class/i)).toBeInTheDocument();
  });

  it('renders unassigned armbands as an em dash', () => {
    render(
      <ResultCatalog
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
    expect(rows[1].querySelectorAll('td')[1]).toHaveTextContent('—');
  });
});

/**
 * MYK9-570. The result catalog prints the handler name through the same helper
 * as the show catalog, so the junior mark has to appear on both — a reader
 * comparing the two documents must not find a handler marked on one and not the
 * other. Round 1 found only the show catalog covered.
 */
describe('junior handler mark (MYK9-570)', () => {
  const juniorProps: ReportProps = {
    ...baseProps,
    entries: [
      { ...baseProps.entries[0]!, id: 'j1', handler: 'Mariana Rivera', handlerIsJunior: true },
      { ...baseProps.entries[0]!, id: 'j2', armband: '109', handler: 'Carlos Rivera' },
    ],
  };

  it('marks a junior handler and leaves an adult alone', () => {
    render(<ResultCatalog {...juniorProps} />);
    expect(screen.getByText('Mariana Rivera Jr.')).toBeInTheDocument();
    expect(screen.getByText('Carlos Rivera')).toBeInTheDocument();
    expect(screen.queryByText('Carlos Rivera Jr.')).not.toBeInTheDocument();
  });

  it('prints the plain name when junior status is unknown', () => {
    render(
      <ResultCatalog
        {...baseProps}
        entries={[{ ...baseProps.entries[0]!, handler: 'Unknown Age Person' }]}
      />
    );
    expect(screen.getByText('Unknown Age Person')).toBeInTheDocument();
    expect(screen.queryByText(/Jr\./)).not.toBeInTheDocument();
  });
});
