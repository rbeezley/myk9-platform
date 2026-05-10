import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { reassignClassJudge } from '@/services/database/judges';
import {
  closeWaitlistForClasses,
  promoteWaitlistEntry,
  removeFromWaitlist,
} from '@/services/database/waitlists';
import { useWaitListMutations } from '../useWaitListMutations';

vi.mock('@/services/database/judges', () => ({
  reassignClassJudge: vi.fn(),
}));

vi.mock('@/services/database/waitlists', () => ({
  bulkPromoteWaitlistEntries: vi.fn(),
  closeWaitlistForClasses: vi.fn(),
  promoteWaitlistEntry: vi.fn(),
  removeFromWaitlist: vi.fn(),
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
    vi.mocked(promoteWaitlistEntry).mockResolvedValue('new-entry-uuid');
    vi.mocked(removeFromWaitlist).mockResolvedValue({ data: null, error: null });
    vi.mocked(closeWaitlistForClasses).mockResolvedValue(undefined);
    vi.mocked(reassignClassJudge).mockResolvedValue(undefined);
  });

  describe('promoteEntry', () => {
    it('calls the Wait List module with correct args', async () => {
      const { result } = renderHook(() => useWaitListMutations('show-1'), {
        wrapper: makeWrapper(),
      });

      await act(async () => {
        await result.current.promoteEntry.mutateAsync({
          waitlistEntryId: 'wl-entry-1',
          deadlineHours: 48,
        });
      });

      expect(promoteWaitlistEntry).toHaveBeenCalledWith('wl-entry-1', 48);
    });

    it('uses default deadline of 24 hours when not specified', async () => {
      const { result } = renderHook(() => useWaitListMutations('show-1'), {
        wrapper: makeWrapper(),
      });

      await act(async () => {
        await result.current.promoteEntry.mutateAsync({ waitlistEntryId: 'wl-entry-2' });
      });

      expect(promoteWaitlistEntry).toHaveBeenCalledWith('wl-entry-2', 24);
    });

    it('throws when promotion fails', async () => {
      vi.mocked(promoteWaitlistEntry).mockRejectedValue(new Error('rpc failed'));

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
    it('calls the Wait List module by id', async () => {
      const { result } = renderHook(() => useWaitListMutations('show-1'), {
        wrapper: makeWrapper(),
      });

      await act(async () => {
        await result.current.removeFromWaitList.mutateAsync('wl-entry-99');
      });

      expect(removeFromWaitlist).toHaveBeenCalledWith('wl-entry-99');
    });
  });

  describe('closeWaitList', () => {
    it('calls the Wait List module with the class ids', async () => {
      const { result } = renderHook(() => useWaitListMutations('show-1'), {
        wrapper: makeWrapper(),
      });

      await act(async () => {
        await result.current.closeWaitList.mutateAsync(['class-1', 'class-2']);
      });

      expect(closeWaitlistForClasses).toHaveBeenCalledWith(['class-1', 'class-2']);
    });
  });

  describe('reassignClass', () => {
    it('calls the Judge module with show and judge ids', async () => {
      const { result } = renderHook(() => useWaitListMutations('show-1'), {
        wrapper: makeWrapper(),
      });

      await act(async () => {
        await result.current.reassignClass.mutateAsync({
          classId: 'class-1',
          fromJudgeId: 'judge-1',
          toJudgeId: 'judge-2',
        });
      });

      expect(reassignClassJudge).toHaveBeenCalledWith('show-1', 'class-1', 'judge-1', 'judge-2');
    });
  });
});
