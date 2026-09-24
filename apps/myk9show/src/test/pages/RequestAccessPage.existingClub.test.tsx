/**
 * MYK9-685 — after choosing an existing club, the page must offer both asks
 * (membership and secretary access), each with a working submit, a visible
 * pending state, and an explanation whenever there is nothing to ask for.
 * Nothing on the request path is mocked except the network services and the
 * auth context: the previous test mocked the secretary card as an always-
 * present button, which is how a card that rendered nothing went unnoticed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import RequestAccessPage from '@/pages/RequestAccessPage';
import { UserRole } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import {
  getMyClubSecretaryRequestStatus,
  submitClubSecretaryRequest,
} from '@/services/database/role-requests';
import {
  getMyClubMembershipRequestStatus,
  submitClubMembershipRequest,
} from '@/services/database/club-membership-requests';

vi.mock('@/services/database/role-requests', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/role-requests')>()),
  getMyClubSecretaryRequestStatus: vi.fn(),
  submitClubSecretaryRequest: vi.fn(),
}));

vi.mock('@/services/database/club-membership-requests', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/club-membership-requests')>()),
  getMyClubMembershipRequestStatus: vi.fn(),
  submitClubMembershipRequest: vi.fn(),
}));

vi.mock('@/services/database/club-access-requests', () => ({
  submitNewClubAccessRequest: vi.fn(),
}));

const mockAuth = vi.hoisted(() => ({ userWithRoles: null as unknown }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => mockAuth }));

const club = { id: 'club-1', name: 'Heartland Dog Club', address: { city: 'Omaha', state: 'NE' } };

vi.mock('@/hooks/useBrowseClubsData', () => ({
  useBrowseClubsData: () => ({
    filteredClubs: [club],
    filters: { search: 'Heartland', clubType: 'all' },
    setFilters: vi.fn(),
    isLoading: false,
    hasError: false,
    handleRetry: vi.fn(),
  }),
}));

function signedIn(roles: UserRole[] = [UserRole.EXHIBITOR]): UserWithRoles {
  return {
    id: 'auth-1',
    email: 'rita@example.com',
    databaseUserId: 'person-1',
    roles,
    scopes: [],
    permissions: [],
  } as unknown as UserWithRoles;
}

async function chooseClub() {
  const user = userEvent.setup();
  render(<RequestAccessPage />, { initialRoute: '/request-access' });
  await user.click(screen.getByRole('button', { name: 'Find an existing club' }));
  await user.click(screen.getByRole('button', { name: /Heartland Dog Club/ }));
  return user;
}

describe('RequestAccessPage — existing club', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.userWithRoles = signedIn();
    vi.mocked(getMyClubSecretaryRequestStatus).mockResolvedValue(null);
    vi.mocked(getMyClubMembershipRequestStatus).mockResolvedValue({
      state: 'none',
      reviewerNote: null,
    });
  });

  it('offers membership and secretary access as two separate asks', async () => {
    await chooseClub();

    expect(screen.getByRole('button', { name: 'Ask to join as a member' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask for secretary access' })).toBeInTheDocument();
    expect(
      screen.getAllByText(/does not give you permission to set up or run shows/i)
    ).not.toHaveLength(0);
  });

  it('submits a secretary request with a required reason and shows the pending state', async () => {
    vi.mocked(submitClubSecretaryRequest).mockResolvedValue('request-1');
    const user = await chooseClub();

    await user.click(screen.getByRole('button', { name: 'Ask for secretary access' }));
    const send = await screen.findByRole('button', { name: 'Send request' });

    await user.click(send);
    expect(await screen.findByRole('alert')).toHaveTextContent(/why you are asking/i);
    expect(submitClubSecretaryRequest).not.toHaveBeenCalled();

    vi.mocked(getMyClubSecretaryRequestStatus).mockResolvedValue({
      status: 'pending',
      reviewerNote: null,
    });
    await user.type(screen.getByLabelText(/why are you asking/i), 'I run entries.');
    await user.click(send);

    await waitFor(() =>
      expect(submitClubSecretaryRequest).toHaveBeenCalledWith({
        clubId: 'club-1',
        note: 'I run entries.',
      })
    );
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
    expect(screen.getByText(/review it from their Club Members page/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });

  it('submits a membership request without requiring a message', async () => {
    vi.mocked(submitClubMembershipRequest).mockResolvedValue('membership-1');
    const user = await chooseClub();

    await user.click(screen.getByRole('button', { name: 'Ask to join as a member' }));
    await user.click(await screen.findByRole('button', { name: 'Send request' }));

    await waitFor(() =>
      expect(submitClubMembershipRequest).toHaveBeenCalledWith({ clubId: 'club-1', note: '' })
    );
    expect(await screen.findByText('Request sent')).toBeInTheDocument();
  });

  it('shows an existing pending request instead of another submit button', async () => {
    vi.mocked(getMyClubMembershipRequestStatus).mockResolvedValue({
      state: 'pending',
      reviewerNote: null,
    });
    const user = await chooseClub();

    await user.click(screen.getByRole('button', { name: 'Ask to join as a member' }));

    expect(await screen.findByText('Your request is under review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });

  it('shows a denial with the club’s note and no submit button', async () => {
    vi.mocked(getMyClubSecretaryRequestStatus).mockResolvedValue({
      status: 'denied',
      reviewerNote: 'We already have a secretary this season.',
    });
    const user = await chooseClub();

    await user.click(screen.getByRole('button', { name: 'Ask for secretary access' }));

    expect(await screen.findByText(/not available for this club/i)).toBeInTheDocument();
    expect(screen.getByText(/We already have a secretary this season/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });

  it('tells a current member they already belong instead of offering the form', async () => {
    vi.mocked(getMyClubMembershipRequestStatus).mockResolvedValue({
      state: 'member',
      reviewerNote: null,
    });
    const user = await chooseClub();

    await user.click(screen.getByRole('button', { name: 'Ask to join as a member' }));

    expect(
      await screen.findByText('You are already a member of Heartland Dog Club.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });

  it('tells a suspended member to contact the club, with no form to send', async () => {
    vi.mocked(getMyClubMembershipRequestStatus).mockResolvedValue({
      state: 'suspended',
      reviewerNote: null,
    });
    const user = await chooseClub();

    await user.click(screen.getByRole('button', { name: 'Ask to join as a member' }));

    expect(
      await screen.findByText(
        'Your membership in Heartland Dog Club is suspended. Please contact the club directly.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/message to the club/i)).not.toBeInTheDocument();
  });

  it('shows a membership denial with the club’s note and no form', async () => {
    vi.mocked(getMyClubMembershipRequestStatus).mockResolvedValue({
      state: 'denied',
      reviewerNote: 'Membership is limited to county residents.',
    });
    const user = await chooseClub();

    await user.click(screen.getByRole('button', { name: 'Ask to join as a member' }));

    expect(
      await screen.findByText('The club did not approve your membership request.')
    ).toBeInTheDocument();
    expect(screen.getByText(/limited to county residents/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
  });

  it('shows a secretary approval that the auth scopes have not caught up with yet', async () => {
    vi.mocked(getMyClubSecretaryRequestStatus).mockResolvedValue({
      status: 'approved',
      reviewerNote: null,
    });
    const user = await chooseClub();

    await user.click(screen.getByRole('button', { name: 'Ask for secretary access' }));

    expect(
      await screen.findByText('Your secretary access request was approved.')
    ).toBeInTheDocument();
  });

  it('explains why there is nothing to ask for instead of rendering an empty slot', async () => {
    mockAuth.userWithRoles = signedIn([UserRole.SITE_ADMIN]);
    const user = await chooseClub();

    await user.click(screen.getByRole('button', { name: 'Ask for secretary access' }));

    expect(
      await screen.findByText(/appoint secretaries for any club from Admin/i)
    ).toBeInTheDocument();
  });

  it('keeps the form and says so when sending fails', async () => {
    vi.mocked(submitClubMembershipRequest).mockRejectedValue(new Error('network'));
    const user = await chooseClub();

    await user.click(screen.getByRole('button', { name: 'Ask to join as a member' }));
    await user.click(await screen.findByRole('button', { name: 'Send request' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't send that request/i);
    expect(screen.getByRole('button', { name: 'Send request' })).toBeEnabled();
  });
});
