import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import { ClubDetails } from '../index';

/**
 * MYK9-1293: the admin of THIS club gets a Payments tab and the members manager on the Members
 * tab; everyone else keeps the read-only roster and no Payments tab.
 */
const state = vi.hoisted(() => ({
  canManageClubAdmin: false,
  canReadRoster: false,
  memberCountReady: false,
  activeTab: 'members',
  activeMembers: [] as { id: string }[],
}));

vi.mock('../useClubDetailsState', () => ({
  useClubDetailsState: () => ({
    activeTab: state.activeTab,
    setActiveTab: vi.fn(),
    upcomingShows: [],
    pastShows: [],
    showsStatus: 'ready',
    retryShows: vi.fn(),
    activeMembers: state.activeMembers,
    clubMembers: [],
    stats: [],
    canEditBranding: false,
    canEditClub: true,
    canAddShow: false,
    canManageMembers: state.canManageClubAdmin,
    canManageClubAdmin: state.canManageClubAdmin,
    canReadRoster: state.canReadRoster,
    memberCountReady: state.memberCountReady,
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
vi.mock('../MembersTab', () => ({
  MembersTab: ({ canSeeFullRoster }: { canSeeFullRoster?: boolean }) => (
    <div data-testid="readonly-members" data-full-roster={String(canSeeFullRoster)} />
  ),
}));
vi.mock('../BrandingTab', () => ({ BrandingTab: () => null }));
vi.mock('../ClubDialogs', () => ({ ClubDialogs: () => null }));
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
    state.canReadRoster = false;
    state.memberCountReady = false;
    state.activeTab = 'members';
    state.activeMembers = [];
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

  // MYK9-2467: only an admin can read the whole roster. Anyone else reads at most their own
  // row, so the tab shows them no count: "Members 0" was false for a club with members.
  it("counts the members on the tab for this club's admin", () => {
    state.canManageClubAdmin = true;
    state.memberCountReady = true;
    state.activeMembers = [{ id: 'm1' }, { id: 'm2' }];
    render(<ClubDetails selectedClub={club} />);

    expect(screen.getByRole('tab', { name: /Members/ })).toHaveTextContent('2');
  });

  it('shows the admin no count on the tab until the roster has been read', () => {
    state.canManageClubAdmin = true;
    render(<ClubDetails selectedClub={club} />);

    expect(screen.getByRole('tab', { name: /Members/ }).textContent?.trim()).toBe('Members');
  });

  it('shows no member count on the tab to a viewer who cannot read the roster', () => {
    render(<ClubDetails selectedClub={club} />);

    const tab = screen.getByRole('tab', { name: /Members/ });
    expect(tab.textContent?.trim()).toBe('Members');
  });

  // Codex review of #4470, round 2: reading the whole roster is its own rule, not the
  // management rule. A show-pinned club admin reads it but does not manage from this page.
  it('labels the read-only list as the whole roster for a viewer who can read it', () => {
    state.canReadRoster = true;
    render(<ClubDetails selectedClub={club} />);

    expect(screen.getByTestId('readonly-members')).toHaveAttribute('data-full-roster', 'true');
  });

  it('labels the read-only list as her own row for a viewer who cannot', () => {
    render(<ClubDetails selectedClub={club} />);

    expect(screen.getByTestId('readonly-members')).toHaveAttribute('data-full-roster', 'false');
  });
});
