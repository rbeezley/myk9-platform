import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fetchMyEntryQueuePlaces,
  settledQueuePlaces,
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
