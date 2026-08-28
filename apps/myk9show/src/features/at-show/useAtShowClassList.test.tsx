import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const subscriptions = vi.hoisted(() => ({
  classes: null as (() => void) | null,
  trials: null as (() => void) | null,
  entries: null as ((entries: ReplicatedEntry[]) => void) | null,
  entryOptions: undefined as { emitCurrent?: boolean } | undefined,
}));

const stops = vi.hoisted(() => ({
  classes: vi.fn(),
  trials: vi.fn(),
  entries: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { getShowById: vi.fn() },
  replicatedTrialsTable: {
    getTrialsByShow: vi.fn(),
    subscribe: vi.fn((callback: () => void) => {
      subscriptions.trials = callback;
      return stops.trials;
    }),
  },
  replicatedClassesTable: {
    getClassesByTrial: vi.fn(),
    subscribe: vi.fn((callback: () => void) => {
      subscriptions.classes = callback;
      return stops.classes;
    }),
  },
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(),
    subscribe: vi.fn(
      (callback: (entries: ReplicatedEntry[]) => void, options?: { emitCurrent?: boolean }) => {
        subscriptions.entries = callback;
        subscriptions.entryOptions = options;
        return stops.entries;
      }
    ),
  },
}));

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
    subscriptions.entryOptions = undefined;
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
  });

  it('uses the delivered snapshot without re-reading entries, trials, or classes', async () => {
    const client = makeClient();
    const { result, unmount } = renderHook(() => useAtShowClassList('show-1'), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.groups[0]?.classes[0]?.entry_count).toBe(1));
    expect(subscriptions.entryOptions).toEqual({ emitCurrent: false });

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
    expect(replicatedEntriesTable.getEntriesByShow).toHaveBeenCalledTimes(1);
    expect(replicatedTrialsTable.getTrialsByShow).toHaveBeenCalledTimes(1);
    expect(replicatedClassesTable.getClassesByTrial).toHaveBeenCalledTimes(1);

    unmount();
    expect(stops.entries).toHaveBeenCalledTimes(1);
    expect(stops.trials).toHaveBeenCalledTimes(1);
    expect(stops.classes).toHaveBeenCalledTimes(1);
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
});
