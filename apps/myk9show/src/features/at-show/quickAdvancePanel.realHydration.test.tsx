import { createElement, type PropsWithChildren } from 'react';
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/services/database/connection';
import { mockSupabase } from '@/test/mocks/supabase';
import { resetHandlerHydrationCircuit } from '@/services/database/entries/handlerHydration';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

const quickAdvanceMocks = vi.hoisted(() => ({
  replicatedRead: vi.fn(),
  getAllDogs: vi.fn(),
  getByShow: vi.fn(),
  entryListener: null as (() => void) | null,
  subscribe: vi.fn((callback: () => void) => {
    quickAdvanceMocks.entryListener = callback;
    return vi.fn();
  }),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByClass: quickAdvanceMocks.replicatedRead,
    subscribe: quickAdvanceMocks.subscribe,
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: quickAdvanceMocks.getAllDogs },
}));

vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: quickAdvanceMocks.getByShow },
}));

import { QuickAdvancePanel } from './quickAdvancePanel';
import type { AtShowProjectedEntry } from './atShowClassListAdapter';

const authoritativePerson = {
  id: 'owner-1',
  first_name: 'Olivia',
  last_name: 'Owner',
};

const coldDogEntry: ReplicatedEntry = {
  id: 'next-entry',
  classId: 'class-1',
  showId: 'show-1',
  dogId: 'dog-1',
  dogOwnerId: 'owner-1',
  armband: '12',
  runOrder: 1,
  checkInStatus: 'no-status',
  entryStatus: 'confirmed',
  isScored: false,
  dogCallName: 'Scout',
  dogBreed: 'Beagle',
};

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

function queryWrapper(client: QueryClient) {
  return function TestQueryProvider({ children }: PropsWithChildren) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
}

describe('QuickAdvancePanel real handler hydration feedback loop', () => {
  let cachedPerson: { id: string; firstName: string; lastName: string } | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    resetHandlerHydrationCircuit();
    quickAdvanceMocks.entryListener = null;
    cachedPerson = undefined;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    onlineManager.setOnline(false);

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

    quickAdvanceMocks.replicatedRead.mockResolvedValue([coldDogEntry] as never);
    quickAdvanceMocks.getAllDogs.mockResolvedValue([]);
    quickAdvanceMocks.getByShow.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    onlineManager.setOnline(true);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it.each(['fast', 'deferred'] as const)(
    'refreshes once from a real %s authoritative owner completion and stays quiet on the identical follow-up',
    async mode => {
      const client = makeClient();
      const originalOnline = navigator.onLine;
      const originalQueryOnline = onlineManager.isOnline();
      const deferred = deferredResponse<{
        data: (typeof authoritativePerson)[];
        error: null;
      }>();
      const view = render(
        createElement(QuickAdvancePanel, {
          classId: 'class-1',
          scoredEntryId: 'scored-entry',
          onBackToList: () => {},
          onCorrectScore: () => {},
          onPickEntry: () => {},
        }),
        { wrapper: queryWrapper(client) }
      );

      try {
        await waitFor(() => expect(quickAdvanceMocks.replicatedRead).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.getByText('#12 Scout — Beagle')).toBeInTheDocument());

        setPeopleResponses(
          mode === 'fast'
            ? [
                Promise.resolve({ data: [authoritativePerson], error: null }),
                Promise.resolve({ data: [authoritativePerson], error: null }),
              ]
            : [deferred.promise, Promise.resolve({ data: [authoritativePerson], error: null })]
        );
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        onlineManager.setOnline(true);
        if (mode === 'deferred') vi.useFakeTimers();

        act(() => quickAdvanceMocks.entryListener?.());
        const waitForSecondRead =
          mode === 'deferred'
            ? vi.waitFor(() =>
                expect(quickAdvanceMocks.replicatedRead.mock.calls.length).toBeGreaterThanOrEqual(2)
              )
            : waitFor(() => expect(quickAdvanceMocks.replicatedRead).toHaveBeenCalledTimes(2));
        await waitForSecondRead;

        if (mode === 'deferred') {
          await vi.waitFor(() => expect(mockSupabase.from).toHaveBeenCalledWith('people'));
          await vi.advanceTimersByTimeAsync(250);
          await vi.waitFor(() => {
            expect(quickAdvanceMocks.replicatedRead).toHaveBeenCalledTimes(2);
            expect(client.getQueryState(['at-show', 'quick-advance', 'class-1'])).toMatchObject({
              status: 'success',
              fetchStatus: 'idle',
            });
            const projected = client.getQueryData<AtShowProjectedEntry[]>([
              'at-show',
              'quick-advance',
              'class-1',
            ]);
            expect(projected?.[0]?.handler_identity).toEqual({
              name: null,
              source: 'unknown',
              person: null,
            });
          });
          deferred.resolve({ data: [authoritativePerson], error: null });
        }

        const waitForFollowUp =
          mode === 'deferred'
            ? vi.waitFor(() => expect(quickAdvanceMocks.replicatedRead).toHaveBeenCalledTimes(3))
            : waitFor(() => expect(quickAdvanceMocks.replicatedRead).toHaveBeenCalledTimes(3));
        await waitForFollowUp;
        const waitForOwner = mode === 'deferred' ? vi.waitFor : waitFor;
        await waitForOwner(() => {
          const projected = client.getQueryData<AtShowProjectedEntry[]>([
            'at-show',
            'quick-advance',
            'class-1',
          ]);
          expect(projected?.[0]?.dogOwnerId).toBe('owner-1');
          expect(projected?.[0]?.handler_identity).toEqual({
            name: 'Olivia Owner',
            source: 'owner',
            person: authoritativePerson,
          });
        });
        if (mode === 'deferred') await vi.advanceTimersByTimeAsync(30);
        else await new Promise(resolve => setTimeout(resolve, 30));
        expect(quickAdvanceMocks.replicatedRead).toHaveBeenCalledTimes(3);
      } finally {
        view.unmount();
        onlineManager.setOnline(originalQueryOnline);
        Object.defineProperty(navigator, 'onLine', {
          configurable: true,
          value: originalOnline,
        });
      }
    }
  );
});
