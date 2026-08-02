/**
 * MYK9-153: the record page tells the reader a person has been removed, and
 * offers the one action that applies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';

const hasPermission = vi.fn(() => true);
const restoreUser = vi.fn(async () => ({ data: {}, error: null as unknown }));

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission }) }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'current-user-id' },
    getUserRoles: () => ['site_admin'],
    hasPermission,
  }),
}));

vi.mock('@/hooks/useRoleBasedData', () => ({ useRoleBasedPeople: () => ({ people: [] }) }));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
  usePermanentDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/services/database/users', () => ({
  restoreUser: (...a: unknown[]) => restoreUser(...(a as [])),
}));

vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ loadUsers: vi.fn() }) }));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useOwnerDogsWithQuery: () => ({ dogs: [], isLoading: false, error: null, refetch: vi.fn() }),
  useDogStoreCompat: () => ({ dogs: [], getDogsByOwner: () => [], isLoading: false, error: null }),
}));

vi.mock('@/components/users/UserDetails/UserDetailsTabs', () => ({ default: () => <div /> }));
vi.mock('@/components/users/UserDetails/JudgeAvailabilityCard', () => ({ default: () => <div /> }));
vi.mock('@/components/users/UserDetails/UserDetailsDialogs', () => ({ default: () => <div /> }));

import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';

const person = (overrides: Partial<User> = {}): User =>
  ({
    id: 'p1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    roles: [UserRole.EXHIBITOR],
    dogs: [],
    ...overrides,
  }) as User;

const renderView = (p: User) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <UserDetailsView person={p} />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('UserDetailsView — removed people', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    restoreUser.mockResolvedValue({ data: {}, error: null });
  });

  it('says nothing for a live person', () => {
    renderView(person());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('states the removal on a removed person', () => {
    renderView(person({ deletedAt: '2026-07-30T00:00:00Z' } as Partial<User>));

    expect(screen.getByRole('status')).toHaveTextContent(/was removed/i);
  });

  it('restores through the shared service', async () => {
    const user = userEvent.setup();
    renderView(person({ deletedAt: '2026-07-30T00:00:00Z' } as Partial<User>));

    await user.click(screen.getByRole('button', { name: /restore person/i }));

    // The same restoreUser the roster and Deleted Items call — three surfaces,
    // one restore path.
    await waitFor(() => expect(restoreUser).toHaveBeenCalledWith('p1'));
  });

  it('explains the removal without offering Restore to a viewer who cannot', () => {
    hasPermission.mockReturnValue(false);
    renderView(person({ deletedAt: '2026-07-30T00:00:00Z' } as Partial<User>));

    expect(screen.getByRole('status')).toHaveTextContent(/was removed/i);
    expect(screen.queryByRole('button', { name: /restore person/i })).not.toBeInTheDocument();
  });
});
