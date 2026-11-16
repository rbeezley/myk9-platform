import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { judgeDayCapacityKey } from '@/hooks/queries/useJudgeDayCapacity';
import type { JudgeDayCapacity } from '@/types/waitlist-types';
import { buildWaitingSignals } from '@/features/show-map/showDeskWaitingSignals';
import { useWaitlistWaiting } from '../useWaitlistWaiting';

const state = vi.hoisted(() => ({
  judge: {
    judgeDays: [] as unknown[],
    isKnown: true,
  } as { judgeDays: unknown[]; isKnown: boolean; isPaused?: boolean; error?: string },
  autoOffer: false,
  classes: [] as unknown[],
  rows: {} as Record<string, unknown[]>,
  replicaListeners: [] as Array<() => void>,
}));

vi.mock('@/services/database/waitlists', () => ({
  getClassesWithWaitlistCounts: vi.fn(async () => ({ data: state.classes, error: null })),
}));
vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: { getByClass: vi.fn(async (id: string) => state.rows[id] ?? []) },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getDogById: vi.fn(async (id: string) => ({ id, name: `Reg ${id}`, callName: `Call ${id}` })),
  },
}));
vi.mock('@/services/database/waitlists/replicaDependencies', () => ({
  WAITLIST_READ_TABLES: [
    {
      table: {
        subscribe: (cb: () => void) => {
          state.replicaListeners.push(cb);
          return () => undefined;
        },
      },
    },
  ],
}));
vi.mock('@/hooks/queries/useJudgeDayCapacity', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useJudgeDayCapacity')>()),
  useJudgeDayCapacity: () => state.judge,
}));
vi.mock('@/components/shows/waitListSettingsQuery', () => ({
  waitListSettingsQueryOptions: (showId: string) => ({
    queryKey: ['waitlist-settings', showId],
    queryFn: async () => ({ autoOffer: state.autoOffer }),
  }),
}));

const cls = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  trial_id: 't1',
  max_entries: null,
  accepted_count: 0,
  waitlist_count: 1,
  offered_count: 0,
  run_out_count: 0,
  ...over,
});
const waiting = (id: string, classId: string, dogId: string, position = 1) => ({
  id,
  classId,
  dogId,
  status: 'waiting',
  position,
  createdAt: '2026-10-03T10:00:00Z',
});
const day = (over: Partial<JudgeDayCapacity>): JudgeDayCapacity => ({
  judgeId: 'j1',
  judgeName: 'Pat Donovan',
  showDate: '2026-10-12',
  capacity: 10,
  confirmedCount: 5,
  waitlistCount: 1,
  mailInReserved: 0,
  availableSpots: 5,
  classIds: ['c1'],
  classNames: ['Container Novice A'],
  ...over,
});

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useWaitlistWaiting('show-1', true), { wrapper }), invalidate };
}

describe('useWaitlistWaiting: spots to offer', () => {
  beforeEach(() => {
    state.autoOffer = false;
    state.replicaListeners = [];
    state.judge = { judgeDays: [day({})], isKnown: true };
    state.classes = [cls('c1', 'Container Novice A')];
    state.rows = { c1: [waiting('w1', 'c1', 'd1')] };
  });

  it('counts a class with a spot and names the dog next in line', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current?.openSpots[0]?.nextDogName).toBe('Call d1'));
    expect(result.current).toMatchObject({
      count: 1,
      openSpots: [{ classId: 'c1', className: 'Container Novice A' }],
    });
  });

  it('shows no spot when the show offers spots automatically', async () => {
    state.autoOffer = true;
    const { result } = mount();
    await waitFor(() => expect(result.current).not.toBeNull());
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(result.current).toEqual({ count: 0, runOut: [], openSpots: [] });
  });

  it('shows no spot while the judge-day figures are not known, however empty the day looks', async () => {
    state.judge = { judgeDays: [], isKnown: false };
    const { result } = mount();
    await waitFor(() => expect(result.current).not.toBeNull());
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(result.current?.openSpots).toEqual([]);
    expect(result.current?.count).toBe(0);
  });

  it("shows no spot in a class whose judge's day is full", async () => {
    state.judge = { judgeDays: [day({ availableSpots: 0 })], isKnown: true };
    const { result } = mount();
    await waitFor(() => expect(result.current).not.toBeNull());
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(result.current?.count).toBe(0);
  });

  it("counts the classes with a spot plus the run-out offers, as the page's lists do", async () => {
    state.classes = [
      cls('c1', 'Container Novice A'),
      cls('c2', 'Container Novice B', { waitlist_count: 1 }),
      cls('c3', 'Interior Advanced', { waitlist_count: 0, run_out_count: 2 }),
    ];
    state.judge = {
      judgeDays: [day({}), day({ judgeId: 'j2', classIds: ['c2'], availableSpots: 0 })],
      isKnown: true,
    };
    state.rows = {
      c1: [waiting('w1', 'c1', 'd1')],
      c2: [waiting('w2', 'c2', 'd2')],
      c3: [
        {
          id: 'x1',
          classId: 'c3',
          dogId: 'd3',
          status: 'expired',
          position: 1,
          offeredAt: '2026-11-01',
        },
        {
          id: 'x2',
          classId: 'c3',
          dogId: 'd4',
          status: 'expired',
          position: 2,
          offeredAt: '2026-11-02',
        },
      ],
    };
    const { result } = mount();
    // c1 has a spot (one class), c2's day is full (none), c3 has two run-out offers.
    await waitFor(() => expect(result.current?.openSpots[0]?.nextDogName).toBe('Call d1'));
    expect(result.current?.count).toBe(1 + 2);

    const [signal] = buildWaitingSignals(
      'show-1',
      { heldEntries: undefined, waitlist: result.current },
      { kind: 'show', showId: 'show-1' }
    );
    expect(signal?.count).toBe(3);
    expect(signal?.label).toBe(
      'A spot opened in Container Novice A · next in line: Call d1 · 2 offers have run out in Interior Advanced'
    );
  });

  it.each([
    ['offline with cached figures', { isPaused: true }],
    ['a failed re-read with cached figures', { error: 'rpc down' }],
  ])('shows no spot pill: %s', async (_name, over) => {
    state.judge = { judgeDays: [day({})], isKnown: true, ...over } as typeof state.judge;
    const { result } = mount();
    await waitFor(() => expect(result.current).not.toBeNull());
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(result.current).toEqual({ count: 0, runOut: [], openSpots: [] });
  });

  it('names the dog after one that already has an open offer', async () => {
    state.rows = {
      c1: [
        waiting('w1', 'c1', 'd1'),
        waiting('w2', 'c1', 'd2', 2),
        { id: 'o1', classId: 'c1', dogId: 'd1', status: 'offered', position: 1 },
      ],
    };
    const { result } = mount();
    await waitFor(() => expect(result.current?.openSpots[0]?.nextDogName).toBe('Call d2'));
  });

  it('refreshes on a replica change and re-reads the judge-day figures too', async () => {
    const { result, invalidate } = mount();
    await waitFor(() => expect(result.current).not.toBeNull());
    state.replicaListeners.forEach(listener => listener());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['waitlist', 'show-1', 'waiting'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: judgeDayCapacityKey('show-1') });
  });
});

describe('buildWaitingSignals: spot wording', () => {
  const base = { heldEntries: undefined };
  it('says how many classes when spots opened in several', () => {
    const [signal] = buildWaitingSignals(
      'show-1',
      {
        ...base,
        waitlist: {
          count: 2,
          runOut: [],
          openSpots: [
            { classId: 'c1', className: 'A', nextDogName: 'Scout' },
            { classId: 'c2', className: 'B', nextDogName: null },
          ],
        },
      },
      { kind: 'show', showId: 'show-1' }
    );
    expect(signal?.label).toBe('Spots opened in 2 classes');
  });
});
