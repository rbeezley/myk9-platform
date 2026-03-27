/**
 * Tests for Pending/Completed/All tab filtering in ClassResultsTable.
 * Verifies that entries are split by scoring status and that tab switching
 * filters both table and card views correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ClassResultsTable } from '../ClassResultsTable';
import type { ScentWorkEntry } from '@/types/scent-work-types';
import { createUserPermissions } from '@/types/user-permissions';

vi.mock('@/components/ui/tabs', () => import('../../common/__tests__/mockTabs'));

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

function makeProps(entries: ScentWorkEntry[], overrides: Record<string, unknown> = {}) {
  return {
    entries,
    classConfig: {
      element: 'Container' as const,
      level: 'Novice' as const,
      timeLimit: 150000,
      multiArea: false,
      warningsEnabled: true,
    },
    userPermissions: createUserPermissions('secretary', 'user-1', 'Test User'),
    onResultsSubmit: vi.fn(),
    ...overrides,
  };
}

function renderTable(entries: ScentWorkEntry[], overrides: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <ClassResultsTable {...makeProps(entries, overrides)} />
    </MemoryRouter>
  );
}

describe('ClassResultsTable scoring tabs', () => {
  const unscoredA = makeEntry('entry-1', 'Rex');
  const unscoredB = makeEntry('entry-2', 'Luna');
  const scoredA = makeEntry('entry-3', 'Bella', { scored: true });
  const scoredB = makeEntry('entry-4', 'Max', { scored: true });
  const allEntries = [unscoredA, unscoredB, scoredA, scoredB];

  it('renders Pending, Completed, and All tabs', () => {
    renderTable(allEntries);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('defaults to the Pending tab', () => {
    renderTable(allEntries);
    const pendingTab = screen.getByText('Pending').closest('[role="tab"]');
    expect(pendingTab).toHaveAttribute('aria-selected', 'true');
  });

  it('shows badge counts on Pending and Completed tabs', () => {
    renderTable(allEntries);
    // The SubTabs component renders badge counts as small circular spans.
    // Pending: 2 unscored entries, Completed: 2 scored entries
    const tabList = screen.getByRole('tablist');
    const badges = within(tabList).getAllByText(/^[0-9]+$/);
    const badgeValues = badges.map(b => b.textContent);
    expect(badgeValues).toContain('2');
  });

  it('shows only unscored entries in Pending tab (default)', () => {
    renderTable(allEntries);
    // Pending tab is default - should show unscored entries
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
  });

  it('shows only scored entries when Completed tab is selected', async () => {
    renderTable(allEntries);
    await userEvent.click(screen.getByText('Completed'));
    expect(screen.queryByText('Rex')).not.toBeInTheDocument();
    expect(screen.queryByText('Luna')).not.toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('shows all entries when All tab is selected', async () => {
    renderTable(allEntries);
    await userEvent.click(screen.getByText('All'));
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('handles all entries being unscored', () => {
    const entries = [unscoredA, unscoredB];
    renderTable(entries);
    // Pending tab (default) should show both
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
  });

  it('handles all entries being scored', async () => {
    const entries = [scoredA, scoredB];
    renderTable(entries);
    // Pending tab (default) should be empty, switch to Completed
    expect(screen.queryByText('Bella')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Completed'));
    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('handles empty entries list', () => {
    renderTable([]);
    // Tabs should still render
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
  });

  it('detects scored entries via judgingState.currentResult', () => {
    const entryWithJudgingState = {
      ...makeEntry('entry-5', 'Cooper'),
      judgingState: {
        isInProgress: false,
        currentResult: {
          searchTime: 90000,
          qualification: 'Qualified' as const,
        },
      },
    } as ScentWorkEntry;

    renderTable([unscoredA, entryWithJudgingState]);
    // Pending (default) should show only unscored
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.queryByText('Cooper')).not.toBeInTheDocument();
  });
});
