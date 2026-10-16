import { Routes, Route } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import type { ScoringEntry } from './types';

/**
 * MYK9-1246: a paper save that is rejected must say so, keep what the
 * secretary typed, and neither advance nor reload. A class with exactly one
 * dog saves like any other: the dog stays on screen showing its result.
 */
const replica = vi.hoisted(() => ({
  rows: [] as unknown[],
  updateEntry: vi.fn(),
  loadCalls: 0,
}));

vi.mock('./useScoringBreadcrumb', () => ({
  useScoringBreadcrumb: () => ({ isLoading: true, showId: 'show-1' }),
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'user-1' } }),
}));
vi.mock('@/features/show-map/cockpit/ShowDeskReturnLink', () => ({
  ShowDeskReturnLink: () => null,
}));
vi.mock('./components/SessionToolbar', () => ({ SessionToolbar: () => null }));
vi.mock('./paperScoresheetData', () => ({
  loadEntriesWithDogs: vi.fn(async () => {
    replica.loadCalls += 1;
    return replica.rows;
  }),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    sync: vi.fn(),
    getCurrentAuthUserId: async () => 'user-test',
    getSyncMetadata: vi.fn(async () => ({ totalRows: 1, syncedByAuthUserId: 'user-test' })),
    subscribe: vi.fn(() => () => undefined),
    updateEntry: replica.updateEntry,
    whenShowSyncSettles: vi.fn(() => null),
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi
      .fn()
      .mockResolvedValue({ id: 'class-1', name: 'Container Novice A', trialId: 'trial-1' }),
    subscribe: vi.fn(() => () => undefined),
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getTrialById: vi.fn(async () => ({ id: 'trial-1', showId: 'show-1' })),
    subscribe: vi.fn(() => () => undefined),
  },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { get: vi.fn().mockResolvedValue(null) },
}));

import { PaperScoresheetPage } from './PaperScoresheetPage';

const dog = (entryId: string, callName: string, order: number): ScoringEntry =>
  ({
    entryId,
    classId: 'class-1',
    dogId: `dog-${entryId}`,
    callName,
    handler: 'Pat Handler',
    breed: 'Bloodhound',
    armband: 100 + order,
    status: 'pending',
    inRing: false,
    isScored: false,
    exhibitorOrder: order,
  }) as ScoringEntry;

function renderPage() {
  return render(
    <Routes>
      <Route path="/scoring/classes/:classId/entries" element={<PaperScoresheetPage />} />
    </Routes>,
    { initialRoute: '/scoring/classes/class-1/entries?mode=split' }
  );
}

async function enterQualifiedRun() {
  await userEvent.click(await screen.findByRole('button', { name: 'Q' }));
  await userEvent.type(screen.getByLabelText(/search time/i), '10203');
  await userEvent.click(screen.getByRole('button', { name: '+' }));
}

describe('PaperScoresheetPage — saving (MYK9-1246)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replica.loadCalls = 0;
    replica.updateEntry.mockReset();
    replica.updateEntry.mockResolvedValue('mutation-1');
  });

  it('saves the only entry in a class with its result, time and faults, and keeps the dog on screen', async () => {
    replica.rows = [dog('e1', 'Willow', 1)];
    renderPage();
    await enterQualifiedRun();
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(replica.updateEntry).toHaveBeenCalledTimes(1));
    expect(replica.updateEntry).toHaveBeenCalledWith(
      'e1',
      expect.objectContaining({
        result_status: 'qualified',
        is_scored: true,
        search_time_seconds: 62.03,
        total_faults: 1,
      })
    );
    expect(screen.getAllByText('Willow').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Q' })).toHaveAttribute('data-selected', 'true');
  });

  it('says the score was not saved, keeps the typed values, and does not reload or advance', async () => {
    replica.rows = [dog('e1', 'Willow', 1), dog('e2', 'Cooper', 2)];
    replica.updateEntry.mockRejectedValue(new Error('Entry e1 not found'));
    renderPage();
    await enterQualifiedRun();
    const loadsBefore = replica.loadCalls;
    await userEvent.click(screen.getByRole('button', { name: /save & next/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /score not saved for 101 willow: entry e1 not found/i
    );
    expect(screen.getByLabelText(/search time/i)).toHaveValue('1:02.03');
    expect(screen.getByRole('button', { name: 'Q' })).toHaveAttribute('data-selected', 'true');
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled();
    expect(screen.getAllByText('Willow').length).toBeGreaterThan(0);
    expect(replica.loadCalls).toBe(loadsBefore);
  });

  it('says a clear failed, naming the dog, and reloads so the list shows the score that stayed', async () => {
    replica.rows = [
      { ...dog('e1', 'Willow', 1), isScored: true, status: 'completed', result: 'qualified' },
    ];
    replica.updateEntry.mockRejectedValue(new Error('queue full'));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /clear result/i }));
    const dialog = await screen.findByRole('alertdialog');
    const loadsBefore = replica.loadCalls;
    await userEvent.click(within(dialog).getByRole('button', { name: /clear result/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /result not cleared for 101 willow: queue full/i
    );
    await waitFor(() => expect(replica.loadCalls).toBe(loadsBefore + 1));
  });
});
