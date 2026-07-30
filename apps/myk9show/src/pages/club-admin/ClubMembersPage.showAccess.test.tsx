import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import ClubMembersPage from './ClubMembersPage';

const { setClubShowManagerAccess, notificationSuccess, notificationError } = vi.hoisted(() => ({
  setClubShowManagerAccess: vi.fn(),
  notificationSuccess: vi.fn(),
  notificationError: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    getUserRoles: () => ['club_admin'],
    userWithRoles: {
      scopes: [{ scopeType: 'club', roleId: 'club_admin', scopeId: 'club-1' }],
    },
  }),
}));

vi.mock('@/store/clubStore', () => {
  const state = {
    clubs: [{ id: 'club-1', name: 'Heartland Club' }],
    clubReadiness: 'fresh',
    ensureClubsReady: vi.fn(() => Promise.resolve({ status: 'fresh', clubs: state.clubs })),
  };
  return {
    useClubStore: (selector: (value: typeof state) => unknown) => selector(state),
  };
});

vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({
    people: [],
    loadUsers: vi.fn(),
  }),
}));

vi.mock('@/services/database/club-memberships', () => ({
  getClubMembers: vi.fn().mockResolvedValue([
    {
      id: 'member-1',
      clubId: 'club-1',
      personId: 'person-1',
      personName: 'Ada Lovelace',
      personEmail: 'ada@example.com',
      membershipType: 'full',
      membershipStatus: 'active',
      joinedDate: '2026-01-01',
    },
  ]),
  getClubOfficers: vi.fn().mockResolvedValue([]),
  getClubShowManagerIds: vi.fn().mockResolvedValue(new Set()),
  addClubMember: vi.fn(),
  updateClubMember: vi.fn(),
  removeClubMember: vi.fn(),
  addClubOfficer: vi.fn(),
  removeClubOfficer: vi.fn(),
  setClubShowManagerAccess,
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: notificationSuccess,
    error: notificationError,
  },
}));

describe('ClubMembersPage show access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the club-scoped access service and confirms the grant', async () => {
    setClubShowManagerAccess.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Ada Lovelace' }));
    await user.click(screen.getByRole('button', { name: 'Grant Show Access' }));

    await waitFor(() => {
      expect(setClubShowManagerAccess).toHaveBeenCalledWith({
        clubId: 'club-1',
        personId: 'person-1',
        grant: true,
      });
    });
    expect(notificationSuccess).toHaveBeenCalledWith('Show access granted to Ada Lovelace.');
  });

  it('shows an actionable error when the access change is rejected', async () => {
    setClubShowManagerAccess.mockRejectedValue(new Error('forbidden'));
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Ada Lovelace' }));
    await user.click(screen.getByRole('button', { name: 'Grant Show Access' }));

    await waitFor(() => {
      expect(notificationError).toHaveBeenCalledWith(
        "We couldn't grant show access. Check your club access and try again."
      );
    });
  });
});
