/**
 * MYK9-2209: the Admins tab adds an admin by email, removes one behind a confirm, shows the
 * server's plain refusal when the last admin is removed, and refreshes the signed-in user's own
 * permissions after either change so Payments access follows at once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { render } from '@/test/utils/testUtils';
import { ClubAdminsTab } from './ClubAdminsTab';

const mocks = vi.hoisted(() => ({
  SendError: class SendError extends Error {
    constructor(
      message: string,
      readonly status: number | undefined,
      readonly reason: string | undefined
    ) {
      super(message);
    }
  },
  getClubAdmins: vi.fn(),
  addClubAdminByEmail: vi.fn(),
  removeClubAdmin: vi.fn(),
  getClubAdminInvites: vi.fn(),
  inviteClubAdmin: vi.fn(),
  sendClubAdminInviteEmail: vi.fn(),
  cancelClubAdminInvite: vi.fn(),
  refreshPermissions: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/services/database/club-memberships', () => ({
  getClubAdmins: mocks.getClubAdmins,
  addClubAdminByEmail: mocks.addClubAdminByEmail,
  removeClubAdmin: mocks.removeClubAdmin,
  getClubAdminInvites: mocks.getClubAdminInvites,
  inviteClubAdmin: mocks.inviteClubAdmin,
  sendClubAdminInviteEmail: mocks.sendClubAdminInviteEmail,
  cancelClubAdminInvite: mocks.cancelClubAdminInvite,
  ClubAdminInviteSendError: mocks.SendError,
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    refreshPermissions: mocks.refreshPermissions,
    userWithRoles: { databaseUserId: 'p-grace' },
  }),
}));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: mocks.success, error: mocks.error },
}));

const CLUB = 'club-1';
const ada = {
  personId: 'p-ada',
  personName: 'Ada Lovelace',
  personEmail: 'ada@example.test',
};
const grace = {
  personId: 'p-grace',
  personName: 'Grace Hopper',
  personEmail: 'grace@example.test',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClubAdmins.mockResolvedValue([ada, grace]);
  mocks.getClubAdminInvites.mockResolvedValue([]);
  mocks.refreshPermissions.mockResolvedValue(undefined);
});

async function confirmAdd(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: 'Add admin' }));
}

describe('ClubAdminsTab', () => {
  it('says it is offline instead of showing an empty list', async () => {
    onlineManager.setOnline(false);
    try {
      render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);

      expect(
        await screen.findByText('You are offline. Reconnect to see who has access.')
      ).toBeInTheDocument();
      expect(mocks.getClubAdmins).not.toHaveBeenCalled();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('lists the club admins', async () => {
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(mocks.getClubAdmins).toHaveBeenCalledWith(CLUB);
  });

  it('adds an admin by email, tells an existing account it is done at once, and refreshes permissions', async () => {
    mocks.addClubAdminByEmail.mockResolvedValue('added');
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByLabelText('Add an admin'), '  new.admin@example.test ');
    await user.click(screen.getByRole('button', { name: 'Add admin' }));
    await confirmAdd(user);

    await waitFor(() =>
      expect(mocks.addClubAdminByEmail).toHaveBeenCalledWith(CLUB, 'new.admin@example.test')
    );
    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(
        'new.admin@example.test is now an admin of this club.'
      )
    );
    expect(mocks.refreshPermissions).toHaveBeenCalled();
    expect(screen.getByLabelText('Add an admin')).toHaveValue('');
  });

  it('offers to invite an address with no account, then emails the invite', async () => {
    mocks.addClubAdminByEmail.mockResolvedValue('no_account');
    mocks.inviteClubAdmin.mockResolvedValue({ outcome: 'invited', inviteId: 'inv-1' });
    mocks.sendClubAdminInviteEmail.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByLabelText('Add an admin'), 'new@example.test');
    await user.click(screen.getByRole('button', { name: 'Add admin' }));
    await confirmAdd(user);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Invite new@example.test to be an admin?')).toBeInTheDocument();
    expect(mocks.inviteClubAdmin).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Send invite' }));

    await waitFor(() =>
      expect(mocks.inviteClubAdmin).toHaveBeenCalledWith(CLUB, 'new@example.test')
    );
    await waitFor(() => expect(mocks.sendClubAdminInviteEmail).toHaveBeenCalledWith('inv-1'));
    expect(mocks.success).toHaveBeenCalledWith(
      'Invite sent to new@example.test. They become an admin once they create an account and confirm that email.'
    );
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.refreshPermissions).not.toHaveBeenCalled();
  });

  it('says the invite was saved but not emailed when the send fails', async () => {
    mocks.addClubAdminByEmail.mockResolvedValue('no_account');
    mocks.inviteClubAdmin.mockResolvedValue({ outcome: 'invited', inviteId: 'inv-1' });
    mocks.sendClubAdminInviteEmail.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByLabelText('Add an admin'), 'new@example.test');
    await user.click(screen.getByRole('button', { name: 'Add admin' }));
    await confirmAdd(user);
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Send invite' })
    );

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        "The invite for new@example.test was saved, but we couldn't email it. Use Resend to try again."
      )
    );
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it('does not invite when the admin declines the offer', async () => {
    mocks.addClubAdminByEmail.mockResolvedValue('no_account');
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByLabelText('Add an admin'), 'new@example.test');
    await user.click(screen.getByRole('button', { name: 'Add admin' }));
    await confirmAdd(user);
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Not now' })
    );

    expect(mocks.inviteClubAdmin).not.toHaveBeenCalled();
    expect(mocks.sendClubAdminInviteEmail).not.toHaveBeenCalled();
  });

  it('lists pending invites with Resend and Cancel, and calls the right invite', async () => {
    mocks.getClubAdminInvites.mockResolvedValue([
      {
        inviteId: 'inv-9',
        email: 'pending@example.test',
        invitedByName: 'Ada Lovelace',
        createdAt: '2026-11-20T00:00:00Z',
        expiresAt: '2026-12-04T12:00:00Z',
        lastSentAt: null,
        isExpired: false,
      },
    ]);
    mocks.sendClubAdminInviteEmail.mockResolvedValue(undefined);
    mocks.cancelClubAdminInvite.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);

    expect(await screen.findByText('pending@example.test')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resend invite to pending@example.test' }));
    await waitFor(() => expect(mocks.sendClubAdminInviteEmail).toHaveBeenCalledWith('inv-9'));

    await user.click(screen.getByRole('button', { name: 'Cancel invite to pending@example.test' }));
    await waitFor(() => expect(mocks.cancelClubAdminInvite).toHaveBeenCalledWith('inv-9'));
    expect(mocks.refreshPermissions).not.toHaveBeenCalled();
  });

  it.each([
    ['cap', 409, 'This invite has been sent the most times allowed. Cancel it and invite again.'],
    ['expired', 409, 'This invite has expired. Cancel it and invite again.'],
    ['throttled', 409, 'That invite was just sent. Wait a moment and try again.'],
    [undefined, 403, "You can't send this invite."],
  ])('says why a resend was refused (%s, %s)', async (reason, status, message) => {
    mocks.getClubAdminInvites.mockResolvedValue([
      {
        inviteId: 'inv-9',
        email: 'pending@example.test',
        invitedByName: null,
        createdAt: '2026-11-20T00:00:00Z',
        expiresAt: '2026-12-04T12:00:00Z',
        lastSentAt: null,
        isExpired: false,
      },
    ]);
    mocks.sendClubAdminInviteEmail.mockRejectedValue(new mocks.SendError('x', status, reason));
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);

    await user.click(
      await screen.findByRole('button', { name: 'Resend invite to pending@example.test' })
    );
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(message));
  });

  it('shows an expired invite as expired, with Resend off and Cancel on', async () => {
    mocks.getClubAdminInvites.mockResolvedValue([
      {
        inviteId: 'inv-old',
        email: 'lapsed@example.test',
        invitedByName: null,
        createdAt: '2026-10-01T00:00:00Z',
        expiresAt: '2026-10-15T12:00:00Z',
        lastSentAt: null,
        isExpired: true,
      },
    ]);
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);

    expect(await screen.findByText('lapsed@example.test')).toBeInTheDocument();
    expect(screen.getByText(/^Expired Oct 15, 2026$/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Resend invite to lapsed@example.test' })
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Cancel invite to lapsed@example.test' })
    ).toBeEnabled();
  });

  it("shows the server's invalid-email message from a PostgREST error object", async () => {
    mocks.addClubAdminByEmail.mockRejectedValue({
      message: 'Enter a valid email address.',
      code: '22023',
    });
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByLabelText('Add an admin'), 'nope@x');
    await user.click(screen.getByRole('button', { name: 'Add admin' }));
    await confirmAdd(user);

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Enter a valid email address.'));
  });

  it('asks to confirm the address and club before adding anyone', async () => {
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByLabelText('Add an admin'), 'new@example.test');
    await user.click(screen.getByRole('button', { name: 'Add admin' }));

    expect(
      await screen.findByText('Add new@example.test as an admin of Heartland Club?')
    ).toBeInTheDocument();
    expect(mocks.addClubAdminByEmail).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.addClubAdminByEmail).not.toHaveBeenCalled();
  });

  it('tells you and leaves the tab when you remove yourself', async () => {
    mocks.removeClubAdmin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Grace Hopper');
    mocks.getClubAdmins.mockClear();

    await user.click(screen.getByRole('button', { name: 'Remove admin Grace Hopper' }));
    await user.click(await screen.findByRole('button', { name: 'Remove admin' }));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(`/clubs/${CLUB}`));
    expect(mocks.success).toHaveBeenCalledWith('You are no longer an admin of this club.');
    expect(mocks.getClubAdmins).not.toHaveBeenCalled();
  });

  it('removes an admin only after the confirm, then refreshes permissions', async () => {
    mocks.removeClubAdmin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: 'Remove admin Ada Lovelace' }));
    expect(mocks.removeClubAdmin).not.toHaveBeenCalled();
    expect(await screen.findByText('Remove Ada Lovelace as an admin?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove admin' }));

    await waitFor(() => expect(mocks.removeClubAdmin).toHaveBeenCalledWith(CLUB, 'p-ada'));
    await waitFor(() => expect(mocks.refreshPermissions).toHaveBeenCalled());
    expect(mocks.success).toHaveBeenCalledWith('Admin removed.');
  });

  it('shows the plain last-admin message and does not claim success', async () => {
    mocks.removeClubAdmin.mockRejectedValue({
      message: 'A club needs at least one admin. Add another admin first.',
      code: 'P0001',
    });
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('button', { name: 'Remove admin Ada Lovelace' }));
    await user.click(await screen.findByRole('button', { name: 'Remove admin' }));

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        'A club needs at least one admin. Add another admin first.'
      )
    );
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refreshPermissions).not.toHaveBeenCalled();
  });
});
