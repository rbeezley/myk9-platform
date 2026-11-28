import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ClubsWaitingSection } from '../ClubsWaitingSection';
import { notifications } from '@/lib/notifications';
import { CLUB_ACCESS_SENTENCE } from '@/features/delete/deleteObjectCopy';

const mocks = vi.hoisted(() => ({
  shows: vi.fn(),
  review: vi.fn(),
  unsaved: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: mocks.unsaved,
}));
vi.mock('@/features/delete/deleteLocalState', () => ({
  reconcileLocalDeletion: mocks.reconcile,
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
    mocks.unsaved.mockResolvedValue({ total: 0, failed: 0 });
    mocks.reconcile.mockResolvedValue(undefined);
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

  it('says what deleting costs under the ticked box', async () => {
    mocks.shows.mockReturnValue({ data: [], isPending: false, isError: false });
    await openDecline();
    expect(screen.getByText(CLUB_ACCESS_SENTENCE)).toBeInTheDocument();
  });

  it('does not say it when the box is off because the club has shows', async () => {
    mocks.shows.mockReturnValue({ data: [{ id: 'show-1' }], isPending: false, isError: false });
    await openDecline();
    expect(screen.queryByText(CLUB_ACCESS_SENTENCE)).not.toBeInTheDocument();
  });

  it('removes the deleted club from this device without a second server delete', async () => {
    mocks.shows.mockReturnValue({ data: [], isPending: false, isError: false });
    const { user } = await openDecline();
    await user.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(mocks.reconcile).toHaveBeenCalledWith('club', {
        id: 'club-1',
        name: 'Heartland Dog Club',
      })
    );
    expect(mocks.review).toHaveBeenCalledTimes(1);
  });

  it('does not touch the device when the club was kept', async () => {
    mocks.shows.mockReturnValue({ data: [{ id: 'show-1' }], isPending: false, isError: false });
    const { user } = await openDecline();
    await user.click(screen.getByRole('button', { name: 'Decline' }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalled());
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('refuses to delete while this device has changes that have not uploaded', async () => {
    mocks.shows.mockReturnValue({ data: [], isPending: false, isError: false });
    mocks.unsaved.mockResolvedValue({ total: 2, failed: 0 });
    const { user } = await openDecline();
    await user.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(notifications.error).toHaveBeenCalledWith(
        "Finish saving first: this device has changes that haven't uploaded yet."
      )
    );
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('treats a queue that cannot be read as unsaved work', async () => {
    mocks.shows.mockReturnValue({ data: [], isPending: false, isError: false });
    mocks.unsaved.mockRejectedValue(new Error('idb closed'));
    const { user } = await openDecline();
    await user.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() => expect(notifications.error).toHaveBeenCalled());
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it('still declines without deleting while changes are unsaved', async () => {
    mocks.shows.mockReturnValue({ data: [{ id: 'show-1' }], isPending: false, isError: false });
    mocks.unsaved.mockResolvedValue({ total: 2, failed: 0 });
    const { user } = await openDecline();
    await user.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() =>
      expect(mocks.review).toHaveBeenCalledWith({
        requestId: 'req-1',
        decision: 'denied',
        reviewNote: null,
      })
    );
  });

  it('keeps a cancelled decline reason out of a later Approve', async () => {
    mocks.shows.mockReturnValue({ data: [], isPending: false, isError: false });
    const { user } = await openDecline();
    await user.type(screen.getByLabelText('Reason (optional)'), 'Not a real club');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Approve Heartland Dog Club' }));

    await waitFor(() =>
      expect(mocks.review).toHaveBeenCalledWith({
        requestId: 'req-1',
        decision: 'approved',
        reviewNote: null,
      })
    );
  });
});
