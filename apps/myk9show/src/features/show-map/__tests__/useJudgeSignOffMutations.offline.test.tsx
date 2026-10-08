/**
 * MYK9-1030 review P1: the judge's sign-off is an offline-first write. With the app's query
 * client (default networkMode 'online'), an offline mutation pauses BEFORE its function runs, so
 * nothing reaches the replica or the queue and a reload loses it. Pinned with the real client.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const setJudgeSignOff = vi.hoisted(() => vi.fn(async () => 'mutation-id'));

vi.mock('@/services/replication', () => ({
  replicatedClassesTable: { setJudgeSignOff },
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'auth-secretary' } }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { createAppQueryClient } from '@/lib/queryClient';
import { useJudgeSignOffMutations } from '../useJudgeSignOffMutations';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createAppQueryClient()}>{children}</QueryClientProvider>;
}

describe('judge sign-off mutations while offline', () => {
  afterEach(() => {
    onlineManager.setOnline(true);
    setJudgeSignOff.mockClear();
  });

  it('records and clears into the replication queue with no network', async () => {
    onlineManager.setOnline(false);
    const onSettled = vi.fn();
    const { result } = renderHook(() => useJudgeSignOffMutations({ onSettled }), { wrapper });

    act(() => result.current.recordSignOff({ classIds: ['c1', 'c2'], registryId: 'AKC' }));
    await waitFor(() => expect(onSettled).toHaveBeenCalledWith(['c1', 'c2']));
    expect(setJudgeSignOff).toHaveBeenCalledWith('c1', {
      at: expect.any(String),
      by: 'auth-secretary',
    });
    expect(setJudgeSignOff).toHaveBeenCalledWith(
      'c2',
      expect.objectContaining({ by: 'auth-secretary' })
    );

    act(() => result.current.clearSignOff({ classIds: ['c1'], registryId: 'AKC' }));
    await waitFor(() => expect(setJudgeSignOff).toHaveBeenCalledWith('c1', null));
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });
});
