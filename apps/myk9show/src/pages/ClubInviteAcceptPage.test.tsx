/**
 * MYK9-2211: the emailed /club-invite/<token> page calls accept_club_admin_invite once with the
 * link's token and says what happened: accepted, already accepted, expired, wrong account,
 * unusable, or a retryable failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import ClubInviteAcceptPage from './ClubInviteAcceptPage';

const mocks = vi.hoisted(() => ({
  acceptClubAdminInvite: vi.fn(),
  refreshPermissions: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/services/database/club-memberships', () => ({
  acceptClubAdminInvite: mocks.acceptClubAdminInvite,
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    refreshPermissions: mocks.refreshPermissions,
    signOut: mocks.signOut,
  }),
}));

function renderPage() {
  return render(
    <Routes>
      <Route path="/club-invite/:token" element={<ClubInviteAcceptPage />} />
    </Routes>,
    { initialRoute: '/club-invite/tok-abc' }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refreshPermissions.mockResolvedValue(undefined);
});

describe('ClubInviteAcceptPage', () => {
  it('accepts once with the link token, refreshes permissions and links to the club', async () => {
    mocks.acceptClubAdminInvite.mockResolvedValue({
      outcome: 'accepted',
      clubId: 'club-1',
      clubName: 'Heartland Club',
    });
    renderPage();

    expect(await screen.findByText('You are now a club admin')).toBeInTheDocument();
    expect(mocks.acceptClubAdminInvite).toHaveBeenCalledTimes(1);
    expect(mocks.acceptClubAdminInvite).toHaveBeenCalledWith('tok-abc');
    expect(mocks.refreshPermissions).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Manage the club' })).toHaveAttribute(
      'href',
      '/clubs/club-1'
    );
  });

  it('says an already accepted invite is done, without refreshing permissions', async () => {
    mocks.acceptClubAdminInvite.mockResolvedValue({
      outcome: 'already_accepted',
      clubId: 'club-1',
      clubName: 'Heartland Club',
    });
    renderPage();

    expect(await screen.findByText('You are already an admin')).toBeInTheDocument();
    expect(mocks.refreshPermissions).not.toHaveBeenCalled();
  });

  it('says an expired invite is expired', async () => {
    mocks.acceptClubAdminInvite.mockResolvedValue({
      outcome: 'expired',
      clubId: 'club-1',
      clubName: 'Heartland Club',
    });
    renderPage();

    expect(await screen.findByText('This invitation has expired')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage the club' })).not.toBeInTheDocument();
  });

  it('tells a wrong account to sign out', async () => {
    mocks.acceptClubAdminInvite.mockResolvedValue({
      outcome: 'wrong_account',
      clubId: null,
      clubName: null,
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Wrong account')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.refreshPermissions).not.toHaveBeenCalled();
  });

  it('says an unusable invitation is unusable', async () => {
    mocks.acceptClubAdminInvite.mockResolvedValue({
      outcome: 'invalid',
      clubId: null,
      clubName: null,
    });
    renderPage();

    expect(await screen.findByText("This invitation can't be used")).toBeInTheDocument();
  });

  it('offers a retry when the call fails, and accepts on the second try', async () => {
    mocks.acceptClubAdminInvite.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({
      outcome: 'accepted',
      clubId: 'club-1',
      clubName: 'Heartland Club',
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("We couldn't check your invitation")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('You are now a club admin')).toBeInTheDocument();
    await waitFor(() => expect(mocks.acceptClubAdminInvite).toHaveBeenCalledTimes(2));
  });
});
