import { render, screen } from '@testing-library/react';
import { ResultsSheet } from '../ResultsSheet';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';

const makeEntry = (overrides: Partial<ReportEntry> = {}): ReportEntry => ({
  id: '1',
  armband: 100,
  runOrder: null,
  callName: 'Buddy',
  breed: 'Labrador',
  handler: 'Jane Smith',
  registrationNumber: null,
  checkInStatus: null,
  section: null,
  isScored: true,
  resultText: 'qualified',
  searchTimeSeconds: 45.2,
  totalFaults: 0,
  finalPlacement: 1,
  ...overrides,
});

const baseProps: ReportProps = {
  showName: 'Test Show',
  entries: [],
  sortOrder: 'placement',
};

const threeEntries: ReportEntry[] = [
  makeEntry({
    id: '1',
    armband: 142,
    callName: 'Buddy',
    finalPlacement: 2,
    searchTimeSeconds: 55.3,
  }),
  makeEntry({ id: '2', armband: 108, callName: 'Max', finalPlacement: 1, searchTimeSeconds: 45.2 }),
  makeEntry({
    id: '3',
    armband: 215,
    callName: 'Duke',
    resultText: 'nq',
    finalPlacement: 9996,
    searchTimeSeconds: null,
    totalFaults: 2,
  }),
];

describe('ResultsSheet', () => {
  it('renders "Preliminary Results" in the title', () => {
    render(<ResultsSheet {...baseProps} entries={threeEntries} />);
    expect(screen.getByText(/Preliminary Results/i)).toBeInTheDocument();
  });

  it('renders "myK9Show" branding', () => {
    render(<ResultsSheet {...baseProps} entries={threeEntries} />);
    expect(screen.getByText('myK9Show')).toBeInTheDocument();
  });

  it('sorts by placement by default — place 1 first, place 2 second, NQ last', () => {
    render(<ResultsSheet {...baseProps} entries={threeEntries} />);
    const rows = screen.getAllByRole('row');
    // rows[0] is thead, rows[1..3] are body rows
    expect(rows[1]).toHaveTextContent('Max');
    expect(rows[2]).toHaveTextContent('Buddy');
    expect(rows[3]).toHaveTextContent('Duke');
  });

  it('renders qualified count in the footer', () => {
    render(<ResultsSheet {...baseProps} entries={threeEntries} />);
    expect(screen.getByText(/Qualified Entries: 2/)).toBeInTheDocument();
  });

  it('formats search time correctly (45.2 → "00:45.20")', () => {
    render(<ResultsSheet {...baseProps} entries={threeEntries} />);
    expect(screen.getByText('00:45.20')).toBeInTheDocument();
  });

  it('renders "NQ" status text for non-qualified entries', () => {
    render(<ResultsSheet {...baseProps} entries={threeEntries} />);
    // "NQ" appears in both the place cell and the qualified cell; verify at least one is present
    expect(screen.getAllByText('NQ').length).toBeGreaterThanOrEqual(1);
  });

  it('applies nq-text class to NQ entry qualified cell', () => {
    render(<ResultsSheet {...baseProps} entries={threeEntries} />);
    // Two "NQ" nodes exist: place-cell and nq-text; find the one with nq-text class
    const nqCells = screen.getAllByText('NQ');
    const nqStatusCell = nqCells.find(el => el.classList.contains('nq-text'));
    expect(nqStatusCell).toBeDefined();
    expect(nqStatusCell).toHaveClass('nq-text');
  });

  it('applies qualified-text class to qualified entries', () => {
    render(<ResultsSheet {...baseProps} entries={threeEntries} />);
    // getAllByText('Qualified') includes the <th> header; find only <td> elements
    const qualifiedNodes = screen.getAllByText('Qualified');
    const qualifiedTd = qualifiedNodes.find(el => el.tagName === 'TD');
    expect(qualifiedTd).toBeDefined();
    expect(qualifiedTd).toHaveClass('qualified-text');
  });

  it('renders show name when provided', () => {
    render(<ResultsSheet {...baseProps} entries={[]} />);
    expect(screen.getByText('Test Show')).toBeInTheDocument();
  });

  it('renders class entry count in the footer', () => {
    render(<ResultsSheet {...baseProps} entries={threeEntries} />);
    expect(screen.getByText(/Class Entries: 3/)).toBeInTheDocument();
  });
});
