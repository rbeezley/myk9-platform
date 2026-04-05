import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWaitListMutations } from '../useWaitListMutations';

const mockRpc = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

vi.mock('@/lib/queryClient', () => ({
  queryKeys: {
    show: (id: string) => ['shows', id],
    showEntries: (id: string) => ['entries', 'show', id],
  },
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe('useWaitListMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default chain for .from().delete().eq()
    const eqDelete = vi.fn().mockResolvedValue({ error: null });
    const deleteChain = { eq: eqDelete };
    const eqUpdate = vi.fn().mockResolvedValue({ error: null });
    const inUpdate = vi.fn().mockReturnValue({ eq: eqUpdate });
    const updateChain = {
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: eqUpdate }) }),
      in: inUpdate,
    };

    mockFrom.mockReturnValue({
      delete: () => deleteChain,
      update: () => updateChain,
    });

    mockDelete.mockResolvedValue({ error: null });
    mockUpdate.mockResolvedValue({ error: null });
  });

  describe('promoteEntry', () => {
    it('calls rpc with correct args', async () => {
      mockRpc.mockResolvedValue({ data: 'new-entry-uuid', error: null });

      const { result } = renderHook(() => useWaitListMutations('show-1'), {
        wrapper: makeWrapper(),
      });

      await act(async () => {
        await result.current.promoteEntry.mutateAsync({
          waitlistEntryId: 'wl-entry-1',
          deadlineHours: 48,
        });
      });

      expect(mockRpc).toHaveBeenCalledWith('promote_waitlist_entry', {
        p_waitlist_entry_id: 'wl-entry-1',
        p_deadline_hours: 48,
      });
    });

    it('uses default deadline of 24 hours when not specified', async () => {
      mockRpc.mockResolvedValue({ data: 'new-entry-uuid', error: null });

      const { result } = renderHook(() => useWaitListMutations('show-1'), {
        wrapper: makeWrapper(),
      });

      await act(async () => {
        await result.current.promoteEntry.mutateAsync({ waitlistEntryId: 'wl-entry-2' });
      });

      expect(mockRpc).toHaveBeenCalledWith('promote_waitlist_entry', {
        p_waitlist_entry_id: 'wl-entry-2',
        p_deadline_hours: 24,
      });
    });

    it('throws when rpc returns an error', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('rpc failed') });

      const { result } = renderHook(() => useWaitListMutations('show-1'), {
        wrapper: makeWrapper(),
      });

      await act(async () => {
        result.current.promoteEntry.mutate({ waitlistEntryId: 'wl-entry-3' });
      });

      await waitFor(() => expect(result.current.promoteEntry.isError).toBe(true));
    });
  });

  describe('removeFromWaitList', () => {
    it('deletes the waitlist_entries row by id', async () => {
      const eqChain = vi.fn().mockResolvedValue({ error: null });
      const deleteChain = { eq: eqChain };
      mockFrom.mockReturnValue({ delete: () => deleteChain });

      const { result } = renderHook(() => useWaitListMutations('show-1'), {
        wrapper: makeWrapper(),
      });

      await act(async () => {
        await result.current.removeFromWaitList.mutateAsync('wl-entry-99');
      });

      expect(mockFrom).toHaveBeenCalledWith('waitlist_entries');
      expect(eqChain).toHaveBeenCalledWith('id', 'wl-entry-99');
    });
  });

  describe('closeWaitList', () => {
    it('bulk-updates all waiting entries to expired for the given class ids', async () => {
      const eqChain = vi.fn().mockResolvedValue({ error: null });
      const inChain = vi.fn().mockReturnValue({ eq: eqChain });
      const updateChain = { in: inChain };
      mockFrom.mockReturnValue({ update: () => updateChain });

      const { result } = renderHook(() => useWaitListMutations('show-1'), {
        wrapper: makeWrapper(),
      });

      await act(async () => {
        await result.current.closeWaitList.mutateAsync(['class-1', 'class-2']);
      });

      expect(mockFrom).toHaveBeenCalledWith('waitlist_entries');
      expect(inChain).toHaveBeenCalledWith('class_id', ['class-1', 'class-2']);
      expect(eqChain).toHaveBeenCalledWith('status', 'waiting');
    });
  });
});
