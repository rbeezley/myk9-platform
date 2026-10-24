import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fetchMyEntryQueuePlaces,
  settledQueuePlaces,
  settledQueuePlacesWithFreshness,
  QUEUE_PLACES_REFETCH_MS,
  QUEUE_PLACES_REPLICA_COALESCE_MS,
  useMyEntryQueuePlaces,
  type QueuePlacesQueryState,
} from './useMyEntryQueuePlaces';
import { withServerPlace } from '@/utils/showEntryRunQueue';

const rpc = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'auth-user-1' } }),
}));
const replica = vi.hoisted(() => ({ listeners: new Set<() => void>() }));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    subscribe: (listener: () => void) => {
      replica.listeners.add(listener);
      return () => replica.listeners.delete(listener);
    },
  },
}));
let online = true;
vi.mock('@/hooks/useNetworkStatus', () => ({ useIsOnline: () => online }));

const answered = new Map([['e1', 1]]);

function state(overrides: Partial<QueuePlacesQueryState>): QueuePlacesQueryState {
  return {
    data: answered,
    isPlaceholderData: false,
    fetchStatus: 'idle',
    isError: false,
    ...overrides,
  };
}

describe('settledQueuePlaces', () => {
  it('offers the places from a settled online answer', () => {
    expect(settledQueuePlaces(state({}), true).get('e1')).toBe(1);
    expect(settledQueuePlaces(state({ fetchStatus: 'fetching' }), true).get('e1')).toBe(1);
  });

  it.each([
    ['offline', state({}), false],
    ['paused', state({ fetchStatus: 'paused' }), true],
    ['placeholder (another key)', state({ isPlaceholderData: true }), true],
    ['errored', state({ isError: true }), true],
    ['not answered yet', state({ data: undefined, fetchStatus: 'fetching' }), true],
  ] as const)('offers no place when %s', (_label, query, isOnline) => {
    expect(settledQueuePlaces(query, isOnline).size).toBe(0);
  });
});

describe('settledQueuePlacesWithFreshness', () => {
  it('stamps a settled online answer with when it landed', () => {
    const result = settledQueuePlacesWithFreshness({ ...state({}), dataUpdatedAt: 1234 }, true);
    expect(result.places.get('e1')).toBe(1);
    expect(result.updatedAt).toBe(1234);
  });

  it.each([
    ['offline', { ...state({}), dataUpdatedAt: 1234 }, false],
    ['errored', { ...state({ isError: true }), dataUpdatedAt: 1234 }, true],
    ['never answered', { ...state({ data: undefined }), dataUpdatedAt: 0 }, true],
    ['answered with no timestamp', { ...state({}), dataUpdatedAt: 0 }, true],
  ] as const)('reports no places and no time when %s', (_label, query, isOnline) => {
    const result = settledQueuePlacesWithFreshness(query, isOnline);
    expect(result.places.size).toBe(0);
    expect(result.updatedAt).toBeNull();
  });
});

describe('withServerPlace', () => {
  it('turns a waiting dog with a server place into that place', () => {
    expect(withServerPlace({ kind: 'waiting-unknown' }, 2)).toEqual({ kind: 'waiting', place: 2 });
  });

  it("keeps the row's own state when there is no place", () => {
    expect(withServerPlace({ kind: 'waiting-unknown' }, undefined)).toEqual({
      kind: 'waiting-unknown',
    });
  });

  it('never lets a place override in ring, done, pulled, or an unset order', () => {
    expect(withServerPlace({ kind: 'in-ring' }, 1)).toEqual({ kind: 'in-ring' });
    expect(withServerPlace({ kind: 'done' }, 1)).toEqual({ kind: 'done' });
    expect(withServerPlace({ kind: 'pulled' }, 1)).toEqual({ kind: 'pulled' });
    expect(withServerPlace(null, 1)).toBeNull();
  });
});

describe('fetchMyEntryQueuePlaces', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('calls the RPC with the entry ids and keeps only real places', async () => {
    rpc.mockResolvedValue({
      data: [
        { entry_id: 'e1', place: 1 },
        { entry_id: 'e2', place: null },
        { entry_id: 'e3', place: 3 },
      ],
      error: null,
    });
    const places = await fetchMyEntryQueuePlaces(['e1', 'e2', 'e3']);
    expect(rpc).toHaveBeenCalledWith('get_my_entry_queue_places', {
      p_entry_ids: ['e1', 'e2', 'e3'],
    });
    expect([...places]).toEqual([
      ['e1', 1],
      ['e3', 3],
    ]);
  });

  it('throws the RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('boom') });
    await expect(fetchMyEntryQueuePlaces(['e1'])).rejects.toThrow('boom');
  });
});

describe('useMyEntryQueuePlaces', () => {
  function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    rpc.mockReset();
    online = true;
  });

  it('returns the server places when online', async () => {
    rpc.mockResolvedValue({ data: [{ entry_id: 'e1', place: 2 }], error: null });
    const { result } = renderHook(() => useMyEntryQueuePlaces(['e1']), { wrapper });
    await waitFor(() => expect(result.current.get('e1')).toBe(2));
  });

  it('neither asks nor answers while offline', async () => {
    online = false;
    rpc.mockResolvedValue({ data: [{ entry_id: 'e1', place: 1 }], error: null });
    const { result } = renderHook(() => useMyEntryQueuePlaces(['e1']), { wrapper });
    await new Promise(r => setTimeout(r, 20));
    expect(rpc).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it('does not ask for an empty list', async () => {
    renderHook(() => useMyEntryQueuePlaces([]), { wrapper });
    await new Promise(r => setTimeout(r, 20));
    expect(rpc).not.toHaveBeenCalled();
  });
});

// MYK9-1368: the place is a server read (the RPC counts OTHER exhibitors), so it
// polls once a minute and also refreshes when the entries replica changes.
describe('useMyEntryQueuePlaces refresh cadence', () => {
  async function settle(steps = 4) {
    for (let step = 0; step < steps; step++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
    }
  }

  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(
      () => {
        return useMyEntryQueuePlaces(['e1']);
      },
      { wrapper }
    );
  }

  beforeEach(() => {
    vi.useFakeTimers();
    replica.listeners.clear();
    rpc.mockReset().mockResolvedValue({ data: [{ entry_id: 'e1', place: 2 }], error: null });
    online = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('re-counts every 60 seconds, not every 30', async () => {
    expect(QUEUE_PLACES_REFETCH_MS).toBe(60_000);
    mount();
    await settle();
    expect(rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUEUE_PLACES_REFETCH_MS - 100);
    });
    expect(rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('re-counts once when the entries replica changes, however many notices arrive', async () => {
    mount();
    await settle();
    expect(rpc).toHaveBeenCalledTimes(1);

    // The replica notifies on a leading and a trailing edge.
    replica.listeners.forEach(listener => listener());
    replica.listeners.forEach(listener => listener());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUEUE_PLACES_REPLICA_COALESCE_MS - 100);
    });
    expect(rpc).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('does not ask on a replica change while offline', async () => {
    online = false;
    mount();
    await settle();
    replica.listeners.forEach(listener => listener());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(QUEUE_PLACES_REPLICA_COALESCE_MS + 100);
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
