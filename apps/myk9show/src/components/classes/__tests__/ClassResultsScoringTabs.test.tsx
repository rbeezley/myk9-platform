/**
 * Tests for Pending/Completed/All tab filtering in ClassResultsTable.
 * Verifies that entries are split by scoring status and that tab switching
 * filters both table and card views correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClassResultsTable } from '../ClassResultsTable';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import type { RawEntryRow } from '@/hooks/queries/useClassEntriesRaw';
import { createUserPermissions } from '@/types/user-permissions';

vi.mock('@/components/ui/tabs', () => import('../../common/__tests__/mockTabs'));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isExhibitor: true,
    isSecretary: false,
    isJudge: false,
    user: { id: 'test-user' },
  }),
}));

vi.mock('@/store/entryStore', () => ({
  useEntryStore: vi.fn(() => vi.fn()),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateEntry: vi.fn().mockResolvedValue(null),
  },
}));

/** Create a minimal RawEntryRow for scored entries */
function makeRawEntry(id: string, scored: boolean): RawEntryRow {
  return {
    id,
    class_id: 'class-1',
    show_id: 'show-1',
    dog_id: `dog-${id}`,
    handler_id: `handler-${id}`,
    armband: id.replace('entry-', ''),
    handler: null,
    result_status: scored ? 'qualified' : null,
    is_scored: scored,
    search_time_seconds: scored ? 90 : null,
    total_faults: scored ? 0 : null,
    final_placement: null,
    judge_notes: null,
    disqualification_reason: null,
    scoring_completed_at: null,
  } as RawEntryRow;
}

/** Create a minimal ScentWorkEntry with optional scoring data. */
function makeEntry(
  id: string,
  dogName: string,
  options: { scored?: boolean } = {}
): ScentWorkEntry {
  return {
    id,
    status: 'registered',
    displayInfo: {
      armband: id.replace('entry-', ''),
      dogName,
      dogBreed: 'Mixed',
      handlerName: `Handler of ${dogName}`,
      dogId: `dog-${id}`,
      handlerId: `handler-${id}`,
    },
    classConfig: {
      element: 'Container',
      level: 'Novice',
      timeLimit: 150000,
      multiArea: false,
      warningsEnabled: true,
    },
    // Only populate competitionData when the entry is scored
    ...(options.scored
      ? {
          competitionData: {
            time: '1:30',
            qualification: 'Qualified',
            judgeNotes: '',
          },
        }
      : {}),
  } as ScentWorkEntry;
}

function makeProps(
  entries: ScentWorkEntry[],
  rawEntries: RawEntryRow[] = [],
  overrides: Record<string, unknown> = {}
) {
  return {
    entries,
    rawEntries,
    classConfig: {
      element: 'Container' as const,
      level: 'Novice' as const,
      timeLimit: 150000,
      multiArea: false,
      warningsEnabled: true,
    },
    userPermissions: createUserPermissions('secretary', 'user-1', 'Test User'),
    ...overrides,
  };
}

function renderTable(
  entries: ScentWorkEntry[],
  rawEntries: RawEntryRow[] = [],
  overrides: Record<string, unknown> = {}
) {
  return render(<ClassResultsTable {...makeProps(entries, rawEntries, overrides)} />);
}

describe('ClassResultsTable scoring tabs', () => {
  const unscoredA = makeEntry('entry-1', 'Rex');
  const unscoredB = makeEntry('entry-2', 'Luna');
  const scoredA = makeEntry('entry-3', 'Bella', { scored: true });
  const scoredB = makeEntry('entry-4', 'Max', { scored: true });
  const allEntries = [unscoredA, unscoredB, scoredA, scoredB];

  // Raw entries that mark entry-3 and entry-4 as scored
  const rawScoredA = makeRawEntry('entry-3', true);
  const rawScoredB = makeRawEntry('entry-4', true);
  const rawUnscoredA = makeRawEntry('entry-1', false);
  const rawUnscoredB = makeRawEntry('entry-2', false);
  const allRawEntries = [rawUnscoredA, rawUnscoredB, rawScoredA, rawScoredB];

  it('renders Pending, Completed, and All tabs', () => {
    renderTable(allEntries, allRawEntries);
    expect(screen.getByRole('tab', { name: /Pending/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Completed/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All/ })).toBeInTheDocument();
  });

  it('defaults to the Pending tab', () => {
    renderTable(allEntries, allRawEntries);
    const pendingTab = screen.getByRole('tab', { name: /Pending/ });
    expect(pendingTab).toHaveAttribute('aria-selected', 'true');
  });

  it('shows badge counts on Pending and Completed tabs', () => {
    renderTable(allEntries, allRawEntries);
    // The SubTabs component renders badge counts as small circular spans.
    // Pending: 2 unscored entries, Completed: 2 scored entries
    const tabList = screen.getByRole('tablist');
    const badges = within(tabList).getAllByText(/^[0-9]+$/);
    const badgeValues = badges.map(b => b.textContent);
    expect(badgeValues).toContain('2');
  });

  it('shows only unscored entries in Pending tab (default)', () => {
    renderTable(allEntries, allRawEntries);
    // Pending tab is default - should show unscored entries
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
  });

  it('shows only scored entries when Completed tab is selected', async () => {
    renderTable(allEntries, allRawEntries);
    await userEvent.click(screen.getByText('Completed'));
    expect(screen.queryByText('Rex')).not.toBeInTheDocument();
    expect(screen.queryByText('Luna')).not.toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('shows all entries when All tab is selected', async () => {
    renderTable(allEntries, allRawEntries);
    await userEvent.click(screen.getByText('All'));
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('handles all entries being unscored', () => {
    const entries = [unscoredA, unscoredB];
    renderTable(entries, [rawUnscoredA, rawUnscoredB]);
    // Pending tab (default) should show both
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
  });

  it('handles all entries being scored', async () => {
    const entries = [scoredA, scoredB];
    renderTable(entries, [rawScoredA, rawScoredB]);
    // Pending tab (default) should be empty, switch to Completed
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Completed'));
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('handles empty entries list', () => {
    renderTable([]);
    // Tabs should still render
    expect(screen.getByRole('tab', { name: /Pending/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Completed/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All/ })).toBeInTheDocument();
  });

  it('detects scored entries via rawEntries is_scored flag', () => {
    const cooperEntry = makeEntry('entry-5', 'Cooper');
    const cooperRaw = makeRawEntry('entry-5', true);

    renderTable([unscoredA, cooperEntry], [rawUnscoredA, cooperRaw]);
    // Pending (default) should show only unscored
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.queryByText('Cooper')).not.toBeInTheDocument();
  });
});
