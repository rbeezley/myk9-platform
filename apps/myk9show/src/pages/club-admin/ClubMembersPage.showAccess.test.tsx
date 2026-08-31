import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import ClubMembersPage from './ClubMembersPage';

const {
  getClubShowManagers,
  setClubShowManagerAccess,
  countUpcomingClubShows,
  notificationSuccess,
  notificationError,
} = vi.hoisted(() => ({
  getClubShowManagers: vi.fn(),
  countUpcomingClubShows: vi.fn(),
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
  countActiveClubMembers: vi.fn(() => 1),
  getClubOfficers: vi.fn().mockResolvedValue([]),
  getClubShowManagers,
  addClubMember: vi.fn(),
  updateClubMember: vi.fn(),
  removeClubMember: vi.fn(),
  addClubOfficer: vi.fn(),
  removeClubOfficer: vi.fn(),
  setClubShowManagerAccess,
}));

vi.mock('@/services/database/clubs', () => ({
  countUpcomingClubShows,
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
    getClubShowManagers.mockResolvedValue([]);
    countUpcomingClubShows.mockResolvedValue(0);
  });

  it('uses the club-scoped access service and confirms the grant', async () => {
    setClubShowManagerAccess.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Ada Lovelace' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Grant Show Access' }));

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
    await user.click(await screen.findByRole('menuitem', { name: 'Grant Show Access' }));

    await waitFor(() => {
      expect(notificationError).toHaveBeenCalledWith(
        "We couldn't grant show access. Check your club access and try again."
      );
    });
  });

  it('revokes through the club-scoped access service and confirms the change', async () => {
    getClubShowManagers.mockResolvedValue([
      {
        personId: 'person-1',
        personName: 'Ada Lovelace',
        personEmail: 'ada@example.com',
        isClubMember: true,
        membershipStatus: 'active',
      },
    ]);
    setClubShowManagerAccess.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Ada Lovelace' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke Show Access' }));

    await waitFor(() => {
      expect(setClubShowManagerAccess).toHaveBeenCalledWith({
        clubId: 'club-1',
        personId: 'person-1',
        grant: false,
      });
    });
    expect(notificationSuccess).toHaveBeenCalledWith('Show access revoked from Ada Lovelace.');
  });

  it('shows an actionable error when revoke is rejected', async () => {
    getClubShowManagers.mockResolvedValue([
      {
        personId: 'person-1',
        personName: 'Ada Lovelace',
        personEmail: 'ada@example.com',
        isClubMember: true,
        membershipStatus: 'active',
      },
    ]);
    setClubShowManagerAccess.mockRejectedValue(new Error('forbidden'));
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Ada Lovelace' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke Show Access' }));

    await waitFor(() => {
      expect(notificationError).toHaveBeenCalledWith(
        "We couldn't revoke show access. Check your club access and try again."
      );
    });
  });
});

describe('ClubMembersPage Show Access tab wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countUpcomingClubShows.mockResolvedValue(0);
    setClubShowManagerAccess.mockResolvedValue(undefined);
  });

  it('reaches an appointee who has no membership row', async () => {
    // The wiring assertion. ClubShowAccessTab is correct in isolation and worth
    // nothing if the page never mounts it — this drives the real page to the real tab
    // and finds a person the members roster structurally cannot render.
    getClubShowManagers.mockResolvedValue([
      {
        personId: 'person-hired',
        personName: 'Grace Hopper',
        personEmail: 'grace@example.com',
        isClubMember: false,
        membershipStatus: null,
      },
    ]);
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await user.click(await screen.findByRole('tab', { name: /show access/i }));

    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByText('Not a club member')).toBeInTheDocument();
  });

  it('revokes a non-member appointee from the tab', async () => {
    // Before this tab existed there was no control anywhere that could do this.
    getClubShowManagers.mockResolvedValue([
      {
        personId: 'person-hired',
        personName: 'Grace Hopper',
        personEmail: 'grace@example.com',
        isClubMember: false,
        membershipStatus: null,
      },
    ]);
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await user.click(await screen.findByRole('tab', { name: /show access/i }));
    await user.click(await screen.findByRole('button', { name: /revoke/i }));

    await waitFor(() => {
      expect(setClubShowManagerAccess).toHaveBeenCalledWith({
        clubId: 'club-1',
        personId: 'person-hired',
        grant: false,
      });
    });
  });

  it('appoints someone who is not a club member', async () => {
    getClubShowManagers.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await user.click(await screen.findByRole('tab', { name: /show access/i }));
    await user.click(await screen.findByRole('button', { name: /appoint secretary/i }));

    // people comes from the mocked userStore, which is empty, so the dialog opening
    // with its membership-free copy is what this can prove at the page level. The
    // selection path itself is covered in ClubShowAccessTab.test.tsx.
    expect(await screen.findByText(/Club membership is not required/i)).toBeInTheDocument();
  });
});

describe('ClubMembersPage show-access confirmations name the person', () => {
  // The toast resolved names from `members`, which cannot contain a non-member
  // appointee — the people this feature exists for. It fell back to "the member",
  // which is anonymous AND the one thing they are not. (Codex, PR #1895.)
  beforeEach(() => {
    vi.clearAllMocks();
    countUpcomingClubShows.mockResolvedValue(0);
    setClubShowManagerAccess.mockResolvedValue(undefined);
  });

  it('names a non-member when revoking from the tab', async () => {
    getClubShowManagers.mockResolvedValue([
      {
        personId: 'person-hired',
        personName: 'Grace Hopper',
        personEmail: 'grace@example.com',
        isClubMember: false,
        membershipStatus: null,
      },
    ]);
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await user.click(await screen.findByRole('tab', { name: /show access/i }));
    await user.click(await screen.findByRole('button', { name: /revoke/i }));

    await waitFor(() => {
      expect(notificationSuccess).toHaveBeenCalledWith('Show access revoked from Grace Hopper.');
    });
    expect(notificationSuccess).not.toHaveBeenCalledWith(
      expect.stringContaining('the member')
    );
  });

  it('still names a member revoked from the roster menu', async () => {
    // The roster path must keep working — the fix adds a source, it does not replace one.
    getClubShowManagers.mockResolvedValue([
      {
        personId: 'person-1',
        personName: 'Ada Lovelace',
        personEmail: 'ada@example.com',
        isClubMember: true,
        membershipStatus: 'active',
      },
    ]);
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await user.click(await screen.findByRole('button', { name: 'Actions for Ada Lovelace' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke Show Access' }));

    await waitFor(() => {
      expect(notificationSuccess).toHaveBeenCalledWith('Show access revoked from Ada Lovelace.');
    });
  });
});
