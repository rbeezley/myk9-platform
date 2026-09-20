import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/services/database/connection';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const subscriptions = vi.hoisted(() => ({
  classes: null as (() => void) | null,
  trials: null as (() => void) | null,
  entries: null as ((entries: ReplicatedEntry[]) => void) | null,
  handlerPeople: null as ((event: { ids: readonly string[] }) => void) | null,
  emitHandlerOnSubscribe: false,
  entryOptions: undefined as { emitCurrent?: boolean } | undefined,
}));

const stops = vi.hoisted(() => ({
  classes: vi.fn(),
  trials: vi.fn(),
  entries: vi.fn(),
  handlerPeople: vi.fn(),
}));

const replicationMocks = vi.hoisted(() => ({
  shows: { getShowById: vi.fn() },
  trials: {
    getTrialsByShow: vi.fn(),
    getSyncMetadata: vi.fn(),
    sync: vi.fn(),
  },
  classes: {
    getClassesByTrial: vi.fn(),
    getAll: vi.fn(),
    getSyncMetadata: vi.fn(),
    sync: vi.fn(),
  },
  entries: {
    getEntriesByShow: vi.fn(),
    getSyncMetadata: vi.fn(),
    sync: vi.fn(),
  },
  dogs: { getAllDogs: vi.fn() },
  armbands: { getByShow: vi.fn() },
}));

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: replicationMocks.shows,
  replicatedTrialsTable: {
    ...replicationMocks.trials,
    subscribe: vi.fn((callback: () => void) => {
      subscriptions.trials = callback;
      return stops.trials;
    }),
  },
  replicatedClassesTable: {
    ...replicationMocks.classes,
    subscribe: vi.fn((callback: () => void) => {
      subscriptions.classes = callback;
      return stops.classes;
    }),
  },
  replicatedEntriesTable: {
    ...replicationMocks.entries,
    subscribe: vi.fn(
      (callback: (entries: ReplicatedEntry[]) => void, options?: { emitCurrent?: boolean }) => {
        subscriptions.entries = callback;
        subscriptions.entryOptions = options;
        return stops.entries;
      }
    ),
  },
  replicatedDogsTable: replicationMocks.dogs,
  replicatedArmbandsTable: replicationMocks.armbands,
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: replicationMocks.entries,
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: replicationMocks.dogs,
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: replicationMocks.classes,
}));

vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: replicationMocks.armbands,
}));

vi.mock('@/services/database/entries/handlerHydration', async () => {
  const actual = await vi.importActual<
    typeof import('@/services/database/entries/handlerHydration')
  >('@/services/database/entries/handlerHydration');
  return {
    ...actual,
    subscribeHandlerPeopleHydration: vi.fn(
      (callback: (event: { ids: readonly string[] }) => void) => {
        subscriptions.handlerPeople = callback;
        if (subscriptions.emitHandlerOnSubscribe) callback({ ids: ['owner-1'] });
        return stops.handlerPeople;
      }
    ),
  };
});

import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { useAtShowClassList } from './useAtShowClassList';

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

describe('useAtShowClassList entry refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subscriptions.classes = null;
    subscriptions.trials = null;
    subscriptions.entries = null;
    subscriptions.handlerPeople = null;
    subscriptions.emitHandlerOnSubscribe = false;
    subscriptions.entryOptions = undefined;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    vi.spyOn(db.instance.people, 'bulkGet').mockResolvedValue([
      { id: 'owner-1', firstName: 'Olivia', lastName: 'Owner' },
    ]);
    vi.mocked(replicatedShowsTable.getShowById).mockResolvedValue({
      id: 'show-1',
      name: 'Show One',
      organization: 'AKC',
    } as never);
    vi.mocked(replicatedTrialsTable.getTrialsByShow).mockResolvedValue([
      { id: 'trial-1', showId: 'show-1' },
    ] as never);
    vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([
      {
        id: 'class-1',
        element: 'Container',
        level: 'Novice',
        section: '-',
        classStatus: 'in_progress',
      },
    ] as never);
    replicationMocks.entries.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-1',
        showId: 'show-1',
        classId: 'class-1',
        dogId: 'dog-1',
        handler: undefined,
        isScored: false,
      },
    ] as never);
    replicationMocks.dogs.getAllDogs.mockResolvedValue([
      { id: 'dog-1', ownerId: 'owner-1', callName: 'Scout', breed: 'Beagle' },
    ] as never);
    replicationMocks.classes.getAll.mockResolvedValue([]);
    replicationMocks.armbands.getByShow.mockResolvedValue([]);
    vi.mocked(replicatedTrialsTable.sync).mockResolvedValue({ success: true } as never);
    vi.mocked(replicatedClassesTable.sync).mockResolvedValue({ success: true } as never);
    vi.mocked(replicatedEntriesTable.sync).mockResolvedValue({ success: true } as never);
    vi.mocked(replicatedEntriesTable.getSyncMetadata).mockResolvedValue({
      totalRows: 1,
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('uses the canonical owner fallback on the initial settled render without a replication event', async () => {
    const client = makeClient();
    const { result } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups[0]?.classes[0]?.entry_count).toBe(1));
    expect(replicationMocks.entries.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(result.current.groups[0]?.handlerIdentitiesByClassId?.get('class-1')).toEqual([
      {
        name: 'Olivia Owner',
        source: 'owner',
        person: { id: 'owner-1', first_name: 'Olivia', last_name: 'Owner' },
      },
    ]);
  });

  it('invalidates the canonical projected read when a replication snapshot arrives', async () => {
    let projectedRows = [
      {
        id: 'entry-1',
        showId: 'show-1',
        classId: 'class-1',
        isScored: false,
      },
    ];
    replicationMocks.entries.getEntriesByShow.mockImplementation(async () => projectedRows);
    const client = makeClient();
    const { result, unmount } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups[0]?.classes[0]?.entry_count).toBe(1));
    expect(subscriptions.entryOptions).toEqual({ emitCurrent: false });
    const readsBeforeSnapshot = {
      entries: replicationMocks.entries.getEntriesByShow.mock.calls.length,
      trials: vi.mocked(replicatedTrialsTable.getTrialsByShow).mock.calls.length,
      classes: vi.mocked(replicatedClassesTable.getClassesByTrial).mock.calls.length,
    };

    projectedRows = [
      {
        id: 'entry-1',
        showId: 'show-1',
        classId: 'class-1',
        isScored: true,
      },
      {
        id: 'entry-2',
        showId: 'show-1',
        classId: 'class-1',
        isScored: false,
      },
    ];

    act(() => {
      subscriptions.entries?.([
        { id: 'entry-1', showId: 'show-1', classId: 'class-1', isScored: true },
        { id: 'entry-2', showId: 'show-1', classId: 'class-1', isScored: false },
        { id: 'other-show', showId: 'show-2', classId: 'class-1', isScored: false },
      ]);
    });

    await waitFor(() => {
      expect(result.current.groups[0]?.classes[0]).toMatchObject({
        entry_count: 2,
        completed_count: 1,
      });
    });
    expect(replicationMocks.entries.getEntriesByShow).toHaveBeenCalledTimes(
      readsBeforeSnapshot.entries + 1
    );
    expect(replicatedTrialsTable.getTrialsByShow).toHaveBeenCalledTimes(
      readsBeforeSnapshot.trials + 1
    );
    expect(replicatedClassesTable.getClassesByTrial).toHaveBeenCalledTimes(
      readsBeforeSnapshot.classes + 1
    );

    unmount();
    expect(stops.entries).toHaveBeenCalledTimes(1);
    expect(stops.trials).toHaveBeenCalledTimes(1);
    expect(stops.classes).toHaveBeenCalledTimes(1);
    expect(stops.handlerPeople).toHaveBeenCalledTimes(1);
  });

  it('invalidates the projected read when authoritative handler hydration completes', async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    invalidate.mockClear();

    act(() => subscriptions.handlerPeople?.({ ids: ['owner-1'] }));

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['at-show', 'classlist', 'show-1'],
    });
  });

  it('bounds the class-list read after a fast handler completion', async () => {
    subscriptions.emitHandlerOnSubscribe = true;
    const client = makeClient();
    const { result } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups[0]?.classes[0]?.entry_count).toBe(1));
    expect(replicationMocks.entries.getEntriesByShow.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('bounds the class-list read after one deferred handler completion', async () => {
    const client = makeClient();
    const { result } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.groups[0]?.classes[0]?.entry_count).toBe(1));
    const readsBeforeCompletion = replicationMocks.entries.getEntriesByShow.mock.calls.length;

    act(() => subscriptions.handlerPeople?.({ ids: ['owner-1'] }));
    await waitFor(() =>
      expect(replicationMocks.entries.getEntriesByShow).toHaveBeenCalledTimes(
        readsBeforeCompletion + 1
      )
    );
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(replicationMocks.entries.getEntriesByShow.mock.calls.length).toBe(
      readsBeforeCompletion + 1
    );
  });

  it('falls back to query invalidation when a snapshot arrives before groups are cached', async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    client.removeQueries({ queryKey: ['at-show', 'classlist', 'show-1'] });
    invalidate.mockClear();

    act(() => subscriptions.entries?.([]));

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['at-show', 'classlist', 'show-1'],
    });
  });

  it('retries failed hydration metadata when the user refreshes', async () => {
    vi.mocked(replicatedClassesTable.getClassesByTrial).mockResolvedValue([]);
    vi.mocked(replicatedTrialsTable.getSyncMetadata)
      .mockRejectedValueOnce(new Error('metadata unavailable'))
      .mockResolvedValue({ expectedRemoteRows: 1 } as never);
    vi.mocked(replicatedClassesTable.getSyncMetadata).mockResolvedValue({
      expectedRemoteRows: 0,
    } as never);
    const client = makeClient();
    const { result } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.classDataHydration).toBe('incomplete'));

    await act(async () => result.current.refresh());

    await waitFor(() => expect(result.current.classDataHydration).toBe('hydrated'));
    expect(replicatedTrialsTable.getSyncMetadata).toHaveBeenCalledTimes(2);
  });

  // MYK9-637: the class list rendered `0 / 0` for every class on a 66-entry
  // show, forever. `entries` replicates PER SHOW and the app-wide
  // ReplicationSyncProvider runs with an empty scope, which
  // `ReplicatedEntriesTable.sync('')` treats as a documented no-op -- so
  // nothing on this route ever downloaded the show's entries. The class DETAIL
  // page looked correct only because ringside's EntryList calls
  // `forceSyncEntriesAndClasses` -> `syncAtShowData(showId)` on mount. Both
  // surfaces now hydrate from that one canonical call.
  it('hydrates the show-scoped entries replica so the counters are not a cold zero', async () => {
    const client = makeClient();
    renderHook(() => useAtShowClassList('show-1'), { wrapper: wrapper(client) });

    await waitFor(() => expect(replicatedEntriesTable.sync).toHaveBeenCalledWith('show-1'));
  });

  it('reports entry counts as unknown until this show scope has synced', async () => {
    replicationMocks.entries.getEntriesByShow.mockResolvedValue([]);
    vi.mocked(replicatedEntriesTable.getSyncMetadata).mockResolvedValue(null as never);
    const client = makeClient();
    const { result } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    await waitFor(() => expect(result.current.entryCountsAvailable).toBe(false));
  });

  it('reports entry counts as available once the show scope has synced', async () => {
    replicationMocks.entries.getEntriesByShow.mockResolvedValue([]);
    vi.mocked(replicatedEntriesTable.getSyncMetadata).mockResolvedValue({
      totalRows: 0,
    } as never);
    const client = makeClient();
    const { result } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.entryCountsAvailable).toBe(true));
  });
});
