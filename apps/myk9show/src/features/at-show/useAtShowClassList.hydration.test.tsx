/**
 * MYK9-637 (round 2): the cold -> warm transition, through the REAL
 * replication tables and the REAL sync metadata.
 *
 * `@/services/replication` is deliberately NOT mocked here. The bug this file
 * guards lives in the wiring between three real things -- IndexedDB rows, the
 * per-scope `totalRows` watermark, and React Query invalidation -- and a test
 * that stubs `getSyncMetadata` cannot see any of them disagree.
 *
 * Only `syncAtShowData` is replaced, with a controllable fake that writes
 * exactly what a real sync would write, because the real one talks to
 * PostgREST.
 *
 * NOTE for shuffled runs: the replicated tables and `atShowSyncsInFlight` are
 * module-scope mutable state, so every test here resets the database and the
 * caches in `beforeEach`.
 */

import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncAtShowData = vi.hoisted(() => vi.fn());
vi.mock('./atShowDataAdapter', () => ({ syncAtShowData }));

import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { useAtShowClassList } from './useAtShowClassList';

const SHOW_ID = 'show-1';
const TRIAL_ID = 'trial-1';
const CLASS_ID = 'class-1';

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
}

function wrapper(client: QueryClient) {
  return function TestQueryProvider({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

async function resetReplication(): Promise<void> {
  const { databaseManager } = await import('@myk9/replication');
  await databaseManager.reset();
  await replicatedShowsTable.clearCache();
  await replicatedTrialsTable.clearCache();
  await replicatedClassesTable.clearCache();
  await replicatedEntriesTable.clearCache();
}

/** Seed the show structure the same way a trials/classes sync would. */
async function seedStructure(): Promise<void> {
  await replicatedShowsTable.batchSet([
    { id: SHOW_ID, name: 'Heartland Scent Work Classic', organization: 'AKC Scent Work' },
  ] as never);
  await replicatedTrialsTable.batchSet([
    { id: TRIAL_ID, showId: SHOW_ID, trialNumber: 1, date: '2026-06-01' },
  ] as never);
  await replicatedClassesTable.batchSet([
    {
      id: CLASS_ID,
      trialId: TRIAL_ID,
      element: 'Interior',
      level: 'Advanced',
      section: '-',
      classStatus: 'setup',
      classOrder: 1,
    },
  ] as never);
}

/**
 * What a successful show-scoped entries sync leaves behind when the server had
 * NOTHING for this show: the scope watermark, and no rows. Critically it emits
 * no replication notification -- `batchSet` is skipped with nothing to cache,
 * and `removeStaleEntries` notifies only when it removed something.
 */
async function completeSyncWithNoRows(): Promise<void> {
  await replicatedEntriesTable.updateSyncMetadata(
    { lastIncrementalSyncAt: Date.now(), totalRows: 0 },
    { scopeValue: SHOW_ID }
  );
}

/** What that same sync leaves behind when the server DID have rows. */
async function completeSyncWithRows(): Promise<void> {
  await replicatedEntriesTable.batchSet([
    { id: 'e1', showId: SHOW_ID, classId: CLASS_ID, isScored: true },
    { id: 'e2', showId: SHOW_ID, classId: CLASS_ID, isScored: false },
    { id: 'e3', showId: SHOW_ID, classId: CLASS_ID, isScored: false },
  ] as never);
  await replicatedEntriesTable.updateSyncMetadata(
    { lastIncrementalSyncAt: Date.now(), totalRows: 3 },
    { scopeValue: SHOW_ID }
  );
}

describe('useAtShowClassList entry-count hydration (real replication)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await resetReplication();
    await seedStructure();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('reads as unknown before the show scope has synced', async () => {
    syncAtShowData.mockReturnValue(new Promise(() => {}));
    const client = makeClient();

    const { result } = renderHook(() => useAtShowClassList(SHOW_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    await waitFor(() => expect(result.current.entryCountsAvailable).toBe(false));
  });

  // Both review lenses found this independently: a genuinely empty show writes
  // its watermark and notifies NOTHING, so a counts query invalidated only from
  // the entries subscription stays on the unknown dash for the page's lifetime.
  it('converges on 0 / 0 for a show that syncs with no entries at all', async () => {
    let releaseSync: (() => void) | undefined;
    syncAtShowData.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          releaseSync = () => {
            void completeSyncWithNoRows().then(resolve);
          };
        })
    );
    const client = makeClient();
    const notifications = vi.fn();
    const stopWatching = replicatedEntriesTable.subscribe(notifications, { emitCurrent: false });

    const { result } = renderHook(() => useAtShowClassList(SHOW_ID), {
      wrapper: wrapper(client),
    });

    // Hold the sync open until the counts query has actually settled on
    // "unknown". Without this the assertion below can pass on a race rather
    // than on the invalidation it is meant to pin.
    await waitFor(() => expect(result.current.entryCountsAvailable).toBe(false));
    await waitFor(() => expect(result.current.groups).toHaveLength(1));

    // Replication notifications are debounced (NOTIFY_DEBOUNCE_MS = 100), so a
    // trailing one from the per-test store reset can land mid-test and be
    // misread as this sync's doing. Drain the window, THEN start counting.
    await new Promise(resolve => setTimeout(resolve, 250));
    notifications.mockClear();

    releaseSync?.();

    await waitFor(() => expect(result.current.entryCountsAvailable).toBe(true));
    expect(result.current.groups[0]?.classes[0]).toMatchObject({
      entry_count: 0,
      completed_count: 0,
    });
    // The load-bearing half: this convergence happened with the replication
    // subscription silent, so only the settle-time invalidation can have
    // produced it.
    expect(notifications).not.toHaveBeenCalled();
    stopWatching();
  });

  // The other invalidation trigger, isolated. THIS hook's own hydration fails
  // (offline), and a later sync from some other at-show surface -- the
  // scoresheet, the check-in path in AtShowMyEntriesToday -- settles the scope
  // with no rows for this show. Only the entries subscription can notice.
  it('accepts a zero-row answer delivered by another surface after its own sync failed', async () => {
    // A row from a DIFFERENT show: it keeps the store non-empty (so deleting it
    // emits a real replication notification) while contributing nothing to this
    // show's counts.
    await replicatedEntriesTable.batchSet([
      { id: 'other', showId: 'show-2', classId: 'class-9', isScored: false },
    ] as never);
    syncAtShowData.mockRejectedValue(new Error('offline'));
    const client = makeClient();

    const { result } = renderHook(() => useAtShowClassList(SHOW_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    await waitFor(() => expect(result.current.entryCountsAvailable).toBe(false));

    await completeSyncWithNoRows();
    await replicatedEntriesTable.batchDelete(['other']);

    await waitFor(() => expect(result.current.entryCountsAvailable).toBe(true));
  });

  it('goes from unknown to the real counts when the sync delivers rows', async () => {
    let releaseSync: (() => void) | undefined;
    syncAtShowData.mockImplementation(
      () =>
        new Promise<void>(resolve => {
          releaseSync = () => {
            void completeSyncWithRows().then(resolve);
          };
        })
    );
    const client = makeClient();

    const { result } = renderHook(() => useAtShowClassList(SHOW_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    expect(result.current.entryCountsAvailable).toBe(false);

    releaseSync?.();

    await waitFor(() => expect(result.current.entryCountsAvailable).toBe(true));
    await waitFor(() =>
      expect(result.current.groups[0]?.classes[0]).toMatchObject({
        entry_count: 3,
        completed_count: 1,
      })
    );
  });

  it('re-asks after a FAILED sync rather than leaving the answer stale', async () => {
    syncAtShowData.mockRejectedValue(new Error('offline'));
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useAtShowClassList(SHOW_ID), {
      wrapper: wrapper(client),
    });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ['at-show', 'classlist-entry-counts', SHOW_ID],
      })
    );
    expect(result.current.entryCountsAvailable).toBe(false);
  });
});
