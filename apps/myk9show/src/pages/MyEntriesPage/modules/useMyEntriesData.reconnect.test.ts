import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMyEntriesData } from './useMyEntriesData';
import { getUserEntries } from '@/services/database/entries';
import { useAuthContext } from '@/hooks/useAuthContext';

vi.mock('@/services/database/entries', () => ({
  getUserEntries: vi.fn(),
}));
vi.mock('@/hooks/useAuthContext');
vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn() },
  AuditAction: { READ: 'READ', UPDATE: 'UPDATE' },
}));
vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  LoggingService: { getInstance: () => ({ error: vi.fn(), log: vi.fn(), info: vi.fn() }) },
}));

/**
 * Cold offline boot, then signal returns (offline-cold-boot.spec.ts:350).
 *
 * MYK9-601 made the person id durable, so an offline cold boot reads the
 * replica under the CACHED id while the authoritative lookup is still
 * unresolved. When connectivity returns, that lookup confirms the SAME id: the
 * `user::person` identity key does not change, so nothing re-read the entries
 * and My Shows stayed on the offline replica read until a manual reload.
 */
const auth = (personIdentityState: 'unresolved' | 'resolved') => ({
  user: { id: 'user-1', email: 'exhibitor@test.com' },
  userWithRoles: { databaseUserId: 'person-1' },
  personId: 'person-1',
  personIdentityState,
  hasUsablePersonId: true,
  isAuthenticated: true,
});

const renderData = () =>
  renderHook(() =>
    useMyEntriesData({ persistCheckInStatus: vi.fn().mockResolvedValue(undefined) })
  );

describe('useMyEntriesData — confirming a cached identity re-reads an unconfirmed load', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue(auth('unresolved'));
  });

  it('re-reads when the identity confirms after an offline replica read', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      source: 'replica-offline',
      data: [],
      error: null,
    });
    const { result, rerender } = renderData();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getUserEntries).toHaveBeenCalledTimes(1);

    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue(auth('resolved'));
    rerender();

    await waitFor(() => expect(getUserEntries).toHaveBeenCalledTimes(2));
    expect(getUserEntries).toHaveBeenLastCalledWith('person-1');
  });

  it('does not re-read when the load it already has was confirmed by the server', async () => {
    (getUserEntries as ReturnType<typeof vi.fn>).mockResolvedValue({
      source: 'confirmed',
      data: [],
      error: null,
    });
    const { result, rerender } = renderData();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue(auth('resolved'));
    rerender();

    // Give a wrongly-scheduled reload every chance to fire before asserting.
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(getUserEntries).toHaveBeenCalledTimes(1);
  });

  // Both review lenses on #2434: a read still in flight at confirmation (a
  // captive-portal read timing out) lands as a replica read AFTER the network
  // returned, and was never re-read.
  it('re-reads when a read in flight at confirmation lands unconfirmed', async () => {
    const first = deferred<ReadResult>();
    (getUserEntries as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ source: 'confirmed', data: [], error: null });
    const { rerender } = renderData();
    expect(getUserEntries).toHaveBeenCalledTimes(1);

    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue(auth('resolved'));
    rerender();
    await act(async () => {
      first.resolve({ source: 'replica-after-error', data: [], error: null });
    });

    await waitFor(() => expect(getUserEntries).toHaveBeenCalledTimes(2));
  });

  it('does not re-read when a read in flight at confirmation lands confirmed', async () => {
    const first = deferred<ReadResult>();
    (getUserEntries as ReturnType<typeof vi.fn>).mockReturnValueOnce(first.promise);
    const { result, rerender } = renderData();

    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue(auth('resolved'));
    rerender();
    await act(async () => {
      first.resolve({ source: 'confirmed', data: [], error: null });
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(getUserEntries).toHaveBeenCalledTimes(1);
  });

  // Round-2 review of #2434: an earlier CONFIRMED read landed, then a refresh
  // is in flight when the identity confirms. The refresh is the read to judge.
  it('judges the read in flight at confirmation, not an earlier confirmed one', async () => {
    const refresh = deferred<ReadResult>();
    (getUserEntries as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ source: 'confirmed', data: [], error: null })
      .mockReturnValueOnce(refresh.promise)
      .mockResolvedValue({ source: 'confirmed', data: [], error: null });
    const { result, rerender } = renderData();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let refreshing!: Promise<void>;
    act(() => {
      refreshing = result.current.refreshEntries();
    });
    (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue(auth('resolved'));
    rerender();
    await act(async () => {
      refresh.resolve({ source: 'replica-after-error', data: [], error: null });
      await refreshing;
    });

    await waitFor(() => expect(getUserEntries).toHaveBeenCalledTimes(3));
  });

  it('never lets an older read overwrite a newer one', async () => {
    const slow = deferred<ReadResult>();
    (getUserEntries as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ source: 'confirmed', data: [], error: null });
    const { result } = renderData();

    await act(async () => {
      await result.current.refreshEntries();
    });
    expect(result.current.source).toBe('confirmed');

    await act(async () => {
      slow.resolve({ source: 'replica-after-error', data: [], error: null });
    });
    expect(result.current.source).toBe('confirmed');
  });
});

type ReadResult = { source: string; data: unknown[]; error: Error | null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}
