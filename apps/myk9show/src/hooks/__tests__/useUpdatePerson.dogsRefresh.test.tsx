import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/database/users', () => ({
  getAllUsers: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  updateUser: vi.fn(async (id: string) => ({
    data: { id, first_name: 'Pat', last_name: 'Owner', street_address: '9 Oak Ave' },
    error: null,
  })),
}));

import { useUpdatePerson } from '@/hooks/useUsers';
import type { User } from '@/types/user-types';

/**
 * MYK9-1010: the dog roster carries each owner's address, and the entry wizard
 * blocks an AKC class until it is complete. A person save must therefore mark
 * the roster stale, or the exhibitor returns from their profile to a class that
 * still says the address is missing.
 */
describe('useUpdatePerson refreshes the dog roster', () => {
  it('invalidates the dogs queries after a successful save', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdatePerson(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'person-1',
        firstName: 'Pat',
        lastName: 'Owner',
        streetAddress: '9 Oak Ave',
      } as User);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dogs'] });
  });
});
