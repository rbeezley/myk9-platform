import {
  captureCsvDownload,
  registeredPageExports,
  resetPageExports,
} from '@/test/utils/csvDownload';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassResultsTable } from '../index';
import type { ClassResultsTableProps } from '../types';
import { makeRawRow, makeScentEntry } from './rowFixture';

// Signed out by default; a signed-in test sets a user.
let mockUser: { id: string } | null = null;
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isExhibitor: true,
    isSecretary: false,
    isJudge: false,
    isAdmin: false,
    user: mockUser,
  }),
}));

let mockVisibility = {
  showPlacement: true,
  showQualification: true,
  showTime: true,
  showFaults: true,
  selfCheckinEnabled: false,
  isLoading: false,
};
vi.mock('@/hooks/useVisibleResultFields', () => ({
  useVisibleResultFields: () => mockVisibility,
  deriveClassState: () => 'results-released',
}));

const readOnlyProps: ClassResultsTableProps = {
  entries: [
    makeScentEntry('e1', '101', 'Rex', 'Alice Smith'),
    makeScentEntry('e2', '202', 'Buddy', 'Bob Jones'),
  ],
  rawEntries: [
    makeRawRow('e1'),
    makeRawRow('e2', {
      is_scored: true,
      result_status: 'qualified',
      final_placement: 1,
      search_time_seconds: 90,
      total_faults: 0,
    }),
  ],
  classId: 'cls-1',
  showId: 'show-1',
  trialId: 'trial-1',
};

const RELEASED = '2026-06-16T00:00:00Z';

// MYK9-993: a signed-out visitor has no header Actions menu, so the export is in the result line.
describe('ClassResultsTable guest Export CSV', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null;
    mockVisibility = {
      showPlacement: true,
      showQualification: true,
      showTime: true,
      showFaults: true,
      selfCheckinEnabled: false,
      isLoading: false,
    };
  });

  async function exportCsv(props: Partial<ClassResultsTableProps> = {}) {
    const { user } = render(
      <ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} {...props} />
    );
    const download = captureCsvDownload();
    try {
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));
      return download.csv().split('\n');
    } finally {
      download.restore();
    }
  }

  it('exports exactly the visible columns and rows of the released table', async () => {
    const lines = await exportCsv();
    expect(lines[0]).toBe('Armband,Dog,Handler,Placement,Qualification,Search Time,Faults');
    // Both rows show on the All tab, so both are exported.
    expect(lines).toHaveLength(3);
    expect(lines.join('\n')).toContain('Rex');
    expect(lines.join('\n')).toContain('Buddy');
  });

  it('leaves out the columns the class hides from the public, values included', async () => {
    mockVisibility = { ...mockVisibility, showPlacement: false, showTime: false };
    const lines = await exportCsv();
    expect(lines[0]).toBe('Armband,Dog,Handler,Qualification,Faults');
    expect(lines.join('\n')).not.toContain('01:30');
  });

  it('exports only the rows the search leaves showing', async () => {
    const { user } = render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    await user.type(screen.getByPlaceholderText(/Search by dog/), 'Buddy');
    const download = captureCsvDownload();
    try {
      await user.click(screen.getByRole('button', { name: 'Export CSV' }));
      const lines = download.csv().split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('Buddy');
    } finally {
      download.restore();
    }
  });

  it('carries no Check-in column on any tab', async () => {
    const lines = await exportCsv();
    expect(lines[0]).not.toContain('Check-in');
  });

  it('is in the result line', () => {
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    const resultLine = screen.getByRole('status').parentElement as HTMLElement;
    expect(within(resultLine).getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  it('is absent before results are released', () => {
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={null} />);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
  });

  it('is absent while the visibility settings are still loading', () => {
    mockVisibility = { ...mockVisibility, isLoading: true };
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
  });

  it('is absent for a signed-in reader, whose header Actions export is unchanged', () => {
    mockUser = { id: 'u1' };
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={RELEASED} />);
    expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
    expect(registeredPageExports().map(item => item.id)).toEqual(['class-results']);
    resetPageExports();
  });
});
