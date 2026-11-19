import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, renderHook, waitFor } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';

const replication = vi.hoisted(() => ({
  getAllClubs: vi.fn(),
  sync: vi.fn(),
  fetchClubById: vi.fn(),
  batchSet: vi.fn(),
  set: vi.fn(),
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

vi.mock('@/store/clubsIdentityBoundary', () => ({
  ensureClubsIdentity: vi.fn(async () => undefined),
  registerClubsIdentitySink: vi.fn(),
}));

import { resetClubReadinessForTests, useClubStore } from '@/store/clubStore';
import { useClubDetailData } from '../useClubDetailData';

const PENDING_ID = '44444444-4444-4444-8444-444444444444';

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

const pendingClub: Club = {
  id: PENDING_ID,
  name: 'Pending Club',
  email: 'pending@example.com',
  phone: '',
  description: '',
  logo: '',
  coverImage: '',
  accentColor: '',
  address: { street: '', city: '', state: '', zipCode: '', country: 'US' },
  upcomingShows: [],
  pastShows: [],
  authorizedAt: null,
};

describe('useClubDetailData for a club the device list lacks (MYK9-2153)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replication.getAllClubs.mockResolvedValue([]);
    replication.sync.mockResolvedValue({ success: true });
    getPublicClubById.mockResolvedValue(pendingClub);
    useClubStore.setState({ clubs: [], clubReadiness: 'loading', error: null });
    resetClubReadinessForTests();
    useClubStore.setState({
      clubsIdentity: { status: 'verified', reason: null, principalKey: 'user-1' },
    });
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    auth.value = { user: { id: 'admin-1', is_anonymous: false }, loading: false };
  });

  it('a signed-in admin with a stale replica gets the club from the server, authorization included', async () => {
    const { result } = renderHook(() => useClubDetailData(PENDING_ID), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.club?.name).toBe('Pending Club');
    expect(result.current.club?.authorizedAt).toBeNull();
    expect(getPublicClubById).toHaveBeenCalledWith(PENDING_ID, { withAuthorization: true });
  });

  it('writes nothing to the replica for the fetched club', async () => {
    const { result } = renderHook(() => useClubDetailData(PENDING_ID), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(replication.batchSet).not.toHaveBeenCalled();
    expect(replication.set).not.toHaveBeenCalled();
    expect(useClubStore.getState().clubs).toEqual([]);
  });

  it('is loading, not not-found, while the server read is pending', async () => {
    getPublicClubById.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useClubDetailData(PENDING_ID), { wrapper });

    await waitFor(() => expect(getPublicClubById).toHaveBeenCalled());
    expect(result.current.status).toBe('loading');
  });

  it('an empty server answer is not-found', async () => {
    getPublicClubById.mockResolvedValue(null);

    const { result } = renderHook(() => useClubDetailData(PENDING_ID), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('not-found'));
  });

  it('a server error is unavailable, and retry reads again to ready', async () => {
    getPublicClubById.mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(() => useClubDetailData(PENDING_ID), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    result.current.retry();
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('a non-UUID id is not-found with no request, signed in or not', async () => {
    const signedIn = renderHook(() => useClubDetailData('not-a-uuid'), { wrapper });
    await waitFor(() => expect(signedIn.result.current.status).toBe('not-found'));

    auth.value = { user: null, loading: false };
    const guest = renderHook(() => useClubDetailData('not-a-uuid'), { wrapper });
    await waitFor(() => expect(guest.result.current.status).toBe('not-found'));

    expect(getPublicClubById).not.toHaveBeenCalled();
  });

  it('a guest still gets the server answer without the authorization column', async () => {
    auth.value = { user: null, loading: false };
    getPublicClubById.mockResolvedValue(null);

    const { result } = renderHook(() => useClubDetailData(PENDING_ID), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('not-found'));
    expect(getPublicClubById).toHaveBeenCalledWith(PENDING_ID);
    expect(replication.sync).not.toHaveBeenCalled();
  });
});
