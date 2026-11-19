/**
 * MYK9-2209: the Admins tab adds an admin by email, removes one behind a confirm, shows the
 * server's plain refusal when the last admin is removed, and refreshes the signed-in user's own
 * permissions after either change so Payments access follows at once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClubAdminsTab } from './ClubAdminsTab';

const mocks = vi.hoisted(() => ({
  getClubAdmins: vi.fn(),
  addClubAdminByEmail: vi.fn(),
  removeClubAdmin: vi.fn(),
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
  hasAccount: true,
};
const grace = {
  personId: 'p-grace',
  personName: 'Grace Hopper',
  personEmail: 'grace@example.test',
  hasAccount: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClubAdmins.mockResolvedValue([ada, grace]);
  mocks.refreshPermissions.mockResolvedValue(undefined);
});

async function confirmAdd(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole('alertdialog');
  await user.click(within(dialog).getByRole('button', { name: 'Add admin' }));
}

describe('ClubAdminsTab', () => {
  it('lists the club admins', async () => {
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(mocks.getClubAdmins).toHaveBeenCalledWith(CLUB);
  });

  it('adds an admin by email, tells an existing account it is done at once, and refreshes permissions', async () => {
    mocks.addClubAdminByEmail.mockResolvedValue({
      personId: 'p-new',
      hasAccount: true,
      invited: false,
    });
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

  it('says an invitation was sent when the address had no account', async () => {
    mocks.addClubAdminByEmail.mockResolvedValue({
      personId: 'p-new',
      hasAccount: false,
      invited: true,
    });
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByLabelText('Add an admin'), 'new@example.test');
    await user.click(screen.getByRole('button', { name: 'Add admin' }));
    await confirmAdd(user);

    await waitFor(() =>
      expect(mocks.success).toHaveBeenCalledWith(
        'new@example.test is added as an admin. We sent them an invitation to finish signing up.'
      )
    );
  });

  it('says plainly when the role was granted but the invitation could not be sent', async () => {
    mocks.addClubAdminByEmail.mockResolvedValue({
      personId: 'p-new',
      hasAccount: false,
      invited: false,
    });
    const user = userEvent.setup();
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByLabelText('Add an admin'), 'new@example.test');
    await user.click(screen.getByRole('button', { name: 'Add admin' }));
    await confirmAdd(user);

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        'new@example.test is added as an admin, but we could not send the invitation. Add them again to retry.'
      )
    );
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

  it('shows when an unclaimed invitation expires', async () => {
    mocks.getClubAdmins.mockResolvedValue([
      { ...ada, hasAccount: false, expiresAt: '2030-01-15T12:00:00Z' },
    ]);
    render(<ClubAdminsTab clubId={CLUB} clubName="Heartland Club" />);

    expect(await screen.findByText(/^Invited, expires /)).toBeInTheDocument();
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
    mocks.removeClubAdmin.mockRejectedValue(
      new Error('A club needs at least one admin. Add another admin first.')
    );
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
