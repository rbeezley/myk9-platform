import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const getEntriesByShow = vi.hoisted(() => vi.fn());
const classState = vi.hoisted(() => ({
  error: null as Error | null,
  refresh: vi.fn(),
  groups: [] as unknown[],
  available: true,
  syncGate: null as Promise<void> | null,
  realtime: null as null | {
    showId: string | undefined;
    classIds: readonly string[];
    refresh: (force?: boolean) => Promise<void>;
  },
}));
vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({ status: { isSyncing: false, lastSyncAt: null } }),
}));
vi.mock('./atShowDataAdapter', async importOriginal => ({
  ...(await importOriginal<typeof import('./atShowDataAdapter')>()),
  syncAtShowData: () => classState.syncGate ?? Promise.resolve(),
}));
vi.mock('./useAtShowRealtimeRefresh', () => ({
  useAtShowRealtimeRefresh: (
    showId: string | undefined,
    classIds: readonly string[],
    refresh: (force?: boolean) => Promise<void>
  ) => {
    classState.realtime = { showId, classIds, refresh };
  },
}));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { getEntriesByShow, subscribe: vi.fn(() => vi.fn()) },
  replicatedArmbandsTable: { getByShow: vi.fn(async () => []), subscribe: vi.fn(() => vi.fn()) },
}));
vi.mock('@/services/replication/entriesShowSyncState', () => ({
  hasShowEntriesSynced: async () => classState.available,
}));
vi.mock('./useAtShowClassList', () => ({
  useAtShowClassList: () => ({
    groups: classState.groups,
    organization: 'AKC',
    showName: 'Spring',
    isLoading: false,
    entryCountsAvailable: classState.available,
    error: classState.error,
    refresh: classState.refresh,
  }),
}));

import { useAtShowStaffDogs } from './useAtShowStaffDogs';

describe('useAtShowStaffDogs', () => {
  it('builds the dog list from the replica while the device is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    getEntriesByShow.mockResolvedValue([
      { id: 'e1', dogId: 'd1', armband: '5', dogCallName: 'Zip', classId: 'c1' },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAtShowStaffDogs('s1'), { wrapper });
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));
    expect(result.current.dogs[0]?.dogName).toBe('Zip');
    expect(getEntriesByShow).toHaveBeenCalledWith('s1');
  });

  it('reports a class-list failure and retries the class reads too', async () => {
    classState.error = new Error('classes');
    getEntriesByShow.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAtShowStaffDogs('s1'), { wrapper });
    expect(result.current.loadFailed).toBe(true);
    result.current.onRetry();
    expect(classState.refresh).toHaveBeenCalled();
    classState.error = null;
  });

  it('maps both sections of a Novice A/B pair to the combined route ids', async () => {
    const section = (id: string, sectionName: string) => ({
      id,
      element: 'Container',
      level: 'Novice',
      section: sectionName,
      class_name: `Container Novice ${sectionName}`,
      class_order: 1,
      judge_name: 'J',
      entry_count: 1,
      completed_count: 0,
      class_status: 'no-status',
      is_favorite: false,
      dogs: [],
    });
    classState.groups = [
      {
        trial: { id: 't1' },
        classes: [section('ca', 'A'), section('cb', 'B')],
        nextUpByClassId: new Map(),
      },
    ];
    getEntriesByShow.mockResolvedValue([
      { id: 'e1', dogId: 'd1', armband: '5', dogCallName: 'Zip', classId: 'ca' },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAtShowStaffDogs('s1'), { wrapper });
    await waitFor(() => expect(result.current.dogs).toHaveLength(1));
    expect(result.current.dogs[0]?.entries[0]?.routeClassIds).toEqual(['ca', 'cb']);
    classState.groups = [];
  });

  it('reports an incomplete replica until the show scope has a completed sync', async () => {
    classState.available = false;
    getEntriesByShow.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAtShowStaffDogs('s1'), { wrapper });
    await waitFor(() => expect(result.current.dogs).toEqual([]));
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(result.current.isComplete).toBe(false);
    classState.available = true;
  });

  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useAtShowStaffDogs('s1'), { wrapper });
  }

  it('re-reads the entries when a show-change signal or foreground refresh fires', async () => {
    classState.groups = [
      { trial: { id: 't1' }, classes: [{ id: 'c9' }], nextUpByClassId: new Map() },
    ];
    getEntriesByShow.mockResolvedValue([]);
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(classState.realtime?.showId).toBe('s1');
    expect(classState.realtime?.classIds).toEqual(['c9']);
    getEntriesByShow.mockResolvedValue([
      { id: 'e2', dogId: 'd2', armband: '7', dogCallName: 'Bo', classId: 'c9' },
    ]);
    await act(async () => {
      await classState.realtime?.refresh(false);
    });
    await waitFor(() => expect(result.current.dogs.map(d => d.dogName)).toEqual(['Bo']));
    classState.groups = [];
  });

  it('shows loading, not the partial notice, until the first hydration settles, then re-reads the marker', async () => {
    let release = () => {};
    classState.syncGate = new Promise<void>(resolve => {
      release = resolve;
    });
    classState.available = false;
    getEntriesByShow.mockResolvedValue([]);
    const { result } = setup();
    await waitFor(() => expect(result.current.dogs).toEqual([]));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isComplete).toBe(true);
    classState.available = true;
    await act(async () => {
      release();
      await classState.syncGate;
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isComplete).toBe(true);
    classState.syncGate = null;
  });

  it('keeps the partial notice when hydration settles without a completed sync', async () => {
    classState.syncGate = Promise.resolve();
    classState.available = false;
    getEntriesByShow.mockResolvedValue([]);
    const { result } = setup();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isComplete).toBe(false);
    classState.syncGate = null;
    classState.available = true;
  });
});
