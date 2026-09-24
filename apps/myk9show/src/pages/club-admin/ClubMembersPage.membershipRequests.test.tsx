/**
 * MYK9-685 — a club admin reviews membership requests on the same Members tab
 * that holds the roster; approving adds the person to the list, and the
 * requester's decision email (MYK9-681) goes out only after the decision saved.
 */
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
  listClubMembershipRequests,
  approveClubMembershipRequest,
  denyClubMembershipRequest,
  notifyAccessRequestEmail,
} = vi.hoisted(() => ({
  listClubMembershipRequests: vi.fn(),
  approveClubMembershipRequest: vi.fn(),
  denyClubMembershipRequest: vi.fn(),
  notifyAccessRequestEmail: vi.fn(async () => undefined),
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

vi.mock('@/services/database/club-membership-requests', () => ({
  listClubMembershipRequests,
  approveClubMembershipRequest,
  denyClubMembershipRequest,
}));

vi.mock('@/services/database/role-requests', () => ({
  listClubRoleRequests: vi.fn().mockResolvedValue([]),
  approveClubRoleRequest: vi.fn(),
  denyClubRoleRequest: vi.fn(),
}));

vi.mock('@/services/notifications/accessRequestEmail', () => ({ notifyAccessRequestEmail }));

vi.mock('@/services/database/clubs', () => ({
  countUpcomingClubShows,
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: notificationSuccess,
    error: notificationError,
  },
}));

const pendingRequest = {
  id: 'membership-request-1',
  clubId: 'club-1',
  personId: 'person-9',
  requesterName: 'Rita Requester',
  requesterEmail: 'rita@example.com',
  requesterNote: 'I have shown with the club for two years.',
  createdAt: '2026-09-20T12:00:00Z',
};

describe('ClubMembersPage membership requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClubShowManagers.mockResolvedValue([]);
    countUpcomingClubShows.mockResolvedValue(0);
    listClubMembershipRequests.mockResolvedValue([pendingRequest]);
    approveClubMembershipRequest.mockResolvedValue(undefined);
    denyClubMembershipRequest.mockResolvedValue(undefined);
  });

  it('lists a pending membership request on the Members tab with its reason and a badge', async () => {
    render(<ClubMembersPage />);

    expect(await screen.findByText('Membership requests')).toBeInTheDocument();
    expect(screen.getByText('Rita Requester')).toBeInTheDocument();
    expect(screen.getByText(/shown with the club for two years/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Members.*1/ })).toBeInTheDocument();
    expect(listClubMembershipRequests).toHaveBeenCalledWith('club-1');
  });

  it('approves a membership request and then emails the requester', async () => {
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await screen.findByText('Rita Requester');
    await user.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() =>
      expect(approveClubMembershipRequest).toHaveBeenCalledWith('membership-request-1')
    );
    await waitFor(() =>
      expect(notifyAccessRequestEmail).toHaveBeenCalledWith(
        'membership',
        'membership-request-1',
        'decision'
      )
    );
    expect(notificationSuccess).toHaveBeenCalledWith(
      'Request approved. They are now on the member list.'
    );
  });

  it('denies with the note the admin typed', async () => {
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await screen.findByText('Rita Requester');
    await user.click(screen.getByRole('button', { name: /^deny$/i }));
    await user.type(await screen.findByLabelText(/reason/i), 'Members must live in the county.');
    await user.click(screen.getByRole('button', { name: 'Deny request' }));

    await waitFor(() =>
      expect(denyClubMembershipRequest).toHaveBeenCalledWith(
        'membership-request-1',
        'Members must live in the county.'
      )
    );
    await waitFor(() =>
      expect(notifyAccessRequestEmail).toHaveBeenCalledWith(
        'membership',
        'membership-request-1',
        'decision'
      )
    );
  });

  it('sends no email when the approval is rejected', async () => {
    approveClubMembershipRequest.mockRejectedValue(new Error('forbidden'));
    const user = userEvent.setup();
    render(<ClubMembersPage />);

    await screen.findByText('Rita Requester');
    await user.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(notificationError).toHaveBeenCalled());
    expect(notifyAccessRequestEmail).not.toHaveBeenCalled();
  });
});
