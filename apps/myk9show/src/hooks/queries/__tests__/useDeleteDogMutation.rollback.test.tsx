/**
 * MYK9-584: what the optimistic delete leaves behind when the server refuses.
 *
 * A bulk delete runs up to BULK_DISPATCH_CONCURRENCY mutations at once. The
 * original rollback snapshotted the WHOLE dogs cache in each `onMutate` and
 * restored that snapshot in `onError`. With two in flight the second snapshot
 * is taken AFTER the first has already removed its dog, so the two restores
 * disagree and the last writer wins — leaving one dog missing from the list
 * even though the server still has it. That is the "one comes back on refresh,
 * the other stays" half of the report.
 *
 * The fix converges on server truth instead of replaying stale snapshots, so
 * these assert the OUTCOME (the cache is not left lying) rather than the
 * mechanism.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const deleteDogMock = vi.fn();

vi.mock('@/services/database/dogs', () => ({
  getAllDogs: vi.fn(),
  getDogById: vi.fn(),
  getDogsByOwner: vi.fn(),
  createDog: vi.fn(),
  updateDog: vi.fn(),
  deleteDog: (...args: unknown[]) => deleteDogMock(...args),
  forceDeleteDog: vi.fn(),
  searchDogs: vi.fn(),
  getDogStatistics: vi.fn(),
  getOwnedLiveDogsByPerson: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { delete: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/hooks/useCurrentPersonId', () => ({ useCurrentPersonId: () => 'person-1' }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => true, user: { id: 'u1' } }),
}));

import { useDeleteDogMutation } from '../useDogsDatabase';
import { queryKeys } from '@/lib/queryClient';

const DOGS_KEY = [...queryKeys.dogs, 'person-1', true];

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

describe('useDeleteDogMutation rollback under concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not leave a refused dog missing from the cache when two deletes fail together', async () => {
    const client = makeClient();
    client.setQueryData(DOGS_KEY, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    // Both refused by the server, exactly as MK002 arrives.
    deleteDogMock.mockResolvedValue({
      data: null,
      error: { name: 'DatabaseError', code: 'MK002', message: 'paid or scored entries' },
    });

    const { result } = renderHook(() => useDeleteDogMutation(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await Promise.allSettled([
        result.current.mutateAsync({ id: 'a' }),
        result.current.mutateAsync({ id: 'b' }),
      ]);
    });

    // Neither delete succeeded, so the list the UI reads must still contain
    // every dog. Under the snapshot-restore rollback one of them stayed gone.
    await waitFor(() => {
      const ids = (client.getQueryData(DOGS_KEY) as Array<{ id: string }> | undefined)?.map(
        d => d.id
      );
      expect(ids).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    });
  });

  it('marks the dogs query stale on failure so the list refetches server truth', async () => {
    const client = makeClient();
    client.setQueryData(DOGS_KEY, [{ id: 'a' }, { id: 'b' }]);

    deleteDogMock.mockResolvedValue({
      data: null,
      error: { name: 'DatabaseError', code: 'MK002', message: 'paid or scored entries' },
    });

    const { result } = renderHook(() => useDeleteDogMutation(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ id: 'a' }).catch(() => undefined);
    });

    // A stale mark is what guarantees the next render reconciles with the
    // server rather than trusting whatever the interleaved rollbacks left.
    await waitFor(() => {
      expect(client.getQueryState(DOGS_KEY)?.isInvalidated).toBe(true);
    });
  });
});
