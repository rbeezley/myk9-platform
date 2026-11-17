import {
  captureCsvDownload,
  registeredPageExports,
  resetPageExports,
} from '@/test/utils/csvDownload';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassResultsTable } from '../index';
import type { ClassResultsTableProps } from '../types';
import { makeRawRow, makeScentEntry } from './rowFixture';

// Exhibitor: not staff.
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isExhibitor: true,
    isSecretary: false,
    isJudge: false,
    isAdmin: false,
    user: { id: 'u1' },
  }),
}));

vi.mock('@/hooks/useVisibleResultFields', () => ({
  useVisibleResultFields: () => ({
    showPlacement: true,
    showQualification: true,
    showTime: true,
    showFaults: true,
    selfCheckinEnabled: false,
  }),
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

describe('ClassResultsTable released-results tab default', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults a read-only viewer to the All tab when results are released', () => {
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt="2026-06-16T00:00:00Z" />);
    // "Buddy" is scored → only visible on the All/Completed tab, not Pending.
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
  });

  it('stays on Pending for a read-only viewer before results are released', () => {
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={null} />);
    // Pending tab hides the scored entry.
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
  });

  it('flips to All when results are released while the page is already open', () => {
    const { rerender } = render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt={null} />);
    // Initially Pending — scored entry hidden.
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();

    // Results get released while open → tab flips to All, scored entry appears.
    rerender(<ClassResultsTable {...readOnlyProps} resultsReleasedAt="2026-06-16T00:00:00Z" />);
    expect(screen.getByText('Buddy')).toBeInTheDocument();
  });

  it('registers an Export CSV page action for the visible results, in the table view', () => {
    render(<ClassResultsTable {...readOnlyProps} resultsReleasedAt="2026-06-16T00:00:00Z" />);
    const registered = registeredPageExports();
    expect(registered.map(item => item.id)).toEqual(['class-results']);

    const download = captureCsvDownload();
    try {
      registered[0]!.run();
      const lines = download.csv().split('\n');
      expect(lines[0]).toBe('Armband,Dog,Handler,Placement,Qualification,Search Time,Faults');
      expect(lines).toHaveLength(3);
    } finally {
      download.restore();
      resetPageExports();
    }
  });
});
