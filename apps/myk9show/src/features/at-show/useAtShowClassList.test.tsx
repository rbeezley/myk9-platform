import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const subscriptions = vi.hoisted(() => ({
  classes: null as (() => void) | null,
  trials: null as (() => void) | null,
  entries: null as ((entries: ReplicatedEntry[]) => void) | null,
  handlerPeople: null as ((event: { ids: readonly string[] }) => void) | null,
  entryOptions: undefined as { emitCurrent?: boolean } | undefined,
}));

const stops = vi.hoisted(() => ({
  classes: vi.fn(),
  trials: vi.fn(),
  entries: vi.fn(),
  handlerPeople: vi.fn(),
}));

const projectedReads = vi.hoisted(() => ({
  getEntriesByShow: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedTrialsTable: {
    getTrialsByShow: vi.fn(),
    getSyncMetadata: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn((callback: () => void) => {
      subscriptions.trials = callback;
      return stops.trials;
    }),
  },
  replicatedClassesTable: {
    getClassesByTrial: vi.fn(),
    getSyncMetadata: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn((callback: () => void) => {
      subscriptions.classes = callback;
      return stops.classes;
    }),
  },
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(),
    getSyncMetadata: vi.fn(),
    sync: vi.fn(),
    subscribe: vi.fn(
      (callback: (entries: ReplicatedEntry[]) => void, options?: { emitCurrent?: boolean }) => {
        subscriptions.entries = callback;
        subscriptions.entryOptions = options;
        return stops.entries;
      }
    ),
  },
}));

vi.mock('@/services/database/entries', () => ({
  getEntriesByShow: projectedReads.getEntriesByShow,
}));

vi.mock('@/services/database/entries/handlerHydration', () => ({
  subscribeHandlerPeopleHydration: vi.fn(
    (callback: (event: { ids: readonly string[] }) => void) => {
      subscriptions.handlerPeople = callback;
      return stops.handlerPeople;
    }
  ),
}));

import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { projectAtShowEntryRow } from './atShowClassListAdapter';
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
    subscriptions.entryOptions = undefined;
    projectedReads.getEntriesByShow.mockResolvedValue({
      data: [
        {
          id: 'entry-1',
          show_id: 'show-1',
          class_id: 'class-1',
          is_scored: false,
          dog: { call_name: 'Scout', breed: 'Beagle' },
          handler_identity: { name: 'Olivia Owner', source: 'owner', person: null },
        },
      ],
      error: null,
    });
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
    vi.mocked(replicatedEntriesTable.getEntriesByShow).mockResolvedValue([
      { id: 'entry-1', showId: 'show-1', classId: 'class-1', isScored: false },
    ] as never);
    vi.mocked(replicatedTrialsTable.sync).mockResolvedValue({ success: true } as never);
    vi.mocked(replicatedClassesTable.sync).mockResolvedValue({ success: true } as never);
    vi.mocked(replicatedEntriesTable.sync).mockResolvedValue({ success: true } as never);
    vi.mocked(replicatedEntriesTable.getSyncMetadata).mockResolvedValue({
      totalRows: 1,
    } as never);
  });

  it('uses the canonical owner fallback on the initial settled render without a replication event', async () => {
    const client = makeClient();
    const { result } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups[0]?.classes[0]?.entry_count).toBe(1));
    expect(projectedReads.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(replicatedEntriesTable.getEntriesByShow).not.toHaveBeenCalled();
    expect(
      projectAtShowEntryRow({
        id: 'entry-1',
        handler: null,
        handler_identity: { name: 'Olivia Owner', source: 'owner', person: null },
      }).handler_identity
    ).toMatchObject({ name: 'Olivia Owner', source: 'owner' });
  });

  it('invalidates the canonical projected read when a replication snapshot arrives', async () => {
    let projectedRows = [
      {
        id: 'entry-1',
        show_id: 'show-1',
        class_id: 'class-1',
        is_scored: false,
      },
    ];
    projectedReads.getEntriesByShow.mockImplementation(async () => ({
      data: projectedRows,
      error: null,
    }));
    const client = makeClient();
    const { result, unmount } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups[0]?.classes[0]?.entry_count).toBe(1));
    expect(subscriptions.entryOptions).toEqual({ emitCurrent: false });
    const readsBeforeSnapshot = {
      entries: projectedReads.getEntriesByShow.mock.calls.length,
      trials: vi.mocked(replicatedTrialsTable.getTrialsByShow).mock.calls.length,
      classes: vi.mocked(replicatedClassesTable.getClassesByTrial).mock.calls.length,
    };

    projectedRows = [
      {
        id: 'entry-1',
        show_id: 'show-1',
        class_id: 'class-1',
        is_scored: true,
      },
      {
        id: 'entry-2',
        show_id: 'show-1',
        class_id: 'class-1',
        is_scored: false,
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
    expect(projectedReads.getEntriesByShow).toHaveBeenCalledTimes(readsBeforeSnapshot.entries + 1);
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
    projectedReads.getEntriesByShow.mockResolvedValue({ data: [], error: null });
    vi.mocked(replicatedEntriesTable.getSyncMetadata).mockResolvedValue(null as never);
    const client = makeClient();
    const { result } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups).toHaveLength(1));
    await waitFor(() => expect(result.current.entryCountsAvailable).toBe(false));
  });

  it('reports entry counts as available once the show scope has synced', async () => {
    projectedReads.getEntriesByShow.mockResolvedValue({ data: [], error: null });
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
