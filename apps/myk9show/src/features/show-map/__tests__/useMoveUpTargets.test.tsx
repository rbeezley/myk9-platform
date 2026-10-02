import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassWithCapacity } from '@/services/database/day-of-operations';
import type { ShowMapClassInput } from '../showMapTypes';
import { useMoveUpTargets } from '../useMoveUpTargets';

const mockGetClassesWithCapacity = vi.fn();
vi.mock('@/services/database/day-of-operations', () => ({
  getClassesWithCapacity: (...args: unknown[]) => mockGetClassesWithCapacity(...args),
}));

// Replica change subscriptions: capture the listeners so a test can fire a change.
const replicaListeners = vi.hoisted(() => ({
  entries: new Set<() => void>(),
  classes: new Set<() => void>(),
}));
vi.mock('@/services/replication', () => {
  const table = (set: Set<() => void>) => ({
    subscribe: (cb: () => void) => {
      set.add(cb);
      return () => set.delete(cb);
    },
  });
  return {
    replicatedEntriesTable: table(replicaListeners.entries),
    replicatedClassesTable: table(replicaListeners.classes),
  };
});

function showMapClass(id: string, level: string): ShowMapClassInput {
  return { id, trialId: 'trial-1', name: id, element: 'Container', level };
}
const classes = [
  showMapClass('novice', 'Novice'),
  showMapClass('advanced', 'Advanced'),
  showMapClass('master', 'Master'),
];

function capacity(id: string, availableSpots: number): ClassWithCapacity {
  return {
    id,
    name: id,
    class_number: null,
    max_entries: 10,
    trial_id: 'trial-1',
    accepted_count: 10 - availableSpots,
    available_spots: availableSpots,
    element: 'Container',
    level: null,
    section: null,
  };
}

let queryClient: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useMoveUpTargets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => {
    onlineManager.setOnline(true);
    queryClient.clear();
  });

  it('drops a full class once capacity loads', async () => {
    mockGetClassesWithCapacity.mockResolvedValue({
      data: [capacity('advanced', 3), capacity('master', 0)],
      error: null,
    });
    const { result } = renderHook(() => useMoveUpTargets('show-1', classes, 'novice', 'AKC'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.capacityState).toBe('ready'));
    expect(result.current.targets.map(t => [t.id, t.isFull === true])).toEqual([
      ['advanced', false],
      ['master', true],
    ]);
  });

  it('does not read capacity while no move-up dialog is open', () => {
    const { result } = renderHook(() => useMoveUpTargets('show-1', classes, undefined, 'AKC'), {
      wrapper,
    });
    expect(mockGetClassesWithCapacity).not.toHaveBeenCalled();
    expect(result.current.targets).toEqual([]);
  });

  it('still reads the replica while offline instead of parking at paused', async () => {
    onlineManager.setOnline(false);
    mockGetClassesWithCapacity.mockResolvedValue({
      data: [capacity('advanced', 3), capacity('master', 0)],
      error: null,
    });
    const { result } = renderHook(() => useMoveUpTargets('show-1', classes, 'novice', 'AKC'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.capacityState).toBe('ready'));
    expect(result.current.targets.map(t => t.id)).toEqual(['advanced', 'master']);
  });

  it('reports unavailable (targets still listed) when the capacity read fails', async () => {
    mockGetClassesWithCapacity.mockResolvedValue({ data: [], error: new Error('boom') });
    const { result } = renderHook(() => useMoveUpTargets('show-1', classes, 'novice', 'AKC'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.capacityState).toBe('unavailable'));
    expect(result.current.targets.map(t => t.id)).toEqual(['advanced', 'master']);
  });

  it.each(['entries', 'classes'] as const)(
    'recomputes when the %s replica changes while open (a freed seat shows up)',
    async table => {
      mockGetClassesWithCapacity.mockResolvedValueOnce({
        data: [capacity('advanced', 3), capacity('master', 0)],
        error: null,
      });
      const { result } = renderHook(() => useMoveUpTargets('show-1', classes, 'novice', 'AKC'), {
        wrapper,
      });
      await waitFor(() =>
        expect(result.current.targets.find(t => t.id === 'master')?.isFull).toBe(true)
      );

      mockGetClassesWithCapacity.mockResolvedValueOnce({
        data: [capacity('advanced', 3), capacity('master', 1)],
        error: null,
      });
      await act(async () => {
        replicaListeners[table].forEach(listener => listener());
      });
      await waitFor(() =>
        expect(result.current.targets.find(t => t.id === 'master')?.isFull).toBe(false)
      );
    }
  );

  it('reports unavailable, keeping the stale data, when a refetch fails after success', async () => {
    mockGetClassesWithCapacity.mockResolvedValueOnce({
      data: [capacity('advanced', 3), capacity('master', 2)],
      error: null,
    });
    const { result } = renderHook(() => useMoveUpTargets('show-1', classes, 'novice', 'AKC'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.capacityState).toBe('ready'));

    mockGetClassesWithCapacity.mockResolvedValueOnce({ data: [], error: new Error('boom') });
    await act(async () => {
      replicaListeners.entries.forEach(listener => listener());
    });
    await waitFor(() => expect(result.current.capacityState).toBe('unavailable'));
    expect(result.current.capacityIsStale).toBe(true);
    expect(result.current.targets.map(t => t.id)).toEqual(['advanced', 'master']);
  });

  it('does not subscribe to replica changes while no dialog is open', () => {
    renderHook(() => useMoveUpTargets('show-1', classes, undefined, 'AKC'), { wrapper });
    expect(replicaListeners.entries.size).toBe(0);
    expect(replicaListeners.classes.size).toBe(0);
  });
});
