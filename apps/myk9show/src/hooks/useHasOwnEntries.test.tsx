import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useHasOwnEntries } from './useHasOwnEntries';
import { useAuthContext } from '@/hooks/useAuthContext';
import { readOwnReplicaEntries } from '@/services/database/entries/ownReplicaEntries';
import { serverHasOwnEntries } from '@/services/database/entries/ownEntriesExistence';
import { markJustEntered } from '@/features/own-entries/ownEntriesMemory';

vi.mock('@/hooks/useAuthContext');
vi.mock('@/services/database/entries/ownReplicaEntries', () => ({
  readOwnReplicaEntries: vi.fn(),
}));
vi.mock('@/services/database/entries/ownEntriesExistence', () => ({
  serverHasOwnEntries: vi.fn(),
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { subscribe: vi.fn(() => () => {}) },
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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function stubServer(has: boolean) {
  (serverHasOwnEntries as ReturnType<typeof vi.fn>).mockResolvedValue(has);
}

function stubReplica(count: number) {
  (readOwnReplicaEntries as ReturnType<typeof vi.fn>).mockResolvedValue(
    Array.from({ length: count }, (_, i) => ({ id: `e${i}` }))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('useHasOwnEntries', () => {
  it('is no when the replica is empty and the server counts none', async () => {
    mockAuth('person-1', 'resolved');
    stubReplica(0);
    stubServer(false);
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(result.current).toBe('no'));
  });

  it('is yes when the replica is empty but the server has entries (a show never opened here)', async () => {
    mockAuth('person-1', 'resolved');
    stubReplica(0);
    stubServer(true);
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(result.current).toBe('yes'));
    expect(window.localStorage.getItem('myk9-has-own-entries:person-1')).toBe('yes');
  });

  it('is unknown when the replica is empty and the server read fails with nothing remembered', async () => {
    mockAuth('person-1', 'resolved');
    stubReplica(0);
    (serverHasOwnEntries as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(serverHasOwnEntries).toHaveBeenCalled());
    expect(result.current).toBe('unknown');
  });

  it('holds a remembered no when the server read fails', async () => {
    window.localStorage.setItem('myk9-has-own-entries:person-1', 'no');
    mockAuth('person-1', 'resolved');
    stubReplica(0);
    (serverHasOwnEntries as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(serverHasOwnEntries).toHaveBeenCalled());
    expect(result.current).toBe('no');
  });

  it('is yes from the replica without waiting for the server', async () => {
    mockAuth('person-1', 'resolved');
    stubReplica(1);
    (serverHasOwnEntries as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(result.current).toBe('yes'));
  });

  it('is yes when the replica holds an entry of their own', async () => {
    mockAuth('person-1', 'resolved');
    stubReplica(1);
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(result.current).toBe('yes'));
  });

  it('is unknown, not no, while there is no person id yet', () => {
    mockAuth(null, 'unresolved');
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    expect(result.current).toBe('unknown');
    expect(readOwnReplicaEntries).not.toHaveBeenCalled();
  });

  it('is unknown, not no, when an empty replica is read before identity resolves', async () => {
    mockAuth('person-1', 'unresolved');
    stubReplica(0);
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(readOwnReplicaEntries).toHaveBeenCalled());
    expect(result.current).toBe('unknown');
  });

  it('holds yes from this device while identity is unresolved and the replica reads empty', async () => {
    window.localStorage.setItem('myk9-has-own-entries:person-1', 'yes');
    mockAuth('person-1', 'unresolved');
    stubReplica(0);
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(readOwnReplicaEntries).toHaveBeenCalled());
    expect(result.current).toBe('yes');
  });

  it('remembers a yes for the next cold boot', async () => {
    mockAuth('person-1', 'resolved');
    stubReplica(2);
    renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() =>
      expect(window.localStorage.getItem('myk9-has-own-entries:person-1')).toBe('yes')
    );
  });

  it('is yes right after checkout, before the entry has replicated', async () => {
    markJustEntered();
    mockAuth('person-1', 'resolved');
    stubReplica(0);
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    await waitFor(() => expect(readOwnReplicaEntries).toHaveBeenCalled());
    expect(result.current).toBe('yes');
  });

  it('is no when the profile lookup confirms there is no person row', () => {
    mockAuth(null, 'missing');
    const { result } = renderHook(() => useHasOwnEntries(), { wrapper });
    expect(result.current).toBe('no');
  });
});
