/**
 * MYK9-1031: the paper check is an offline-first write, like the judge's sign-off beside it. With
 * the app's query client (default networkMode 'online'), an offline mutation pauses BEFORE its
 * function runs, so nothing reaches the replica or the queue and a reload loses it. Pinned with
 * the real client, and with the exact stamp handed to the replica.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const setResultsVerified = vi.hoisted(() => vi.fn(async () => 'mutation-id'));
const getEntriesByClass = vi.hoisted(() => vi.fn(async () => [] as unknown[]));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { setResultsVerified },
  replicatedEntriesTable: { getEntriesByClass },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'auth-secretary' } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { createAppQueryClient } from '@/lib/queryClient';
import { useResultsVerifiedMutations } from '../useResultsVerifiedMutations';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createAppQueryClient()}>{children}</QueryClientProvider>;
}

// sha256 of 'myk9-class-results-v1\n' (a class with no results line): the fingerprint of an
// empty class, so the hash the replica receives is a real one, not a stub.
const EMPTY_CLASS_FINGERPRINT = /^[0-9a-f]{64}$/;

describe('paper check mutations while offline', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    setResultsVerified.mockClear();
  });

  it('records and clears into the replication queue with no network', async () => {
    onlineManager.setOnline(false);
    const onSettled = vi.fn();
    const { result } = renderHook(() => useResultsVerifiedMutations({ onSettled }), { wrapper });

    act(() => result.current.verify({ classId: 'c1' }));
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith('c1'));
    expect(setResultsVerified).toHaveBeenCalledWith('c1', {
      at: expect.any(String),
      by: 'auth-secretary',
      fingerprint: expect.stringMatching(EMPTY_CLASS_FINGERPRINT),
    });

    act(() => result.current.undo({ classId: 'c1' }));
    await waitFor(() => expect(setResultsVerified).toHaveBeenCalledWith('c1', null));
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });
});
