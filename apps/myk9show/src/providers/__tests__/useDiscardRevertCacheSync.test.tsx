import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getDogById } = vi.hoisted(() => ({ getDogById: vi.fn() }));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getDogById,
    cachedRowFields: (dog: { id: string; callName: string }) => ({
      id: dog.id,
      call_name: dog.callName,
    }),
  },
}));

import { useDiscardRevertCacheSync } from '../useDiscardRevertCacheSync';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The refused edit is what the screens currently show.
  queryClient.setQueryData(['dogs', 'person-1', 'all'], [{ id: 'dog-1', call_name: 'Refused' }]);
  queryClient.setQueryData(['dogs', 'dog-1'], { id: 'dog-1', call_name: 'Refused' });
  queryClient.setQueryData(['users', 'owner-1', 'dogs'], [{ id: 'dog-1', call_name: 'Refused' }]);
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  renderHook(() => useDiscardRevertCacheSync(), { wrapper });
  return { queryClient, invalidate };
}

function replaced(tableName: string, rowId: string) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('replication:discard-row-replaced', { detail: { tableName, rowId } })
    );
  });
}

describe('useDiscardRevertCacheSync (MYK9-1076)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the reverted dog in the roster, detail and owner's dogs, then refetches", async () => {
    getDogById.mockResolvedValue({ id: 'dog-1', callName: 'Original', ownerId: 'owner-1' });
    const { queryClient, invalidate } = setup();

    replaced('dogs', 'dog-1');

    await waitFor(() =>
      expect(queryClient.getQueryData(['dogs', 'dog-1'])).toEqual({
        id: 'dog-1',
        call_name: 'Original',
      })
    );
    expect(queryClient.getQueryData(['dogs', 'person-1', 'all'])).toEqual([
      { id: 'dog-1', call_name: 'Original' },
    ]);
    expect(queryClient.getQueryData(['users', 'owner-1', 'dogs'])).toEqual([
      { id: 'dog-1', call_name: 'Original' },
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dogs'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users', 'owner-1', 'dogs'] });
  });

  it('ignores rows of other tables', async () => {
    const { invalidate } = setup();

    replaced('entries', 'entry-1');

    await new Promise(resolve => setTimeout(resolve, 10));
    expect(getDogById).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
