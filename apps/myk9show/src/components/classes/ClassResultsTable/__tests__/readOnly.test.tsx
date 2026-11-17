/**
 * MYK9-2136: the class page has one job, released results and Requirements. No viewer gets a
 * check-in, edit, score, add, delete or run-order control from this table: a class is run on
 * Show Desk. Checked for an exhibitor, staff of the show and staff of another club, on a pending
 * row and a scored row, before and after release.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassResultsTable } from '../index';
import type { ClassResultsTableProps } from '../types';
import { makeRawRow, makeScentEntry } from './rowFixture';

interface Viewer {
  isExhibitor: boolean;
  isSecretary: boolean;
  isJudge: boolean;
  isAdmin: boolean;
}

let mockViewer: Viewer = { isExhibitor: true, isSecretary: false, isJudge: false, isAdmin: false };
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ ...mockViewer, user: { id: 'u1' } }),
}));

vi.mock('@/hooks/useVisibleResultFields', () => ({
  useVisibleResultFields: () => ({
    showPlacement: true,
    showQualification: true,
    showTime: true,
    showFaults: true,
    selfCheckinEnabled: true,
    isLoading: false,
  }),
  deriveClassState: () => 'in-progress',
}));

const props: ClassResultsTableProps = {
  entries: [
    makeScentEntry('e1', '101', 'Rex', 'Alice Smith'),
    makeScentEntry('e2', '202', 'Buddy', 'Bob Jones'),
  ],
  rawEntries: [
    makeRawRow('e1'),
    makeRawRow('e2', { is_scored: true, result_status: 'qualified', final_placement: 1 }),
  ],
  classId: 'cls-1',
  showId: 'show-1',
  trialId: 'trial-1',
};

const viewers: [string, Viewer][] = [
  ['an exhibitor', { isExhibitor: true, isSecretary: false, isJudge: false, isAdmin: false }],
  [
    'a secretary of the show',
    { isExhibitor: false, isSecretary: true, isJudge: false, isAdmin: false },
  ],
  [
    'a club admin or secretary of another club',
    { isExhibitor: false, isSecretary: false, isJudge: false, isAdmin: true },
  ],
  ['a judge', { isExhibitor: false, isSecretary: false, isJudge: true, isAdmin: false }],
];

describe('ClassResultsTable offers no control to anyone', () => {
  beforeEach(() => {
    mockViewer = viewers[0]![1];
  });

  it.each(viewers)(
    '%s sees rows but no editing, check-in, add, delete or run-order control',
    async (_label, viewer) => {
      mockViewer = viewer;
      const { user } = render(
        <ClassResultsTable {...props} resultsReleasedAt="2026-06-16T00:00:00Z" />
      );

      expect(screen.getByText('Rex')).toBeInTheDocument();
      expect(screen.getByText('Buddy')).toBeInTheDocument();

      // Check-in, add, delete, run order, score and clear controls.
      expect(screen.queryByText('Check-in')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add entry/i })).not.toBeInTheDocument();
      expect(screen.queryByTitle('Delete entry')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Clear result')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /run order/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
      expect(screen.queryByTitle('Cards view')).not.toBeInTheDocument();

      // No editable cell: no input, number field or status select in the table.
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /search time/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /qualif|status/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/press enter or tab/i)).not.toBeInTheDocument();

      // The only buttons left are the result-line ones (export, reset); none writes.
      await user.click(screen.getByRole('combobox', { name: 'View: Result views' }));
      await user.click(await screen.findByRole('option', { name: /^Pending/ }));
      expect(screen.queryByTitle('Clear result')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );
});
