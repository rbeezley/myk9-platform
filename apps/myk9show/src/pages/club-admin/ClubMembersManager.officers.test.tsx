/**
 * MYK9-2045: the Officers section says the list is printed and grants nothing, and reads the
 * Secretary position as "Club secretary".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import { ClubMembersManager } from './ClubMembersManager';

const { addClubOfficer, notifyError } = vi.hoisted(() => ({
  addClubOfficer: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: notifyError },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    getUserRoles: () => ['club_admin'],
    hasRole: () => false,
    userWithRoles: {
      scopes: [{ scopeType: 'club', roleId: 'club_admin', scopeId: 'club-1' }],
    },
  }),
}));

vi.mock('@/store/clubStore', () => {
  const state = {
    clubs: [{ id: 'club-1', name: 'Heartland Club' }],
    clubReadiness: 'fresh',
    ensureClubsReady: vi.fn(() => Promise.resolve({ status: 'fresh', clubs: [] })),
    loadClubs: vi.fn(),
  };
  return {
    useClubStore: (selector: (value: typeof state) => unknown) => selector(state),
  };
});

vi.mock('@/store/userStore', () => ({
  useUserStore: () => ({ people: [], loadUsers: vi.fn() }),
}));

vi.mock('@/services/database/club-memberships', () => ({
  getClubMembers: vi.fn(() => Promise.resolve([])),
  countActiveClubMembers: vi.fn(() => 0),
  getClubOfficers: vi.fn(() =>
    Promise.resolve([
      {
        id: 'o-1',
        clubId: 'club-1',
        personId: null,
        position: 'secretary',
        termStart: null,
        termEnd: null,
        electedDate: null,
        personName: 'Sam Typed',
      },
    ])
  ),
  addClubMember: vi.fn(),
  updateClubMember: vi.fn(),
  removeClubMember: vi.fn(),
  addClubOfficer,
  removeClubOfficer: vi.fn(),
  getClubShowManagers: vi.fn(() => Promise.resolve([])),
  setClubShowManagerAccess: vi.fn(),
  getClubAdmins: vi.fn(() => Promise.resolve([])),
  addClubAdminByEmail: vi.fn(),
  removeClubAdmin: vi.fn(),
}));

vi.mock('@/services/database/club-memberships/committee', () => ({
  getCommittee: vi.fn(() => Promise.resolve([])),
  addCommitteeMember: vi.fn(),
  removeCommitteeMember: vi.fn(),
  moveCommitteeMember: vi.fn(),
}));

vi.mock('@/services/database/clubs', () => ({
  countUpcomingClubShows: vi.fn(() => Promise.resolve(0)),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    ensureUserHasRole: vi.fn(),
    revokeRole: vi.fn(),
    clearAllCache: vi.fn(),
    clearUserCache: vi.fn(),
  },
}));

describe('ClubMembersManager Officers section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says what the list is for and that it grants nothing, and names a typed officer', async () => {
    const user = userEvent.setup();
    render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />);

    await user.click(await screen.findByRole('tab', { name: /officers/i }));

    expect(
      await screen.findByText(
        "Printed in your premium list. Doesn't change what anyone can do in myK9Show."
      )
    ).toBeInTheDocument();
    expect(await screen.findByText('Sam Typed')).toBeInTheDocument();
    expect(screen.getByText('Club secretary')).toBeInTheDocument();
  });

  it('shows the Event Committee under the Officers list on the same tab (MYK9-2064)', async () => {
    const user = userEvent.setup();
    render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />);

    await user.click(await screen.findByRole('tab', { name: /officers/i }));

    expect(await screen.findByRole('heading', { name: 'Event Committee' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add committee member' })).toBeInTheDocument();
  });

  it('saves a typed name with no account and the chosen position', async () => {
    const user = userEvent.setup();
    addClubOfficer.mockResolvedValue({});
    render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />);

    await user.click(await screen.findByRole('tab', { name: /officers/i }));
    await user.click(await screen.findByRole('button', { name: 'Assign Officer' }));
    await user.type(screen.getByLabelText('Not on myK9Show? Type their name'), '  Pat Typed ');
    await user.selectOptions(screen.getByLabelText('Position'), 'treasurer');
    await user.click(screen.getAllByRole('button', { name: 'Assign Officer' }).at(-1)!);

    expect(addClubOfficer).toHaveBeenCalledWith({
      clubId: 'club-1',
      displayName: 'Pat Typed',
      position: 'treasurer',
    });
  });

  it('says a duplicate typed name already holds the position, in plain words', async () => {
    const user = userEvent.setup();
    addClubOfficer.mockRejectedValue({ code: '23505', message: 'duplicate key value' });
    render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />);

    await user.click(await screen.findByRole('tab', { name: /officers/i }));
    await user.click(await screen.findByRole('button', { name: 'Assign Officer' }));
    await user.type(screen.getByLabelText('Not on myK9Show? Type their name'), 'Sam Typed');
    await user.selectOptions(screen.getByLabelText('Position'), 'secretary');
    await user.click(screen.getAllByRole('button', { name: 'Assign Officer' }).at(-1)!);

    await vi.waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        'That person already holds this position, or we could not save the change.'
      )
    );
  });
});
