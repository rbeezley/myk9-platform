import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { User } from '@/types/user-types';
import { RowActions } from './RowActions';
import { buildUserRowActions } from './buildUserRowActions';

const liveUser = {
  id: 'u1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  roles: ['exhibitor'],
} as unknown as User;

const removedUser = { ...liveUser, deletedAt: '2026-07-30T00:00:00Z' } as User;

const handlers = () => ({
  onView: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onRestore: vi.fn(),
  onManageRoles: vi.fn(),
});

const ids = (user: User, h = handlers()) => buildUserRowActions(user, h).map(action => action.id);

describe('buildUserRowActions', () => {
  it('offers the full edit set for a live user', () => {
    expect(ids(liveUser)).toEqual(['view', 'edit', 'roles', 'delete']);
  });

  it('offers profile, restore and permanent delete for a removed user', () => {
    expect(ids(removedUser)).toEqual(['view', 'restore', 'delete']);
  });

  it('never offers edit or role management on a removed user', () => {
    // Editing a removed person is not a real operation — the row exists only so
    // the admin can restore it or clear it out.
    expect(ids(removedUser)).not.toContain('edit');
    expect(ids(removedUser)).not.toContain('roles');
  });

  it('links a removed user to their profile page', () => {
    // This assertion is the reverse of what it was: while /people/:id could not
    // load a soft-deleted person the link was a dead end and was omitted. The
    // page now falls through to the admin-gated removed-person read
    // (MYK9-153), so an admin can read the record before deciding.
    expect(ids(removedUser)).toContain('view');
  });

  it('names permanent deletion on a removed row, not plain "Delete user"', () => {
    const deleteAction = buildUserRowActions(removedUser, handlers()).find(a => a.id === 'delete');
    expect(deleteAction?.label).toMatch(/permanently/i);
  });

  it('omits role management when no handler is supplied', () => {
    const h = handlers();
    const actions = buildUserRowActions(liveUser, { ...h, onManageRoles: undefined });
    expect(actions.map(a => a.id)).toEqual(['view', 'edit', 'delete']);
  });

  it('routes each action to its handler with the row user', () => {
    const h = handlers();
    for (const action of buildUserRowActions(removedUser, h)) action.onSelect();

    expect(h.onView).toHaveBeenCalledWith(removedUser);
    expect(h.onRestore).toHaveBeenCalledWith(removedUser);
    expect(h.onDelete).toHaveBeenCalledWith(removedUser);
    // Editing a removed person is still not a real operation.
    expect(h.onEdit).not.toHaveBeenCalled();
  });
});

describe('RowActions', () => {
  it('renders the removed-row menu', async () => {
    const h = handlers();
    const { user } = render(<RowActions user={removedUser} {...h} />);

    await user.click(screen.getByRole('button', { name: /actions for ada lovelace/i }));
    await screen.findByRole('menu');

    expect(screen.getByRole('menuitem', { name: /restore/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^edit user$/i })).not.toBeInTheDocument();
  });

  it('calls onRestore when Restore is chosen', async () => {
    const h = handlers();
    const { user } = render(<RowActions user={removedUser} {...h} />);

    await user.click(screen.getByRole('button', { name: /actions for ada lovelace/i }));
    await user.click(await screen.findByRole('menuitem', { name: /restore/i }));

    expect(h.onRestore).toHaveBeenCalledWith(removedUser);
  });
});
