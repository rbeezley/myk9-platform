/**
 * MYK9-1779: leaving an unscored scoresheet with the phone's back button (a history pop)
 * must leave the entry list showing the dog back where it was, exactly as Cancel does.
 * Real entries table, real mutation manager, real entry-list data hook, real router.
 */
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Outlet, RouterProvider, createBrowserRouter, useNavigate } from 'react-router-dom';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { UnsavedChangesRouteGuardProvider } from '@/components/navigation/UnsavedChangesRouteGuard';
import { ScoresheetLeaveGuard } from '@/components/navigation/ScoresheetLeaveGuard';
import { useEntryListData, type EntryListDataDependencies } from '@myk9/ringside';
import { logger } from '@myk9/core';
import { databaseManager, MutationManager } from '@myk9/replication';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTestQueryClient } from '@/test/utils/testUtils';
import {
  replicatedEntriesTable,
  replicatedClassesTable,
  type ReplicatedEntry,
  type ReplicatedClass,
} from '@/services/replication';
import { createAtShowDataDependencies } from '@/features/at-show/atShowDataAdapter';
import { useScoresheetRingMove } from './useScoresheetRingMove';

vi.mock('@myk9/core', async orig => ({
  ...(await orig<object>()),
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

/** A loaded machine can take well over waitFor's 1000 ms default for one IndexedDB round trip. */
const SLOW = { timeout: 8000 };
const ID = 'entry-1';
const AUTH = 'secretary-user';
const seed = {
  id: ID,
  showId: 'show-1',
  classId: 'class-1',
  dogId: 'dog-1',
  armband: '200',
  entryStatus: 'confirmed',
  checkInStatus: 'no-status',
  check_in_status: 'no-status',
  isScored: false,
} as ReplicatedEntry;

const dependencies = {
  auth: { role: 'admin', showContext: { licenseKey: 'show-1' } },
  ...createAtShowDataDependencies(),
  fetchSingleClassOld: async () => {
    const row = await replicatedEntriesTable.get(ID);
    return { entries: row ? [row] : [], classInfo: null };
  },
  fetchCombinedClasses: async () => ({ entries: [], classInfo: null }),
  forceSyncEntriesAndClasses: async () => {},
  subscribeToReplicationChanges: (callback: () => void) =>
    replicatedEntriesTable.subscribe(() => callback()),
} as unknown as EntryListDataDependencies;

const List = () => {
  const navigate = useNavigate();
  const { entries } = useEntryListData({ classId: 'class-1', dependencies });
  const status = (entries[0] as unknown as { status?: string } | undefined)?.status;
  seen.push(String(status));
  return (
    <div>
      <p>list status: {status ?? 'none'}</p>
      <button onClick={() => navigate('/sheet')}>open sheet</button>
    </div>
  );
};

const Sheet = () => {
  const navigate = useNavigate();
  const ringMove = useScoresheetRingMove(ID);
  // `start` is a no-op until the entry has loaded, so the button only appears after `opened`:
  // a click on a loaded-machine render must not land before the load resolves.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void replicatedEntriesTable.get(ID).then(row => {
      if (!row) return;
      ringMove.opened(row.id);
      setLoaded(true);
    });
  }, [ringMove]);
  return (
    <div>
      <ScoresheetLeaveGuard isDirty={false} />
      {loaded && <button onClick={ringMove.start}>start timer</button>}
      <button onClick={() => window.history.back()}>history back</button>
      <button onClick={() => navigate('/list')}>cancel</button>
    </div>
  );
};

const queryClientRef: { current: QueryClient | null } = { current: null };
/** Every status the list rendered, in order. */
const seen: string[] = [];

function renderApp() {
  window.history.replaceState(null, '', '/list');
  const router = createBrowserRouter([
    {
      element: (
        <UnsavedChangesRouteGuardProvider>
          <Outlet />
        </UnsavedChangesRouteGuardProvider>
      ),
      children: [
        { path: '/list', element: <List /> },
        { path: '/sheet', element: <Sheet /> },
      ],
    },
  ]);
  // Production defaults: an inactive stale query refetches when the list mounts again.
  const client = createTestQueryClient();
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, refetchOnMount: true },
  });
  queryClientRef.current = client;
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe('leaving an unscored scoresheet restores the dog on the list (MYK9-1779)', () => {
  let manager: MutationManager;
  beforeEach(async () => {
    await databaseManager.reset();
    const client = {
      rpc: vi.fn(async () => ({ data: 2, error: null })),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: client }),
    });
    replicatedEntriesTable.setMutationManager(manager);
    await replicatedEntriesTable.clearCache();
    await replicatedEntriesTable.batchSet([seed], new Map([[ID, 1]]));
    await replicatedClassesTable.batchSet(
      [
        {
          id: 'class-1',
          trialId: 'trial-1',
          name: 'Container Novice A',
          element: 'Container',
          level: 'Novice',
        } as unknown as ReplicatedClass,
      ],
      new Map([['class-1', 1]])
    );
  });
  afterEach(async () => {
    manager.destroy();
    await databaseManager.reset();
  });

  /** Open the sheet, leave it unscored, and return what the list rendered from then on. */
  async function openThenLeave(leave: string): Promise<string[]> {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText('list status: no-status', undefined, SLOW);
    await user.click(screen.getByText('open sheet'));
    await user.click(await screen.findByText('start timer', undefined, SLOW));
    await waitFor(
      async () => expect((await replicatedEntriesTable.get(ID))?.checkInStatus).toBe('in-ring'),
      SLOW
    );
    // A judge scores for a while: the list's cached read goes stale, so it re-reads on return.
    await queryClientRef.current?.invalidateQueries();
    seen.length = 0;
    const debounced = () =>
      vi.mocked(logger.log).mock.calls.filter(([m]) => String(m).includes('after debounce')).length;
    const flushesBefore = debounced();
    await user.click(screen.getByText(leave));
    await screen.findByText('open sheet', undefined, SLOW);
    await waitFor(
      async () => expect((await replicatedEntriesTable.get(ID))?.checkInStatus).toBe('no-status'),
      SLOW
    );
    // Await the list's own refresh (debounced after each table change) and its refetch, rather
    // than sleeping a fixed time that a loaded machine can overrun.
    await waitFor(() => expect(debounced()).toBeGreaterThan(flushesBefore), SLOW);
    await waitFor(() => expect(queryClientRef.current?.isFetching()).toBe(0), SLOW);
    expect(screen.getByText('list status: no-status')).toBeInTheDocument();
    return seen;
  }

  // The list is mounted by the same navigation that unmounts the sheet, so its first read
  // must already see the dog put back; it used to show "In ring" until the debounced refresh.
  it(
    'Cancel: the list never shows the dog in the ring on return',
    { timeout: 30_000 },
    async () => {
      expect(await openThenLeave('cancel')).not.toContain('in-ring');
    }
  );

  it(
    'history back restores the warm list after opening without starting',
    { timeout: 30_000 },
    async () => {
      const user = userEvent.setup();
      renderApp();
      await screen.findByText('list status: no-status', undefined, SLOW);
      await user.click(screen.getByText('open sheet'));
      await screen.findByText('start timer', undefined, SLOW);
      expect((await replicatedEntriesTable.get(ID))?.checkInStatus).toBe('no-status');
      seen.length = 0;
      await user.click(screen.getByText('history back'));
      await screen.findByText('list status: no-status', undefined, SLOW);
      expect(seen).not.toContain('in-ring');
      expect((await replicatedEntriesTable.get(ID))?.ring_entry_time).toBeUndefined();
    }
  );

  it(
    'history back: the list never shows the dog in the ring on return',
    { timeout: 30_000 },
    async () => {
      expect(await openThenLeave('history back')).not.toContain('in-ring');
    }
  );
});
