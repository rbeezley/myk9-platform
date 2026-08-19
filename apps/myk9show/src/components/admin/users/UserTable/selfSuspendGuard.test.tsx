/**
 * The self-suspend guard must fire on the signed-in admin's OWN row.
 *
 * Roster rows are people rows (`user.id` = people.id) and get_admin_user_list
 * returns no auth_user_id, so comparing against the auth uuid alone never
 * matched anything — "Suspend account" shipped enabled on the admin's own row.
 * The guard now receives the caller's PEOPLE id (databaseUserId).
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { UserTable } from './index';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: {
      id: 'auth-uuid-self',
      databaseUserId: 'person-self',
      roles: ['site_admin'],
      permissions: [],
      scopes: [],
    },
    hasPermission: () => true,
  }),
}));

const makeUser = (overrides: Partial<AdminUser>): AdminUser =>
  ({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    roles: ['exhibitor'],
    status: 'active',
    lastSignInAt: null,
    ...overrides,
  }) as AdminUser;

const self = makeUser({ id: 'person-self', firstName: 'Sam', lastName: 'Admin' });
const other = makeUser({ id: 'person-other', firstName: 'Grace', lastName: 'Hopper' });

function renderTable() {
  return render(
    <UserTable
      users={[self, other]}
      isLoading={false}
      selectedUsers={[]}
      onSelectUser={vi.fn()}
      onSelectAll={vi.fn()}
      onViewUser={vi.fn()}
      onEditUser={vi.fn()}
      currentPage={1}
      totalPages={1}
      totalFilteredUsers={2}
      onPageChange={vi.fn()}
      pageSize={25}
    />
  );
}

describe('UserTable self-suspend guard', () => {
  it('disables Suspend on the signed-in admin’s own row, with the reason', async () => {
    const { user } = renderTable();

    await user.click(screen.getByRole('button', { name: /actions for sam admin/i }));
    const item = await screen.findByRole('menuitem', { name: /suspend account/i });

    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/you cannot suspend your own account/i)).toBeInTheDocument();
  });

  it('leaves Suspend enabled on everyone else’s rows', async () => {
    const { user } = renderTable();

    await user.click(screen.getByRole('button', { name: /actions for grace hopper/i }));
    const item = await screen.findByRole('menuitem', { name: /suspend account/i });

    expect(item).not.toHaveAttribute('aria-disabled', 'true');
  });
});
