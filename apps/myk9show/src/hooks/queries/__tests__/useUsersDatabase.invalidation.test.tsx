/**
 * MYK9-2351: user mutations must invalidate the mounted QueryClient (the one the
 * hooks read through `useQueryClient`) using the key `useUsersQuery` reads, so the
 * optimistic `temp-` row from a create is replaced by the refetch.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { createTestQueryClient, renderHook } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { useCreateUserMutation, useUpdateUserMutation } from '../useUsersDatabase';

const db = vi.hoisted(() => ({ createUser: vi.fn(), updateUser: vi.fn() }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  createUser: db.createUser,
  updateUser: db.updateUser,
}));

function setup() {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(queryKeys.people, [{ id: 'u-1', first_name: 'A', last_name: 'B' }]);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('user mutations invalidate the mounted cache (MYK9-2351)', () => {
  it('create invalidates the users list key', async () => {
    db.createUser.mockResolvedValue({ data: { id: 'u-2' }, error: null });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useCreateUserMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ first_name: 'C', last_name: 'D' } as never);
    });

    expect(queryClient.getQueryState(queryKeys.people)?.isInvalidated).toBe(true);
  });

  it('update invalidates the users list key', async () => {
    db.updateUser.mockResolvedValue({ data: { id: 'u-1' }, error: null });
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useUpdateUserMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 'u-1', updates: { first_name: 'Z' } as never });
    });

    expect(queryClient.getQueryState(queryKeys.people)?.isInvalidated).toBe(true);
  });
});
