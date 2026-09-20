import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/services/database/connection';
import { mockSupabase } from '@/test/mocks/supabase';
import { resetHandlerHydrationCircuit } from '@/services/database/entries/handlerHydration';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const subscriptions = vi.hoisted(() => ({
  classes: null as (() => void) | null,
  trials: null as (() => void) | null,
  entries: null as (() => void) | null,
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
      return vi.fn();
    }),
  },
  replicatedClassesTable: {
    ...replicationMocks.classes,
    subscribe: vi.fn((callback: () => void) => {
      subscriptions.classes = callback;
      return vi.fn();
    }),
  },
  replicatedEntriesTable: {
    ...replicationMocks.entries,
    subscribe: vi.fn((callback: () => void) => {
      subscriptions.entries = callback;
      return vi.fn();
    }),
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

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: replicationMocks.shows,
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: replicationMocks.trials,
}));

vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: replicationMocks.armbands,
}));

vi.mock('@/services/database/entries/refreshShowEntriesForRead', () => ({
  refreshShowEntriesForRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./atShowDataAdapter', () => ({
  syncAtShowData: vi.fn().mockResolvedValue(undefined),
}));

import { useAtShowClassList } from './useAtShowClassList';

const authoritativePerson = {
  id: 'owner-1',
  first_name: 'Olivia',
  last_name: 'Owner',
};

const coldDogEntry: ReplicatedEntry = {
  id: 'entry-1',
  showId: 'show-1',
  classId: 'class-1',
  dogId: 'dog-1',
  dogOwnerId: 'owner-1',
  dogCallName: 'Scout',
  dogBreed: 'Beagle',
  armband: '12',
  isScored: false,
};

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

function deferredResponse<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function setPeopleResponses(
  responses: Array<Promise<{ data: (typeof authoritativePerson)[]; error: null }>>
) {
  mockSupabase.from.mockImplementation((table: string) => {
    if (table !== 'people') return {};
    const response =
      responses.shift() ?? Promise.resolve({ data: [authoritativePerson], error: null });
    return {
      select: () => ({
        in: () => response,
      }),
    };
  });
}

describe('useAtShowClassList real handler hydration feedback loop', () => {
  let cachedPerson: { id: string; firstName: string; lastName: string } | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    resetHandlerHydrationCircuit();
    subscriptions.classes = null;
    subscriptions.trials = null;
    subscriptions.entries = null;
    cachedPerson = undefined;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    vi.spyOn(db.instance.people, 'bulkGet').mockImplementation(async ids =>
      ids.flatMap(id => (cachedPerson && cachedPerson.id === String(id) ? [cachedPerson] : []))
    );
    vi.spyOn(db.instance.people, 'bulkPut').mockImplementation(async people => {
      const person = people[0];
      if (person) {
        cachedPerson = {
          id: String(person.id),
          firstName: person.firstName ?? '',
          lastName: person.lastName ?? '',
        };
      }
      return cachedPerson?.id ?? '';
    });
    vi.spyOn(db.instance.people, 'bulkDelete').mockImplementation(async ids => {
      if (cachedPerson && ids.some(id => String(id) === cachedPerson?.id)) cachedPerson = undefined;
    });

    vi.mocked(replicationMocks.shows.getShowById).mockResolvedValue({
      id: 'show-1',
      name: 'Show One',
      organization: 'AKC',
    } as never);
    vi.mocked(replicationMocks.trials.getTrialsByShow).mockResolvedValue([
      { id: 'trial-1', showId: 'show-1' },
    ] as never);
    vi.mocked(replicationMocks.classes.getClassesByTrial).mockResolvedValue([
      {
        id: 'class-1',
        element: 'Container',
        level: 'Novice',
        section: '-',
        classStatus: 'in_progress',
      },
    ] as never);
    replicationMocks.entries.getEntriesByShow.mockResolvedValue([coldDogEntry] as never);
    replicationMocks.dogs.getAllDogs.mockResolvedValue([]);
    replicationMocks.classes.getAll.mockResolvedValue([]);
    replicationMocks.armbands.getByShow.mockResolvedValue([]);
    replicationMocks.entries.getSyncMetadata.mockResolvedValue({ totalRows: 1 } as never);
    replicationMocks.trials.getSyncMetadata.mockResolvedValue({ expectedRemoteRows: 1 } as never);
    replicationMocks.classes.getSyncMetadata.mockResolvedValue({ expectedRemoteRows: 1 } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it.each(['fast', 'deferred'] as const)(
    'refreshes once from a real %s authoritative owner completion and stays quiet on the identical follow-up',
    async mode => {
      const client = makeClient();
      const { result, unmount } = renderHook(() => useAtShowClassList('show-1'), {
        wrapper: wrapper(client),
      });

      try {
        await waitFor(() =>
          expect(replicationMocks.entries.getEntriesByShow).toHaveBeenCalledTimes(1)
        );
        expect(result.current.groups[0]?.handlerIdentitiesByClassId?.get('class-1')).toEqual([
          { name: null, source: 'unknown', person: null },
        ]);

        const deferred = deferredResponse<{
          data: (typeof authoritativePerson)[];
          error: null;
        }>();
        setPeopleResponses(
          mode === 'fast'
            ? [
                Promise.resolve({ data: [authoritativePerson], error: null }),
                Promise.resolve({ data: [authoritativePerson], error: null }),
              ]
            : [deferred.promise, Promise.resolve({ data: [authoritativePerson], error: null })]
        );
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });

        act(() => subscriptions.entries?.());
        await waitFor(() =>
          expect(
            replicationMocks.entries.getEntriesByShow.mock.calls.length
          ).toBeGreaterThanOrEqual(2)
        );

        if (mode === 'deferred') {
          deferred.resolve({ data: [authoritativePerson], error: null });
        }

        await waitFor(() =>
          expect(replicationMocks.entries.getEntriesByShow).toHaveBeenCalledTimes(3)
        );
        await waitFor(() =>
          expect(result.current.groups[0]?.handlerIdentitiesByClassId?.get('class-1')).toEqual([
            {
              name: 'Olivia Owner',
              source: 'owner',
              person: authoritativePerson,
            },
          ])
        );
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(replicationMocks.entries.getEntriesByShow).toHaveBeenCalledTimes(3);
        expect(navigator.onLine).toBe(true);
      } finally {
        unmount();
      }
    }
  );
});
