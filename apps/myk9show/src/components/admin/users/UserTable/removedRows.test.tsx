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

function renderTable(onUserClick = vi.fn()) {
  const result = render(
    <UserTable
      users={[live, removed]}
      isLoading={false}
      selectedUsers={[]}
      onSelectUser={vi.fn()}
      onSelectAll={vi.fn()}
      onUserClick={onUserClick}
      currentPage={1}
      totalPages={1}
      totalFilteredUsers={2}
      onPageChange={vi.fn()}
      pageSize={25}
    />
  );
  return { ...result, onUserClick };
}

const rowFor = (name: string) => screen.getByText(name).closest('tr') as HTMLTableRowElement;

describe('UserTable removed rows', () => {
  it('does not open the edit panel when a removed row is clicked', async () => {
    const { user, onUserClick } = renderTable();

    await user.click(rowFor('Ada Lovelace'));

    expect(onUserClick).not.toHaveBeenCalled();
  });

  it('still opens the edit panel for a live row', async () => {
    const { user, onUserClick } = renderTable();

    await user.click(screen.getByText('Grace Hopper'));

    expect(onUserClick).toHaveBeenCalledWith(live);
  });

  it('does not advertise a removed row as clickable', () => {
    renderTable();

    expect(rowFor('Ada Lovelace').className).toContain('cursor-default');
    expect(rowFor('Ada Lovelace').className).not.toContain('cursor-pointer');
    expect(rowFor('Grace Hopper').className).toContain('cursor-pointer');
  });

  it('marks a removed row Removed in the status column', () => {
    renderTable();

    expect(rowFor('Ada Lovelace').textContent).toMatch(/removed/i);
  });
});
