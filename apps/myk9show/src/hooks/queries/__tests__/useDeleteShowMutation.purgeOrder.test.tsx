import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  deleteShowRecord: vi.fn(),
  purge: vi.fn(),
}));

vi.mock('@/services/showDeletion', () => ({ deleteShowRecord: mocks.deleteShowRecord }));
vi.mock('@/store/showStore', () => ({
  useShowStore: { getState: () => ({ purgeDeletedShow: mocks.purge }) },
}));

import { useDeleteShowMutation } from '../useShowsDatabase';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useDeleteShowMutation(), { wrapper });
  return { result, invalidate };
}

describe('useDeleteShowMutation — replica purge ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteShowRecord.mockResolvedValue({ data: { id: 'show-1' }, error: null });
  });

  it('does not invalidate show queries until the replica purge has finished', async () => {
    let finishPurge!: () => void;
    mocks.purge.mockReturnValue(new Promise<void>(resolve => (finishPurge = resolve)));
    const { result, invalidate } = setup();

    let done!: Promise<unknown>;
    act(() => {
      done = result.current.mutateAsync({ id: 'show-1' });
    });
    await vi.waitFor(() => expect(mocks.purge).toHaveBeenCalledWith('show-1'));
    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      finishPurge();
      await done;
    });
    expect(invalidate).toHaveBeenCalled();
  });

  it('still reports the delete as successful when the local purge fails', async () => {
    mocks.purge.mockRejectedValue(new Error('idb unavailable'));
    const { result, invalidate } = setup();

    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'show-1' })).resolves.toEqual({ id: 'show-1' });
    });
    expect(invalidate).toHaveBeenCalled();
  });
});
