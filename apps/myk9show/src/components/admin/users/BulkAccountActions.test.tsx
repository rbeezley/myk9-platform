import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, userEvent, waitFor } from '@/test/utils/testUtils';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';

const mutateAsync = vi.hoisted(() => vi.fn());
const invokeAdminInvite = vi.hoisted(() => vi.fn());
const restoreUser = vi.hoisted(() => vi.fn());
const hasPermission = vi.hoisted(() => vi.fn(() => true));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: () => ({ mutateAsync }),
}));
vi.mock('@/components/users/UserDetails/useSendUserInvitation', () => ({ invokeAdminInvite }));
vi.mock('@/services/database/users', () => ({ restoreUser }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'auth-me' },
    userWithRoles: { databaseUserId: 'me' },
    hasPermission,
  }),
}));

import { BulkAccountActions } from './BulkAccountActions';

function person(
  id: string,
  patch: { status?: 'active' | 'suspended'; deletedAt?: Date; lastSignInAt?: string } = {}
): SelectedUser {
  return {
    id,
    user: {
      id,
      firstName: id,
      lastName: 'Test',
      email: `${id}@example.com`,
      roles: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignInAt: null,
      ...patch,
    },
  } as SelectedUser;
}

function renderActions(selection: SelectedUser[], onClearSelection = vi.fn()) {
  render(<BulkAccountActions selectedUsers={selection} onClearSelection={onClearSelection} />);
  return onClearSelection;
}

describe('BulkAccountActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasPermission.mockReturnValue(true);
    mutateAsync.mockResolvedValue({});
    invokeAdminInvite.mockResolvedValue({ data: null });
    restoreUser.mockResolvedValue({ error: null });
  });

  it('shows only the actions that apply, with a count when they reach fewer than all', () => {
    renderActions([person('a'), person('b', { status: 'suspended' }), person('me')]);
    // "me" is the admin: left out of Suspend.
    expect(screen.getByRole('button', { name: 'Suspend 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reinstate 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /restore/i })).not.toBeInTheDocument();
  });

  it('hides Suspend and Reinstate without admin:manage', () => {
    hasPermission.mockReturnValue(false);
    renderActions([person('a'), person('b', { status: 'suspended' })]);
    expect(screen.queryByRole('button', { name: /suspend/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reinstate/i })).not.toBeInTheDocument();
  });

  it('confirms before suspending, names who is left out, then suspends only the targets', async () => {
    const onClear = renderActions([person('a'), person('b'), person('me')]);
    await userEvent.click(screen.getByRole('button', { name: 'Suspend 2' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Suspend 2 accounts?');
    expect(dialog).toHaveTextContent('Your own account is left out.');
    expect(mutateAsync).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    await waitFor(() => expect(onClear).toHaveBeenCalled());
    expect(mutateAsync.mock.calls.map(([arg]) => arg)).toEqual([
      { id: 'a', updates: { status: 'suspended' } },
      { id: 'b', updates: { status: 'suspended' } },
    ]);
  });

  it('reinstates without a confirmation', async () => {
    renderActions([person('b', { status: 'suspended' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Reinstate' }));
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ id: 'b', updates: { status: 'active' } })
    );
  });

  it('sends invitations after confirming, only to people who never signed in', async () => {
    renderActions([person('new'), person('old', { lastSignInAt: '2026-09-01T00:00:00Z' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Send invitation 1' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Send sign-in invitations to 1 person?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send invitations' }));

    await waitFor(() => expect(invokeAdminInvite).toHaveBeenCalledOnce());
    expect(invokeAdminInvite).toHaveBeenCalledWith({
      personId: 'new',
      email: 'new@example.com',
      firstName: 'new',
      roleNames: [],
    });
  });

  it('restores removed people through the shared restore path', async () => {
    renderActions([person('gone', { deletedAt: new Date() })]);
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(restoreUser).toHaveBeenCalledWith('gone'));
  });

  it('copies the selected emails from the More menu', async () => {
    renderActions([person('a'), person('b')]);
    // After render: the test render's userEvent.setup() installs its own clipboard.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    await userEvent.click(screen.getByRole('button', { name: 'More' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy emails' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('a@example.com, b@example.com'));
  });
});
