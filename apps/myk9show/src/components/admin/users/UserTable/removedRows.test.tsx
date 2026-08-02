/**
 * Removed rows are inert — behaviour, not just styling.
 *
 * A soft-deleted person can be neither edited nor read (`people_select` is
 * `deleted_at IS NULL`), so the row must not open the edit panel and must not
 * advertise itself as clickable. Their menu carries Restore / Delete
 * permanently instead. See docs/ia-review-admin-person-detail.md F1.
 */

import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { UserTable } from './index';

const makeUser = (overrides: Partial<AdminUser>): AdminUser =>
  ({
    id: 'u1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    roles: ['exhibitor'],
    status: 'active',
    lastSignInAt: null,
    ...overrides,
  }) as AdminUser;

const live = makeUser({ id: 'live-1', firstName: 'Grace', lastName: 'Hopper' });
const removed = makeUser({ id: 'gone-1', deletedAt: '2026-07-30T00:00:00Z' });

function renderTable() {
  const onViewUser = vi.fn();
  const onEditUser = vi.fn();
  const result = render(
    <UserTable
      users={[live, removed]}
      isLoading={false}
      selectedUsers={[]}
      onSelectUser={vi.fn()}
      onSelectAll={vi.fn()}
      onViewUser={onViewUser}
      onEditUser={onEditUser}
      currentPage={1}
      totalPages={1}
      totalFilteredUsers={2}
      onPageChange={vi.fn()}
      pageSize={25}
    />
  );
  return { ...result, onViewUser, onEditUser };
}

const rowFor = (name: string) => screen.getByText(name).closest('tr') as HTMLTableRowElement;

describe('UserTable removed rows', () => {
  it('opens the record when a removed row is clicked', async () => {
    // Was inert while /people/:id could not load a soft-deleted person. That
    // page now reads them through the admin-gated RPC (MYK9-153), so the row
    // has somewhere to go — but still never the editor.
    const { user, onViewUser, onEditUser } = renderTable();

    await user.click(rowFor('Ada Lovelace'));

    expect(onViewUser).toHaveBeenCalledWith(removed);
    expect(onEditUser).not.toHaveBeenCalled();
  });

  it('drills down to the record — not the editor — for a live row', async () => {
    const { user, onViewUser, onEditUser } = renderTable();

    await user.click(screen.getByText('Grace Hopper'));

    expect(onViewUser).toHaveBeenCalledWith(live);
    expect(onEditUser).not.toHaveBeenCalled();
  });

  it('keeps the editor on the row menu', async () => {
    const { user, onViewUser, onEditUser } = renderTable();

    await user.click(screen.getByRole('button', { name: /actions for grace hopper/i }));
    await user.click(await screen.findByRole('menuitem', { name: /edit user/i }));

    expect(onEditUser).toHaveBeenCalledWith(live);
    expect(onViewUser).not.toHaveBeenCalled();
  });

  it('advertises every row as clickable, removed included', () => {
    renderTable();

    expect(rowFor('Ada Lovelace').className).toContain('cursor-pointer');
    expect(rowFor('Grace Hopper').className).toContain('cursor-pointer');
  });

  it('marks a removed row Removed in the status column', () => {
    renderTable();

    expect(rowFor('Ada Lovelace').textContent).toMatch(/removed/i);
  });
});
