import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ClubsWaitingSection } from '../ClubsWaitingSection';
import { notifications } from '@/lib/notifications';

const mocks = vi.hoisted(() => ({
  clubs: vi.fn(),
  directory: vi.fn(),
  requests: vi.fn(),
  review: vi.fn(),
  authorize: vi.fn(),
  ensureClubsReady: vi.fn(),
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: (
    selector: (state: { ensureClubsReady: typeof mocks.ensureClubsReady }) => unknown
  ) => selector({ ensureClubsReady: mocks.ensureClubsReady }),
}));
vi.mock('@/hooks/queries/useClubsDatabase', () => ({
  useClubsAwaitingAuthorizationQuery: () => mocks.clubs(),
  useClubsQuery: () => mocks.directory(),
  clubQueryKeys: {
    lists: () => ['clubs', 'list'],
    awaitingAuthorization: () => ['clubs', 'list', 'awaiting-authorization'],
  },
}));
vi.mock('@/hooks/queries/useClubRegistryNumbers', () => ({
  useClubRegistryNumbers: () => ({ data: { AKC: '777' }, isError: false, isPending: false }),
}));
vi.mock('@/services/database/club-access-requests', () => ({
  getPendingClubAccessRequests: mocks.requests,
  reviewClubAccessRequest: mocks.review,
}));
vi.mock('@/services/database/clubs', () => ({ setClubAuthorization: mocks.authorize }));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

const refetch = vi.fn();
const waitingClubs = [
  { id: 'club-1', name: 'Heartland Dog Club', createdAt: '2026-09-19T12:00:00Z' },
  { id: 'club-9', name: 'Hand Made Club', createdAt: '2026-09-25T12:00:00Z' },
];
const request = {
  id: 'req-1',
  requesterPersonId: 'person-1',
  requesterName: 'Liz Beezley',
  requesterEmail: 'liz@example.com',
  requestedClubName: 'Heartland Dog Club',
  requestedClubWebsite: null,
  requestNote: 'We are setting up our first show.',
  clubNumbers: { AKC: '4521' },
  status: 'pending' as const,
  approvedClubId: null,
  createdClubId: 'club-1',
  createdAt: '2026-09-19T12:00:00Z',
  reviewNote: null,
};

describe('ClubsWaitingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clubs.mockReturnValue({
      data: waitingClubs,
      isPending: false,
      isError: false,
      isFetching: false,
      refetch,
    });
    mocks.requests.mockResolvedValue([request]);
    mocks.directory.mockReturnValue({
      data: [{ id: 'club-2', name: 'Existing Dog Club' }],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.review.mockResolvedValue('club-1');
    mocks.authorize.mockResolvedValue(undefined);
    mocks.ensureClubsReady.mockResolvedValue({ status: 'fresh', clubs: [] });
    refetch.mockResolvedValue({});
  });

  it('shows a club with a pending request once, with who asked, the note and its number', async () => {
    render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('We are setting up our first show.')).toBeInTheDocument();
    expect(screen.getAllByText('Heartland Dog Club')).toHaveLength(1);
    expect(screen.getByText(/Liz Beezley · liz@example.com/)).toBeInTheDocument();
    expect(screen.getByText('Club numbers: AKC #4521')).toBeInTheDocument();
  });

  it('still lists a waiting club that has no request, and offers no Decline for it', async () => {
    render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('Hand Made Club')).toBeInTheDocument();
    expect(screen.getByText('Club numbers: AKC #777')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve Hand Made Club' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Decline Hand Made Club' })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Approve / })).toHaveLength(2);
  });

  it('approves a club with a request through the one review path', async () => {
    const { user } = render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });
    await user.click(await screen.findByRole('button', { name: 'Approve Heartland Dog Club' }));

    await waitFor(() =>
      expect(mocks.review).toHaveBeenCalledWith({
        requestId: 'req-1',
        decision: 'approved',
        existingClubId: null,
        clubName: null,
        reviewNote: null,
      })
    );
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(notifications.success).toHaveBeenCalledWith('Club approved');
    await waitFor(() => expect(mocks.ensureClubsReady).toHaveBeenCalled());
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('approves a club with no request by authorizing it', async () => {
    const { user } = render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });
    await user.click(await screen.findByRole('button', { name: 'Approve Hand Made Club' }));

    await waitFor(() => expect(mocks.authorize).toHaveBeenCalledWith('club-9', true));
    expect(mocks.review).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.ensureClubsReady).toHaveBeenCalled());
    expect(notifications.error).not.toHaveBeenCalled();
  });

  it('sends the optional review note with an approval', async () => {
    const { user } = render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });
    await user.type(await screen.findByLabelText('Review note'), 'Welcome aboard');
    await user.click(screen.getByRole('button', { name: 'Approve Heartland Dog Club' }));

    await waitFor(() =>
      expect(mocks.review).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'approved', reviewNote: 'Welcome aboard' })
      )
    );
  });

  it('lets a legacy request with no club pick an existing club', async () => {
    mocks.clubs.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      isFetching: false,
      refetch,
    });
    mocks.requests.mockResolvedValue([{ ...request, createdClubId: null }]);
    const { user } = render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });
    await user.selectOptions(
      await screen.findByLabelText('Club to use for Heartland Dog Club'),
      'club-2'
    );
    await user.click(screen.getByRole('button', { name: 'Approve Heartland Dog Club' }));

    await waitFor(() =>
      expect(mocks.review).toHaveBeenCalledWith({
        requestId: 'req-1',
        decision: 'approved',
        existingClubId: 'club-2',
        clubName: null,
        reviewNote: null,
      })
    );
  });

  it('does not fetch the club directory for an ordinary request', async () => {
    render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });
    await screen.findByText('Hand Made Club');
    expect(mocks.directory).not.toHaveBeenCalled();
  });

  it('holds Approve on a legacy request until the club directory loads, and offers a retry on failure', async () => {
    mocks.clubs.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      isFetching: false,
      refetch,
    });
    mocks.requests.mockResolvedValue([{ ...request, createdClubId: null }]);
    const retry = vi.fn();
    mocks.directory.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: retry,
    });
    const view = render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });
    expect(
      await screen.findByRole('button', { name: 'Approve Heartland Dog Club' })
    ).toBeDisabled();

    mocks.directory.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: retry,
    });
    view.rerender(<ClubsWaitingSection />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load the club list/);
    expect(screen.getByRole('button', { name: 'Approve Heartland Dog Club' })).toBeDisabled();
    await view.user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('does not claim how a club without a pending request was created', async () => {
    render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText(/No access request is pending/)).toBeInTheDocument();
    expect(screen.queryByText(/without an access request/)).not.toBeInTheDocument();
  });

  it('declines a request as before, with no club change', async () => {
    const { user } = render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });
    await user.click(await screen.findByRole('button', { name: 'Decline Heartland Dog Club' }));

    await waitFor(() =>
      expect(mocks.review).toHaveBeenCalledWith({
        requestId: 'req-1',
        decision: 'denied',
        reviewNote: null,
      })
    );
  });

  it('says nothing was approved when the password step is cancelled, never the raw code', async () => {
    mocks.authorize.mockRejectedValue({ code: 'MKAUT', message: 'recent sign-in required' });
    const { user } = render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });
    await user.click(await screen.findByRole('button', { name: 'Approve Hand Made Club' }));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        'Nothing was approved. Confirm your password to continue.'
      )
    );
  });

  it('says no clubs are waiting when both reads are empty', async () => {
    mocks.clubs.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      isFetching: false,
      refetch,
    });
    mocks.requests.mockResolvedValue([]);
    render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('No clubs are waiting for approval.')).toBeInTheDocument();
  });
});
