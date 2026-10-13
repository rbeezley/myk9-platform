import { Routes, Route } from 'react-router-dom';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import type { ScoringEntry } from './types';

/**
 * MYK9-1130: a direct cold visit read a present class and an empty, never-synced
 * entries replica, committed that empty read as "0 of 0 scored", and never
 * looked again when the show's entries arrived. The local replica here is a
 * stand-in whose rows, sync metadata and change listeners the test controls.
 */
const replica = vi.hoisted(() => ({
  rows: [] as unknown[],
  synced: false,
  failRead: false,
  listeners: new Set<() => void>(),
  sync: vi.fn(),
  updateEntry: vi.fn(),
  inFlight: null as Promise<void> | null,
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
    if (replica.failRead) throw new Error('IndexedDB read failed');
    return replica.rows;
  }),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    sync: replica.sync,
    getSyncMetadata: vi.fn(async () =>
      replica.synced ? { totalRows: replica.rows.length } : null
    ),
    subscribe: vi.fn((listener: () => void) => {
      replica.listeners.add(listener);
      return () => replica.listeners.delete(listener);
    }),
    updateEntry: replica.updateEntry,
    whenShowSyncSettles: vi.fn(() => replica.inFlight),
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn().mockResolvedValue({
      id: 'class-1',
      name: 'Container Novice',
      trialId: 'trial-1',
    }),
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getTrialById: vi.fn().mockResolvedValue({ id: 'trial-1', showId: 'show-1' }),
  },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: { get: vi.fn().mockResolvedValue(null) },
}));

import { PaperScoresheetPage } from './PaperScoresheetPage';

const dog = (entryId: string, callName: string, order: number, isScored = false): ScoringEntry =>
  ({
    entryId,
    classId: 'class-1',
    dogId: `dog-${entryId}`,
    callName,
    handler: 'Pat Handler',
    breed: 'Beagle',
    armband: 100 + order,
    status: isScored ? 'scored' : 'pending',
    inRing: false,
    isScored,
    exhibitorOrder: order,
  }) as ScoringEntry;

/** Rows landing in the replica: a sync download writes them, then notifies. */
async function deliver(rows: ScoringEntry[]) {
  replica.rows = rows;
  replica.synced = true;
  await act(async () => {
    for (const listener of [...replica.listeners]) listener();
  });
}

function renderPage(mode: 'split' | 'sequential' = 'split') {
  return render(
    <Routes>
      <Route path="/scoring/classes/:classId/entries" element={<PaperScoresheetPage />} />
    </Routes>,
    { initialRoute: `/scoring/classes/class-1/entries?mode=${mode}` }
  );
}

describe('PaperScoresheetPage — entries that reach the replica after mount (MYK9-1130)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replica.rows = [];
    replica.synced = false;
    replica.failRead = false;
    replica.inFlight = null;
    replica.listeners.clear();
    replica.sync.mockResolvedValue({ success: false });
    onlineManager.setOnline(true);
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('never calls a never-synced empty class "0 of 0", and lists the dogs once they sync in', async () => {
    renderPage();

    // The show's entries have not loaded on this device: not a definitive empty.
    expect(await screen.findByText(/not finished loading on this device/)).toBeInTheDocument();
    expect(screen.queryByText('0 of 0 scored')).not.toBeInTheDocument();

    await deliver([dog('e1', 'Willow', 1, true), dog('e2', 'Cooper', 2)]);

    expect(await screen.findByRole('button', { name: /Willow/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cooper/ })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 scored')).toBeInTheDocument();
    expect(screen.queryByText(/not finished loading/)).not.toBeInTheDocument();
  });

  it('picks up rows that arrive after a synced-empty read, without a reload', async () => {
    replica.synced = true;
    renderPage();
    expect(await screen.findByText('0 of 0 scored')).toBeInTheDocument();

    await deliver([dog('e1', 'Willow', 1), dog('e2', 'Cooper', 2)]);

    expect(await screen.findByText('0 of 2 scored')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Willow/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cooper/ })).toBeInTheDocument();
  });

  it('shows the real empty state for a fully synced class with no dogs', async () => {
    replica.synced = true;
    renderPage();

    expect(await screen.findByText('0 of 0 scored')).toBeInTheDocument();
    expect(screen.getByText('No dogs are on this class’s run list.')).toBeInTheDocument();
    expect(screen.queryByText(/not finished loading/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('keeps a failed local read distinct: an error with Try again, which then loads', async () => {
    replica.synced = true;
    replica.failRead = true;
    renderPage();

    expect(await screen.findByText('IndexedDB read failed')).toBeInTheDocument();
    expect(screen.queryByText(/of \d+ scored/)).not.toBeInTheDocument();

    replica.failRead = false;
    replica.rows = [dog('e1', 'Willow', 1)];
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('0 of 1 scored')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Willow/ })).toBeInTheDocument();
  });

  it('scores from a warm replica offline, local results included, without asking to sync', async () => {
    onlineManager.setOnline(false);
    replica.synced = true;
    replica.rows = [dog('e1', 'Willow', 1, true), dog('e2', 'Cooper', 2)];
    renderPage();

    expect(await screen.findByText('1 of 2 scored')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cooper/ })).toBeInTheDocument();
    expect(replica.sync).not.toHaveBeenCalled();
  });

  it('lists the dogs when the cold sync writes rows before it records the scope as synced', async () => {
    // syncReplicatedTable writes the rows (notifying listeners) and only then
    // updates the scope's sync metadata; a reload on that notification must not
    // overrule the load that is waiting for the sync to finish.
    replica.sync.mockImplementation(async () => {
      replica.rows = [dog('e1', 'Willow', 1), dog('e2', 'Cooper', 2)];
      for (const listener of [...replica.listeners]) listener();
      await new Promise(resolve => setTimeout(resolve, 20));
      replica.synced = true;
      return { success: true };
    });
    renderPage();

    expect(await screen.findByText('0 of 2 scored')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cooper/ })).toBeInTheDocument();
    expect(screen.queryByText(/not finished loading/)).not.toBeInTheDocument();
  });

  it('asks a cold online device to sync the show once, and not on every change', async () => {
    renderPage();
    await screen.findByText(/not finished loading on this device/);
    await waitFor(() => expect(replica.sync).toHaveBeenCalledWith('show-1'));

    await deliver([dog('e1', 'Willow', 1)]);
    await screen.findByText('0 of 1 scored');
    expect(replica.sync).toHaveBeenCalledTimes(1);
  });
});

/**
 * A replica update can remove the dog being scored (a pull, a move-up). The
 * score must go to the dog on screen, never to the one that left.
 */
describe('PaperScoresheetPage — the selected dog leaves the class', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replica.rows = [dog('e1', 'Willow', 1), dog('e2', 'Cooper', 2)];
    replica.synced = true;
    replica.failRead = false;
    replica.inFlight = null;
    replica.listeners.clear();
    replica.updateEntry.mockResolvedValue(undefined);
    onlineManager.setOnline(true);
  });

  it.each(['sequential', 'split'] as const)(
    'saves to the dog on screen, not the removed one (%s)',
    async mode => {
      renderPage(mode);
      expect((await screen.findAllByText('0 of 2 scored'))[0]).toBeInTheDocument();

      await deliver([dog('e2', 'Cooper', 2)]);
      expect((await screen.findAllByText('0 of 1 scored'))[0]).toBeInTheDocument();

      fireEvent.click(await screen.findByRole('button', { name: /^Q$/ }));
      fireEvent.click(screen.getByRole('button', { name: /save & next/i }));

      await waitFor(() => expect(replica.updateEntry).toHaveBeenCalledTimes(1));
      expect(replica.updateEntry).toHaveBeenCalledWith('e2', expect.anything());
      expect(replica.updateEntry).not.toHaveBeenCalledWith('e1', expect.anything());
    }
  );
});
