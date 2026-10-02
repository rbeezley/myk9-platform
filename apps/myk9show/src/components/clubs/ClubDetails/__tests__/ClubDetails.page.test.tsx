import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import type { Club } from '@/types/club-types';
import { ClubDetails } from '../index';

/**
 * Club detail page frame (MYK9-930): the one page shell, the shared PageHeader
 * breadcrumb (Home › Clubs › Name) and a hero that owns the page h1. The hero's
 * own slots are covered in ClubHeader.test.tsx.
 */
const state = vi.hoisted(() => ({
  activeTab: 'upcoming',
  setActiveTab: vi.fn(),
}));

vi.mock('../useClubDetailsState', () => ({
  useClubDetailsState: () => ({
    activeTab: state.activeTab,
    setActiveTab: state.setActiveTab,
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
    canManageMembers: false,
    isMembersLoading: false,
    isMembersRefreshing: false,
    isMembersError: false,
    retryMembers: vi.fn(),
  }),
}));
vi.mock('../ClubHeader', () => ({
  ClubHeader: ({ club }: { club: Club }) => <h1 data-testid="club-hero-title">{club.name}</h1>,
}));
vi.mock('../ClubStatistics', () => ({ ClubStatistics: () => null }));
vi.mock('../UpcomingShowsTab', () => ({ UpcomingShowsTab: () => null }));
vi.mock('../PastShowsTab', () => ({ PastShowsTab: () => null }));
vi.mock('../AboutTab', () => ({ AboutTab: () => null }));
vi.mock('../MembersTab', () => ({ MembersTab: () => null }));
vi.mock('../BrandingTab', () => ({ BrandingTab: () => null }));
vi.mock('../ClubDialogs', () => ({ ClubDialogs: () => null }));
vi.mock('../ClubShowsUnsettled', () => ({ ClubShowsUnsettled: () => null }));

const club = {
  id: 'club-1',
  name: 'Heartland Club',
  clubNumber: '',
  email: '',
  phone: '',
  description: '',
  address: { street: '', city: 'Tulsa', state: 'OK', zipCode: '', country: 'US' },
  logo: '',
  coverImage: '',
  accentColor: '',
  upcomingShows: [],
  pastShows: [],
} as Club;

describe('ClubDetails page frame (MYK9-930)', () => {
  it('sits in the one detail-page shell, not its own 1440px container with extra top padding', () => {
    render(<ClubDetails selectedClub={club} />);

    const shell = screen.getByTestId('app-shell-page');
    expect(shell).toHaveClass('max-w-7xl');
    expect(shell.className).not.toContain('py-20');
    expect(shell.querySelector('[class*="1440"]')).toBeNull();
  });

  it('renders the breadcrumb Home › Clubs › the club, with Clubs linking to the list', () => {
    render(<ClubDetails selectedClub={club} />);

    const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(trail.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(trail.getByRole('link', { name: 'Clubs' })).toHaveAttribute('href', '/clubs');
    expect(trail.getByText('Heartland Club')).toBeInTheDocument();
  });

  it('leaves the page h1 to the hero, so the breadcrumb header adds no second one', () => {
    const { container } = render(<ClubDetails selectedClub={club} />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelector('h1.sr-only')).toBeNull();
  });
});
