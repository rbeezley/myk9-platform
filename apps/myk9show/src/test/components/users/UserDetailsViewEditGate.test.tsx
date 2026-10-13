/**
 * MYK9-1134: the person page offers Edit and Change Photo only when the server's
 * people_update rule (can_edit_person) would accept the save. A secretary can READ every
 * person, so without this she was handed a save that failed with "Permission denied".
 * The viewer's own record and a site admin are decided locally, without asking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';
import { registeredPageActions } from '@/test/utils/pageActions';

const hasPermission = vi.fn(() => true);
const rpc = vi.fn();

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission }) }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'current-user-id' },
    getUserRoles: () => ['secretary'],
    hasPermission,
  }),
}));

vi.mock('@/hooks/useRoleBasedData', () => ({ useRoleBasedPeople: () => ({ people: [] }) }));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
  usePermanentDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/services/database/users', () => ({ restoreUser: vi.fn() }));

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

describe('UserDetailsView — Edit follows people_update', () => {
  beforeEach(() => {
    rpc.mockReset();
    hasPermission.mockReset();
    usePageEditTargetStore.setState({ target: null, owner: null });
  });

  it('withholds Edit and Change Photo from a viewer the server says may not edit', async () => {
    hasPermission.mockReturnValue(false);
    rpc.mockResolvedValue({ data: false, error: null });
    renderView(person());

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    await waitFor(() => expect(registeredPageActions()).not.toContain('Edit person'));
    expect(rpc).toHaveBeenCalledWith('can_edit_person', { p_person_id: 'p1' });
    expect(registeredPageActions()).not.toContain('Change Photo');
    // The photo is shown, not offered.
    expect(screen.getByRole('button', { name: 'Edit profile photo' })).toBeDisabled();
  });

  it('offers Edit and Change Photo when the server says yes', async () => {
    hasPermission.mockReturnValue(false);
    rpc.mockResolvedValue({ data: true, error: null });
    renderView(person());

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(registeredPageActions()).toEqual(['Edit person', 'Change Photo']);
    expect(screen.getByRole('button', { name: 'Edit profile photo' })).toBeEnabled();
  });

  it('does not ask for a site admin', () => {
    hasPermission.mockReturnValue(true);
    renderView(person());

    expect(rpc).not.toHaveBeenCalledWith('can_edit_person', expect.anything());
    expect(registeredPageActions()).toContain('Edit person');
  });

  it("does not ask for the viewer's own record", () => {
    hasPermission.mockReturnValue(false);
    renderView(person({ id: 'current-user-id' }));

    expect(rpc).not.toHaveBeenCalledWith('can_edit_person', expect.anything());
    expect(registeredPageActions()).toContain('Edit person');
  });
});
