import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient, renderHook } from '@/test/utils/testUtils';

const replication = vi.hoisted(() => ({
  getAllClubs: vi.fn(),
  sync: vi.fn(),
  fetchClubById: vi.fn(),
  batchSet: vi.fn(),
  set: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  value: { user: null, loading: false } as {
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
import { CLUB_LOOKUP_DEADLINE_MS } from '../clubLookupDeadline';
import { useClubDetailData } from '../useClubDetailData';

const CLUB_ID = '55555555-5555-4555-8555-555555555555';

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** MYK9-2167: a stalled lookup offers Retry at the 15 s deadline, not after 70 s. */
describe('useClubDetailData with a stalled lookup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    replication.getAllClubs.mockResolvedValue([]);
    replication.sync.mockResolvedValue({ success: true });
    getPublicClubById.mockReturnValue(new Promise(() => undefined));
    useClubStore.setState({ clubs: [], clubReadiness: 'loading', error: null });
    resetClubReadinessForTests();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is 15 seconds', () => {
    expect(CLUB_LOOKUP_DEADLINE_MS).toBe(15_000);
  });

  it('a guest sees the retry state at the deadline, after one attempt', async () => {
    auth.value = { user: null, loading: false };
    const { result } = renderHook(() => useClubDetailData(CLUB_ID), { wrapper });

    await advance(CLUB_LOOKUP_DEADLINE_MS - 1_000);
    expect(result.current.status).toBe('loading');

    // The deadline fires at 15 s; React Query notifies on the next macrotask.
    await advance(1_001);
    expect(result.current.status).toBe('unavailable');
    expect(getPublicClubById).toHaveBeenCalledTimes(1);

    await advance(60_000);
    expect(getPublicClubById).toHaveBeenCalledTimes(1);
  });

  it('a signed-in viewer on the server fallback sees the retry state at the deadline', async () => {
    auth.value = { user: { id: 'admin-1', is_anonymous: false }, loading: false };
    const { result } = renderHook(() => useClubDetailData(CLUB_ID), { wrapper });

    await advance(0);
    expect(getPublicClubById).toHaveBeenCalledWith(CLUB_ID, { withAuthorization: true });
    await advance(CLUB_LOOKUP_DEADLINE_MS - 1_000);
    expect(result.current.status).toBe('loading');

    // The deadline fires at 15 s; React Query notifies on the next macrotask.
    await advance(1_001);
    expect(result.current.status).toBe('unavailable');
    expect(getPublicClubById).toHaveBeenCalledTimes(1);
  });
});
