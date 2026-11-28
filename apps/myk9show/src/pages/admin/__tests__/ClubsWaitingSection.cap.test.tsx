import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ClubsWaitingSection } from '../ClubsWaitingSection';

// MYK9-1448: the real hook over a mocked service layer that behaves like
// PostgREST, which caps the unfiltered name-ordered read at 1,000 rows.
const mocks = vi.hoisted(() => ({
  getPendingRequests: vi.fn(),
  getAllClubs: vi.fn(),
  getClubsAwaitingAuthorization: vi.fn(),
}));

vi.mock('@/services/database/club-access-requests', () => ({
  getPendingClubAccessRequests: mocks.getPendingRequests,
  reviewClubAccessRequest: vi.fn(),
}));

vi.mock('@/services/database/clubs', () => ({
  setClubAuthorization: vi.fn(),
  getClubRegistryNumbers: vi.fn().mockResolvedValue({}),
  getAllClubs: mocks.getAllClubs,
  getClubsAwaitingAuthorization: mocks.getClubsAwaitingAuthorization,
  getClubById: vi.fn(),
  createClub: vi.fn(),
  updateClub: vi.fn(),
  searchClubs: vi.fn(),
  searchClubsByLocation: vi.fn(),
  getActiveClubs: vi.fn(),
  getClubsWithShowCounts: vi.fn(),
  getClubStatistics: vi.fn(),
  checkClubNameExists: vi.fn(),
}));

function row(id: string, name: string, authorizedAt: string | null) {
  return { id, name, authorized_at: authorizedAt, created_at: '2026-09-24T12:00:00Z' };
}

describe('ClubsWaitingSection past the 1,000-row cap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 1,000 authorized clubs named A0000..A0999 fill the capped read; the
    // pending club sorts after them, so getAllClubs() never returns it.
    const firstThousand = Array.from({ length: 1000 }, (_, i) =>
      row(`ok-${i}`, `A${String(i).padStart(4, '0')}`, '2026-09-01T00:00:00Z')
    );
    mocks.getAllClubs.mockResolvedValue({ data: firstThousand, error: null });
    mocks.getPendingRequests.mockResolvedValue([]);
    mocks.getClubsAwaitingAuthorization.mockResolvedValue({
      data: [row('late-1', 'Zulu Pending Club', null)],
      error: null,
    });
  });

  it('lists a pending club that sorts after the first 1,000 clubs by name', async () => {
    render(<ClubsWaitingSection />);

    expect(await screen.findByText('Zulu Pending Club')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the club/ })).toHaveAttribute(
      'href',
      '/clubs/late-1'
    );
    expect(mocks.getClubsAwaitingAuthorization).toHaveBeenCalled();
  });
});
