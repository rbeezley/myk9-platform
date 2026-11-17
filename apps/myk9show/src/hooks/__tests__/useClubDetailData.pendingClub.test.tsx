import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';

const replication = vi.hoisted(() => ({
  getAllClubs: vi.fn(),
  sync: vi.fn(),
  fetchClubById: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  value: { user: { id: 'admin-1', is_anonymous: false }, loading: false } as {
    user: { id: string; is_anonymous?: boolean } | null;
    loading: boolean;
  },
}));
const getPublicClubById = vi.hoisted(() => vi.fn());

vi.mock('@/services/replication', () => ({ replicatedClubsTable: replication }));
vi.mock('@/services/LoggingService', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => auth.value }));
vi.mock('@/services/database/clubs', () => ({ getPublicClubById }));

import { resetClubReadinessForTests, useClubStore } from '@/store/clubStore';
import { useClubDetailData } from '../useClubDetailData';

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

const pendingRow = {
  id: 'club-pending',
  name: 'Pending Club',
  email: 'pending@example.com',
  phone: '',
  authorizedAt: null,
};

describe('useClubDetailData for a club awaiting authorization (MYK9-2153)', () => {
  let localRows: (typeof pendingRow)[];

  beforeEach(() => {
    vi.clearAllMocks();
    localRows = [];
    replication.getAllClubs.mockImplementation(async () => localRows);
    replication.sync.mockResolvedValue({ success: true });
    replication.fetchClubById.mockImplementation(async () => {
      localRows = [pendingRow];
      return pendingRow;
    });
    getPublicClubById.mockResolvedValue(null);
    useClubStore.setState({
      clubs: [],
      clubReadiness: 'loading',
      requestedClubLookup: null,
      error: null,
    });
    resetClubReadinessForTests();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    auth.value = { user: { id: 'admin-1', is_anonymous: false }, loading: false };
  });

  it('a signed-in site admin reaches the pending club the replica lacked', async () => {
    const { result } = renderHook(() => useClubDetailData('club-pending'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.club?.name).toBe('Pending Club');
    expect(replication.fetchClubById).toHaveBeenCalledWith('club-pending');
    expect(getPublicClubById).not.toHaveBeenCalled();
  });

  it('a signed-in viewer the server hides the club from still gets not-found', async () => {
    replication.fetchClubById.mockResolvedValue(null);

    const { result } = renderHook(() => useClubDetailData('club-pending'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('not-found'));
  });

  it('shows loading, never not-found, while the by-id lookup is pending', async () => {
    let finish: (value: typeof pendingRow) => void = () => {};
    replication.fetchClubById.mockImplementation(
      () => new Promise<typeof pendingRow>(resolve => (finish = resolve))
    );
    // A fresh session whose replica lacks the club: readiness alone says 'fresh'.
    await useClubStore.getState().ensureClubsReady();
    useClubStore.setState({ clubReadiness: 'fresh' });

    const { result } = renderHook(() => useClubDetailData('club-pending'), { wrapper });

    await waitFor(() => expect(replication.fetchClubById).toHaveBeenCalled());
    expect(result.current.status).toBe('loading');
    localRows = [pendingRow];
    finish(pendingRow);
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('shows unavailable, which can retry, when the by-id lookup fails', async () => {
    replication.fetchClubById.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useClubDetailData('club-pending'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    replication.fetchClubById.mockImplementation(async () => {
      localRows = [pendingRow];
      return pendingRow;
    });
    result.current.retry();
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('a guest still gets the server answer (not-found), never the by-id replica fetch', async () => {
    auth.value = { user: null, loading: false };

    const { result } = renderHook(() => useClubDetailData('club-pending'), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('not-found'));
    expect(getPublicClubById).toHaveBeenCalledWith('club-pending');
    expect(replication.fetchClubById).not.toHaveBeenCalled();
    expect(replication.sync).not.toHaveBeenCalled();
  });
});
