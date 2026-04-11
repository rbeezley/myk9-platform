import { render, screen } from '@/test/utils/testUtils';
import { StewardReport } from '../StewardReport';
import type { ReportProps } from '@/lib/reports/types';

const baseProps: ReportProps = {
  showName: 'Spring Scent Trial 2026',
  organization: 'AKC',
  clubName: 'Twin Cities Dog Club',
  sortOrder: '',
  trial: { date: '2026-04-12', trialNumber: '1', judgeName: 'Dr. Smith' },
  entries: [],
  allClasses: [
    {
      id: 'c1',
      trialId: 't1',
      element: 'Container',
      level: 'Novice',
      section: null,
      stewards: { 'Table Steward': 'Alice B', Timer: 'Bob C', 'Gate Steward': '', 'Ring Steward': 'Dana E' },
    },
    {
      id: 'c2',
      trialId: 't1',
      element: 'Interior',
      level: 'Advanced',
      section: null,
      stewards: { 'Table Steward': 'Eve F', Timer: '', 'Gate Steward': 'Frank G', 'Ring Steward': '' },
    },
    {
      id: 'c3',
      trialId: 't1',
      element: 'Buried',
      level: 'Novice',
      section: null,
      stewards: {},
    },
  ],
};

describe('StewardReport', () => {
  it('renders report title with trial info', () => {
    render(<StewardReport {...baseProps} />);
    expect(screen.getByText('Steward Report')).toBeInTheDocument();
    expect(screen.getByText(/Trial 1/)).toBeInTheDocument();
  });

  it('renders 4 steward column headers', () => {
    render(<StewardReport {...baseProps} />);
    expect(screen.getByText('Table Steward')).toBeInTheDocument();
    expect(screen.getByText('Timer Steward')).toBeInTheDocument();
    expect(screen.getByText('Gate Steward')).toBeInTheDocument();
    expect(screen.getByText('Ring Steward')).toBeInTheDocument();
  });

  it('renders one row per class', () => {
    render(<StewardReport {...baseProps} />);
    // Element and Level are in separate cells
    const rows = screen.getAllByRole('row');
    // 1 header row + 3 data rows = 4
    expect(rows).toHaveLength(4);
    expect(screen.getByText('Container')).toBeInTheDocument();
    expect(screen.getByText('Interior')).toBeInTheDocument();
    expect(screen.getByText('Buried')).toBeInTheDocument();
  });

  it('shows assigned steward names', () => {
    render(<StewardReport {...baseProps} />);
    expect(screen.getByText('Alice B')).toBeInTheDocument();
    expect(screen.getByText('Bob C')).toBeInTheDocument();
    expect(screen.getByText('Dana E')).toBeInTheDocument();
  });

  it('shows empty cell for unassigned roles', () => {
    render(<StewardReport {...baseProps} />);
    // Gate Steward for row 1 (Container Novice) is blank — no error thrown
    const cells = screen.getAllByRole('cell');
    const gateCell = cells.find(
      cell => cell.textContent === '' && cell.closest('tr')?.textContent?.includes('Container')
    );
    expect(gateCell).toBeDefined();
  });

  it('renders trial date formatted', () => {
    render(<StewardReport {...baseProps} />);
    expect(screen.getByText(/4\/12\/2026/)).toBeInTheDocument();
  });
});
