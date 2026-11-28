import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ClubsWaitingSection } from '../ClubsWaitingSection';
import { notifications } from '@/lib/notifications';

const mocks = vi.hoisted(() => ({
  shows: vi.fn(),
  review: vi.fn(),
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (state: { ensureClubsReady: () => void }) => unknown) =>
    selector({ ensureClubsReady: vi.fn() }),
}));
vi.mock('@/hooks/queries/useClubsDatabase', () => ({
  useClubsAwaitingAuthorizationQuery: () => ({
    data: [{ id: 'club-1', name: 'Heartland Dog Club', createdAt: '2026-09-19T12:00:00Z' }],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn().mockResolvedValue({}),
  }),
  clubQueryKeys: { lists: () => ['clubs', 'list'] },
}));
vi.mock('@/hooks/queries/useClubRegistryNumbers', () => ({
  useClubRegistryNumbers: () => ({ data: { AKC: '777' }, isError: false, isPending: false }),
}));
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsByClubQuery: () => mocks.shows(),
}));
vi.mock('@/services/database/club-access-requests', () => ({
  getPendingClubAccessRequests: vi.fn().mockResolvedValue([
    {
      id: 'req-1',
      requesterPersonId: 'person-1',
      requesterName: 'Liz Beezley',
      requesterEmail: 'liz@example.com',
      requestedClubName: 'Heartland Dog Club',
      requestedClubWebsite: null,
      requestNote: null,
      clubNumbers: {},
      status: 'pending',
      approvedClubId: null,
      createdClubId: 'club-1',
      createdAt: '2026-09-19T12:00:00Z',
      reviewNote: null,
    },
  ]),
  getDeclinedRequestClubIds: vi.fn().mockResolvedValue([]),
  reviewClubAccessRequest: mocks.review,
}));
vi.mock('@/services/database/clubs', () => ({ setClubAuthorization: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

async function openDecline() {
  const view = render(<ClubsWaitingSection />, { initialRoute: '/admin/onboarding' });
  await view.user.click(await screen.findByRole('button', { name: 'Decline Heartland Dog Club' }));
  return view;
}

describe('Decline confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.review.mockResolvedValue(null);
  });

  it('with no shows: the delete box is ticked and enabled, and the reason travels with it', async () => {
    mocks.shows.mockReturnValue({ data: [], isPending: false, isError: false });
    const { user } = await openDecline();

    const box = screen.getByRole('checkbox', { name: 'Also delete this club' });
    expect(box).toBeChecked();
    expect(box).not.toHaveAttribute('aria-disabled', 'true');
    await user.type(screen.getByLabelText('Reason (optional)'), 'Duplicate of another club');
    await user.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(mocks.review).toHaveBeenCalledWith({
        requestId: 'req-1',
        decision: 'denied',
        reviewNote: 'Duplicate of another club',
        deleteClub: true,
      })
    );
    expect(notifications.success).toHaveBeenCalledWith('Club request declined and club deleted');
  });

  it('with shows: the box is off and disabled, says why, links to the shows, and declining still works', async () => {
    mocks.shows.mockReturnValue({
      data: [{ id: 'show-1' }, { id: 'show-2' }],
      isPending: false,
      isError: false,
    });
    const { user } = await openDecline();

    const box = screen.getByRole('checkbox', { name: 'Also delete this club' });
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(/This club has 2 shows, so it can.t be deleted/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See its shows' })).toHaveAttribute(
      'href',
      '/clubs/club-1'
    );

    await user.click(screen.getByRole('button', { name: 'Decline' }));
    await waitFor(() =>
      expect(mocks.review).toHaveBeenCalledWith({
        requestId: 'req-1',
        decision: 'denied',
        reviewNote: null,
      })
    );
  });

  it('says in plain words when the server still refuses because the club has shows', async () => {
    mocks.shows.mockReturnValue({ data: [], isPending: false, isError: false });
    mocks.review.mockRejectedValue({ code: 'MK011', message: 'club has live shows' });
    const { user } = await openDecline();
    await user.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        expect.stringContaining('This club still has shows')
      )
    );
  });
});
