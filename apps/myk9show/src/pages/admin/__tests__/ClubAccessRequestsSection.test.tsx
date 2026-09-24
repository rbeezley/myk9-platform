import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { ClubAccessRequestsSection } from '../ClubAccessRequestsSection';
import {
  getPendingClubAccessRequests,
  reviewClubAccessRequest,
} from '@/services/database/club-access-requests';

const mocks = vi.hoisted(() => ({
  requests: vi.fn(),
  review: vi.fn(),
  clubs: vi.fn(),
}));

vi.mock('@/services/database/club-access-requests', () => ({
  getPendingClubAccessRequests: mocks.requests,
  reviewClubAccessRequest: mocks.review,
}));

vi.mock('@/hooks/queries/useClubsDatabase', () => ({
  useClubsQuery: () => ({ data: mocks.clubs() }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

const request = {
  id: 'request-1',
  requesterPersonId: 'person-1',
  requesterName: 'Liz Beezley',
  requesterEmail: 'liz@example.com',
  requestedClubName: 'Heartland Dog Club',
  requestedClubWebsite: 'https://heartland.example',
  requestNote: 'We are setting up our first show.',
  status: 'pending' as const,
  approvedClubId: null,
  createdAt: '2026-09-19T12:00:00Z',
  reviewNote: null,
};

describe('ClubAccessRequestsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPendingClubAccessRequests).mockResolvedValue([request]);
    vi.mocked(reviewClubAccessRequest).mockResolvedValue('club-1');
    mocks.clubs.mockReturnValue([{ id: 'club-2', name: 'Existing Dog Club' }]);
  });

  it('shows a pending new-club request and the review choices', async () => {
    render(<ClubAccessRequestsSection />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('Heartland Dog Club')).toBeInTheDocument();
    expect(screen.getByText(/Liz Beezley/)).toBeInTheDocument();
    expect(
      screen.getByText(/active member.*club-admin.*secretary\/show-manager access/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Create a new club' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Use Existing Dog Club' })).toBeInTheDocument();
  });

  it('does not make an unsafe website value clickable', async () => {
    vi.mocked(getPendingClubAccessRequests).mockResolvedValue([
      { ...request, requestedClubWebsite: 'javascript:alert(document.domain)' },
    ]);

    render(<ClubAccessRequestsSection />, { initialRoute: '/admin/onboarding' });

    expect(await screen.findByText('javascript:alert(document.domain)')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'javascript:alert(document.domain)' })
    ).not.toBeInTheDocument();
  });

  it('approves a request by creating a new club and granting access', async () => {
    const { user } = render(<ClubAccessRequestsSection />, { initialRoute: '/admin/onboarding' });
    await user.click(await screen.findByRole('button', { name: /approve and give club access/i }));

    await waitFor(() =>
      expect(reviewClubAccessRequest).toHaveBeenCalledWith({
        requestId: 'request-1',
        decision: 'approved',
        existingClubId: null,
        clubName: 'Heartland Dog Club',
        reviewNote: null,
      })
    );
  });

  it('denies a request with an optional review note', async () => {
    const { user } = render(<ClubAccessRequestsSection />, { initialRoute: '/admin/onboarding' });
    await user.type(await screen.findByLabelText('Review note'), 'Please contact support first.');
    await user.click(screen.getByRole('button', { name: /deny request/i }));

    await waitFor(() =>
      expect(reviewClubAccessRequest).toHaveBeenCalledWith({
        requestId: 'request-1',
        decision: 'denied',
        existingClubId: null,
        clubName: null,
        reviewNote: 'Please contact support first.',
      })
    );
  });
});
