import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, createTestQueryClient, renderHook } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePermanentDeleteUserMutation } from './useUsersQuery';

const usersMocks = vi.hoisted(() => ({
  getAllUsers: vi.fn(),
  getUserById: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  permanentDeleteUser: vi.fn(),
  searchUsers: vi.fn(),
  getUsersByRole: vi.fn(),
  getUsersWithDogCounts: vi.fn(),
  getUsersStatistics: vi.fn(),
}));

vi.mock('@/services/database/users', () => usersMocks);

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: {
    error: vi.fn(),
  },
}));

vi.mock('@/services/mappers/userMappers', () => ({
  extractRoles: vi.fn(() => []),
}));

const createWrapper = () => {
  const queryClient = createTestQueryClient();

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
};

describe('usePermanentDeleteUserMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('preserves permanent-delete guard error codes for friendly UI messages', async () => {
    usersMocks.permanentDeleteUser.mockResolvedValue({
      data: null,
      error: {
        name: 'DatabaseError',
        message: 'This person still owns 2 live dog(s). Delete those dogs first.',
        code: 'MK001',
      },
    });

    const { result } = renderHook(() => usePermanentDeleteUserMutation(), {
      wrapper: createWrapper(),
    });

    let caughtError: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: 'p1' });
      } catch (error) {
        caughtError = error;
      }
    });

    expect(caughtError).toBeInstanceOf(Error);
    expect(caughtError).toMatchObject({
      message: 'This person still owns 2 live dog(s). Delete those dogs first.',
      code: 'MK001',
    });
  });
});
