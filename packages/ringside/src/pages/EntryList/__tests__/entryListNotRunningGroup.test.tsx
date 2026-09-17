/**
 * MYK9-645 — the badge must describe the rows beneath it.
 *
 * Passing `statusCounts` alone fixed the NUMBERS and left the LISTS on
 * `!isScored`, so "Pending 65" sat above 66 rows and an unscored
 * `result_status: 'absent'` row counted as Completed in the badge while
 * rendering in the Pending list. The host now hands in a per-entry
 * classification and the page groups its rows by exactly that.
 *
 * This is a RENDER test of `EntryListPage` driving the real
 * `useEntryListFilters`, not a pure-function test: the badge and the rows are
 * produced at different layers and only a render can show them disagreeing.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryListPage } from '../EntryListPage';
import type { EntryListPageProps } from '../pageProps';
import { useEntryListFilters, type EntryGroup } from '../hooks/useEntryListFilters';
import { makeSingleClassProps } from './entryListParity.fixtures';

vi.mock('../components/EntryListContent', () => ({
  EntryListContent: ({ entries }: { entries: { id: string }[] }) => (
    <div data-testid="entry-list-content">
      {entries.map(entry => (
        <div key={entry.id} data-testid="entry-row" data-entry-id={entry.id} />
      ))}
    </div>
  ),
}));

const TOTAL_ROWS = 66;

/** 64 unscored runners, 1 withdrawn, 1 unscored with an `absent` result. */
function makeEntries() {
  const entries = [];
  for (let i = 1; i <= 64; i += 1) {
    entries.push({ id: `pending-${i}`, armband: 100 + i, isScored: false, status: 'no-status' });
  }
  entries.push({ id: 'withdrawn-1', armband: 900, isScored: false, status: 'pulled' });
  entries.push({ id: 'absent-1', armband: 901, isScored: false, status: 'no-status' });
  return entries;
}

/** What the HOST computes from `entry_status` / `check_in_status` / `result_status`. */
const CLASSIFICATION: Record<string, EntryGroup> = Object.fromEntries([
  ...Array.from({ length: 64 }, (_, i) => [`pending-${i + 1}`, 'pending' as EntryGroup]),
  ['withdrawn-1', 'not_running' as EntryGroup],
  ['absent-1', 'completed' as EntryGroup],
]);

function Harness({
  classification,
  statusCounts,
}: {
  classification?: Record<string, EntryGroup>;
  statusCounts?: { pending: number; completed: number };
}) {
  const entries = React.useMemo(makeEntries, []);
  const {
    activeTab,
    setActiveTab,
    sortBy,
    setSortBy,
    searchTerm,
    setSearchTerm,
    filteredEntries,
    pendingEntries,
    completedEntries,
    notRunningEntries,
    entryCounts,
  } = useEntryListFilters({
    entries: entries as never,
    entryClassification: classification,
    prioritizeInRing: true,
    deprioritizePulled: true,
    defaultSort: 'run',
  });

  const base = makeSingleClassProps({ entries: entries as never, loaded: true });
  const props = {
    ...base,
    data: {
      entries,
      classInfo: {
        className: 'Interior Advanced',
        ...(classification ? { entryClassification: classification } : {}),
        ...(statusCounts ? { statusCounts } : {}),
      },
    },
    uiState: { ...base.uiState, localEntries: entries },
    // The page drives the tabs through `uiActions.setActiveTab`; route it at
    // the real hook so a tab switch actually re-groups the rows.
    uiActions: new Proxy(base.uiActions as object, {
      get: (target, prop: string) =>
        prop === 'setActiveTab' ? setActiveTab : (target as Record<string, unknown>)[prop],
    }),
    derived: {
      ...base.derived,
      activeTab,
      setActiveTab,
      sortOrder: sortBy,
      setSortOrder: setSortBy,
      searchTerm,
      setSearchTerm,
      filteredEntries,
      pendingEntries,
      completedEntries,
      notRunningEntries,
      currentEntries: activeTab === 'pending' ? pendingEntries : completedEntries,
      entryCounts,
    },
  } as unknown as EntryListPageProps;

  return <EntryListPage {...props} />;
}

function renderHarness(
  classification?: Record<string, EntryGroup>,
  statusCounts?: { pending: number; completed: number }
) {
  return render(
    <MemoryRouter>
      <Harness
        {...(classification ? { classification } : {})}
        {...(statusCounts ? { statusCounts } : {})}
      />
    </MemoryRouter>
  );
}

/** Rows in the MAIN list — the first `EntryListContent`, above the divider. */
function mainListRowIds(): string[] {
  const lists = screen.getAllByTestId('entry-list-content');
  return within(lists[0] as HTMLElement)
    .getAllByTestId('entry-row')
    .map(row => row.getAttribute('data-entry-id') as string);
}

describe('EntryListPage — Pending badge describes the rows beneath it (MYK9-645)', () => {
  it('counts 64 pending, shows 64 rows above the divider, and groups the withdrawn row', () => {
    renderHarness(CLASSIFICATION);

    // The badges.
    expect(screen.getByText('Pending').closest('button')).toHaveTextContent('64');
    expect(screen.getByText('Completed').closest('button')).toHaveTextContent('1');

    // The rows the Pending badge claims to describe.
    const ids = mainListRowIds();
    expect(ids).toHaveLength(64);
    expect(ids).not.toContain('withdrawn-1');
    expect(ids).not.toContain('absent-1');

    // Not hidden -- visible under its own labelled group (INTENT).
    expect(screen.getByText('Not running (1)')).toBeInTheDocument();
    const lists = screen.getAllByTestId('entry-list-content');
    expect(
      within(lists[1] as HTMLElement)
        .getAllByTestId('entry-row')
        .map(row => row.getAttribute('data-entry-id'))
    ).toEqual(['withdrawn-1']);

    // The 66th row is neither pending nor not-running: an unscored `absent`
    // RESULT is accounted for, so it belongs to Completed -- and used to render
    // in the Pending list while the badge counted it as Completed.
    expect(ids.length + 1 + 1).toBe(TOTAL_ROWS);
  });

  it('puts the unscored absent-result row in the Completed tab, where its badge counts it', () => {
    renderHarness(CLASSIFICATION);

    fireEvent.click(screen.getByText('Completed').closest('button') as HTMLElement);

    expect(mainListRowIds()).toEqual(['absent-1']);
  });

  // The middle rung of the three-source ladder in `EntryListPage`: a host that
  // computes the aggregate pair but not the per-row grouping. Deleting the
  // `statusCounts` argument at the call site reds this.
  it('takes an aggregate statusCounts over the entries-array derivation when no classification is given', () => {
    renderHarness(undefined, { pending: 65, completed: 1 });

    expect(screen.getByText('Pending').closest('button')).toHaveTextContent('65');
    expect(screen.getByText('Completed').closest('button')).toHaveTextContent('1');
  });

  it('ignores an aggregate statusCounts when a classification is present, so the badge matches the rows', () => {
    // A deliberately WRONG aggregate: the per-row classification must win, or a
    // stale aggregate could put the badge back out of step with the list.
    renderHarness(CLASSIFICATION, { pending: 66, completed: 0 });

    expect(screen.getByText('Pending').closest('button')).toHaveTextContent('64');
    expect(mainListRowIds()).toHaveLength(64);
  });

  it('without a classification, falls back to the isScored split and renders no group', () => {
    renderHarness();

    expect(screen.getByText('Pending').closest('button')).toHaveTextContent('66');
    expect(mainListRowIds()).toHaveLength(66);
    expect(screen.queryByText(/Not running/)).not.toBeInTheDocument();
  });
});
