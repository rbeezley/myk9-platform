import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useDiscardRevertCacheSync } from '../useDiscardRevertCacheSync';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const keys = [
    ['dogs', 'person-1', 'all'],
    ['dogs', 'dog-1'],
    // A discarded transfer from owner A to owner B touched both lists.
    ['users', 'owner-a', 'dogs'],
    ['users', 'owner-b', 'dogs'],
    ['users', 'owner-a'],
    ['entries', 'show-1'],
  ];
  for (const key of keys) queryClient.setQueryData(key, []);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  renderHook(() => useDiscardRevertCacheSync(), { wrapper });
  const stale = () =>
    queryClient
      .getQueryCache()
      .getAll()
      .filter(query => query.state.isInvalidated)
      .map(query => query.queryKey);
  return { stale };
}

function replaced(tableName: string) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('replication:discard-row-replaced', { detail: { tableName, rowId: 'x' } })
    );
  });
}

describe('useDiscardRevertCacheSync (MYK9-1076)', () => {
  it("refetches the dog roster, detail and every owner's dogs", () => {
    const { stale } = setup();

    replaced('dogs');

    expect(stale()).toEqual(
      expect.arrayContaining([
        ['dogs', 'person-1', 'all'],
        ['dogs', 'dog-1'],
        ['users', 'owner-a', 'dogs'],
        ['users', 'owner-b', 'dogs'],
      ])
    );
    expect(stale()).not.toContainEqual(['users', 'owner-a']);
    expect(stale()).not.toContainEqual(['entries', 'show-1']);
  });

  it('ignores rows of other tables', () => {
    const { stale } = setup();

    replaced('entries');

    expect(stale()).toEqual([]);
  });
});
