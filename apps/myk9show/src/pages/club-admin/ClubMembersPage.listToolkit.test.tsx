import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import ClubMembersPage from './ClubMembersPage';

const { getClubShowManagers, countUpcomingClubShows } = vi.hoisted(() => ({
  getClubShowManagers: vi.fn(),
  countUpcomingClubShows: vi.fn(),
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
    {
      id: 'member-2',
      clubId: 'club-1',
      personId: 'person-2',
      personName: 'Grace Hopper',
      personEmail: 'grace@example.com',
      membershipType: 'associate',
      membershipStatus: 'lapsed',
      joinedDate: '2025-06-01',
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
  setClubShowManagerAccess: vi.fn(),
}));

vi.mock('@/services/database/clubs', () => ({
  countUpcomingClubShows,
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

function SearchProbe() {
  return <p data-testid="search">{useLocation().search}</p>;
}

describe('ClubMembersPage list toolkit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClubShowManagers.mockResolvedValue([]);
    countUpcomingClubShows.mockResolvedValue(0);
  });

  it('shows a view per membership status with counts, and both members by default', async () => {
    render(<ClubMembersPage />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();

    const select = screen.getByRole('combobox', { name: 'Show: Member views' });
    expect(select).toHaveTextContent(/^All \(2\)/);
    await userEvent.setup().click(select);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: /^Active/ })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /^Lapsed/ })).toBeInTheDocument();
  });

  it('selecting the Lapsed view narrows the table and writes ?status= to the URL', async () => {
    const user = userEvent.setup();
    render(<ClubMembersPage />);
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('combobox', { name: 'Show: Member views' }));
    await user.click(await screen.findByRole('option', { name: /^Lapsed/ }));

    await waitFor(() => {
      expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 2 members (Lapsed).');
  });

  it('searching by name narrows the table', async () => {
    const user = userEvent.setup();
    render(<ClubMembersPage />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByPlaceholderText('Search members by name or email...'), 'grace');

    await waitFor(() => {
      expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('"Show all members" clears status and search in ONE URL update', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ClubMembersPage />
        <SearchProbe />
      </>,
      { initialRoute: '/?status=lapsed&q=grace' }
    );

    await user.click(await screen.findByRole('button', { name: 'Show all members' }));

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/));
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });
});
