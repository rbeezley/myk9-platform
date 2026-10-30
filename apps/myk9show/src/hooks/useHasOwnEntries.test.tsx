import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { railOwnEntriesState, useHasOwnEntries } from './useHasOwnEntries';
import { useAuthContext } from '@/hooks/useAuthContext';
import { serverHasOwnEntries } from '@/services/database/entries/ownEntriesExistence';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';

vi.mock('@/hooks/useAuthContext');
vi.mock('@/services/database/entries/ownEntriesExistence', () => ({
  serverHasOwnEntries: vi.fn(),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { subscribe: vi.fn(() => () => {}) },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { subscribe: vi.fn(() => () => {}) },
}));

type Identity = 'unresolved' | 'resolved' | 'missing';

function mockAuth(personId: string | null, personIdentityState: Identity, loading = false) {
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 'user-1' },
    loading,
    personId,
    personIdentityState,
  });
}

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function stubServer(has: boolean) {
  (serverHasOwnEntries as ReturnType<typeof vi.fn>).mockResolvedValue(has);
}

function stubServerFails() {
  (serverHasOwnEntries as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useHasOwnEntries', () => {
  it('is no when the server counts none', async () => {
    mockAuth('person-1', 'resolved');
    stubServer(false);
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(result.current).toBe('no'));
  });

  it('is yes when the server has entries, and remembers it', async () => {
    mockAuth('person-1', 'resolved');
    stubServer(true);
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(result.current).toBe('yes'));
    expect(window.localStorage.getItem('myk9-has-own-entries:person-1')).toBe('yes');
  });

  it('is unknown when the server read fails with nothing remembered', async () => {
    mockAuth('person-1', 'resolved');
    stubServerFails();
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(serverHasOwnEntries).toHaveBeenCalled());
    expect(result.current).toBe('unknown');
  });

  it('holds a remembered no when the server read fails', async () => {
    window.localStorage.setItem('myk9-has-own-entries:person-1', 'no');
    mockAuth('person-1', 'resolved');
    stubServerFails();
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(serverHasOwnEntries).toHaveBeenCalled());
    expect(result.current).toBe('no');
  });

  it('holds yes from this device while identity is unresolved', () => {
    window.localStorage.setItem('myk9-has-own-entries:person-1', 'yes');
    mockAuth('person-1', 'unresolved');
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    expect(result.current).toBe('yes');
    expect(serverHasOwnEntries).not.toHaveBeenCalled();
  });

  it('is unknown, not no, while there is no person id yet', () => {
    mockAuth(null, 'unresolved');
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    expect(result.current).toBe('unknown');
    expect(serverHasOwnEntries).not.toHaveBeenCalled();
  });

  it('is no when the profile lookup confirms there is no person row', () => {
    mockAuth(null, 'missing');
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    expect(result.current).toBe('no');
  });

  describe.each([
    ['entries', replicatedEntriesTable],
    ['dogs', replicatedDogsTable],
  ])('a change on the %s replica', (_name, table) => {
    it('re-reads the server count once, after a debounce', async () => {
      mockAuth('person-1', 'resolved');
      stubServer(false);
      const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
      await waitFor(() => expect(result.current).toBe('no'));
      expect(serverHasOwnEntries).toHaveBeenCalledTimes(1);

      const subscribe = table.subscribe as ReturnType<typeof vi.fn>;
      expect(subscribe).toHaveBeenCalledWith(expect.any(Function), { emitCurrent: false });
      const onChange = subscribe.mock.calls[0][0] as () => void;

      stubServer(true);
      vi.useFakeTimers();
      act(() => {
        onChange();
        onChange();
        onChange();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1100);
      });
      vi.useRealTimers();

      await waitFor(() => expect(result.current).toBe('yes'));
      expect(serverHasOwnEntries).toHaveBeenCalledTimes(2);
    });
  });
});

describe('railOwnEntriesState', () => {
  it('keeps the item on My Entries itself, where a first checkout lands', () => {
    expect(railOwnEntriesState('no', '/exhibitor/entries')).toBe('unknown');
    expect(railOwnEntriesState('no', '/exhibitor/entries/abc')).toBe('unknown');
  });

  it('lets the server answer decide everywhere else', () => {
    expect(railOwnEntriesState('no', '/secretary/dashboard')).toBe('no');
    expect(railOwnEntriesState('no', '/exhibitor/entries-archive')).toBe('no');
    expect(railOwnEntriesState('yes', '/exhibitor/entries')).toBe('yes');
  });
});
