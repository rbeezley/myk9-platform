import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import { ClubDetails } from '../index';

/**
 * MYK9-1293: the admin of THIS club gets a Payments tab and the members manager on the Members
 * tab; everyone else keeps the read-only roster and no Payments tab.
 */
const state = vi.hoisted(() => ({ canManageClubAdmin: false, activeTab: 'members' }));

vi.mock('../useClubDetailsState', () => ({
  useClubDetailsState: () => ({
    activeTab: state.activeTab,
    setActiveTab: vi.fn(),
    upcomingShows: [],
    pastShows: [],
    showsStatus: 'ready',
    retryShows: vi.fn(),
    activeMembers: [],
    clubMembers: [],
    stats: [],
    canEditBranding: false,
    canEditClub: true,
    canAddShow: false,
    canManageMembers: state.canManageClubAdmin,
    canManageClubAdmin: state.canManageClubAdmin,
    isMembersLoading: false,
    isMembersRefreshing: false,
    isMembersError: false,
    retryMembers: vi.fn(),
  }),
}));
vi.mock('../ClubHeader', () => ({ ClubHeader: () => null }));
vi.mock('../ClubStatistics', () => ({ ClubStatistics: () => null }));
vi.mock('../UpcomingShowsTab', () => ({ UpcomingShowsTab: () => null }));
vi.mock('../PastShowsTab', () => ({ PastShowsTab: () => null }));
vi.mock('../AboutTab', () => ({ AboutTab: () => null }));
vi.mock('../MembersTab', () => ({ MembersTab: () => <div data-testid="readonly-members" /> }));
vi.mock('../BrandingTab', () => ({ BrandingTab: () => null }));
vi.mock('../ClubDialogs', () => ({ ClubDialogs: () => null }));
vi.mock('../ClubNumbersSection', () => ({ ClubNumbersSection: () => null }));
vi.mock('../ClubShowsUnsettled', () => ({ ClubShowsUnsettled: () => null }));
vi.mock('@/pages/club-admin/ClubMembersManager', () => ({
  ClubMembersManager: ({ clubId }: { clubId: string }) => (
    <div data-testid="members-manager">{clubId}</div>
  ),
}));
vi.mock('../ClubPaymentsTab', () => ({
  ClubPaymentsTab: ({ clubId }: { clubId: string }) => (
    <div data-testid="payments-tab">{clubId}</div>
  ),
}));

const club = { id: 'club-1', name: 'Heartland Club' } as Club;

describe('ClubDetails admin tabs (MYK9-1293)', () => {
  beforeEach(() => {
    state.canManageClubAdmin = false;
    state.activeTab = 'members';
  });

  it("gives this club's admin a Payments tab and the members manager", async () => {
    state.canManageClubAdmin = true;
    render(<ClubDetails selectedClub={club} />);

    expect(screen.getByRole('tab', { name: /Payments/ })).toBeInTheDocument();
    expect(await screen.findByTestId('members-manager')).toHaveTextContent('club-1');
    expect(screen.queryByTestId('readonly-members')).not.toBeInTheDocument();
  });

  it('shows the Payments tab content when it is the active tab', async () => {
    state.canManageClubAdmin = true;
    state.activeTab = 'payments';
    render(<ClubDetails selectedClub={club} />);

    expect(await screen.findByTestId('payments-tab')).toHaveTextContent('club-1');
  });

  it('keeps everyone else on the read-only Members tab with no Payments tab', () => {
    render(<ClubDetails selectedClub={club} />);

    expect(screen.queryByRole('tab', { name: /Payments/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Members/ })).toBeInTheDocument();
    expect(screen.getByTestId('readonly-members')).toBeInTheDocument();
    expect(screen.queryByTestId('members-manager')).not.toBeInTheDocument();
  });
});
