import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { render, screen, waitFor, within } from '@/test/utils/testUtils';
import { ClubMembersManager } from './ClubMembersManager';

const { getClubShowManagers, countUpcomingClubShows } = vi.hoisted(() => ({
  getClubShowManagers: vi.fn(),
  countUpcomingClubShows: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    getUserRoles: () => ['club_admin'],
    hasRole: (role: string) => role === 'club_admin',
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
  getClubAdmins: vi.fn(() => Promise.resolve([])),
  addClubAdminByEmail: vi.fn(),
  removeClubAdmin: vi.fn(),
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

describe('ClubMembersManager list toolkit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClubShowManagers.mockResolvedValue([]);
    countUpcomingClubShows.mockResolvedValue(0);
  });

  it("names its tab strip so it is distinct from the club page's own tabs", async () => {
    render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    const strip = screen.getByRole('tablist', { name: 'Member management' });
    expect(within(strip).getByRole('tab', { name: /Members/ })).toBeInTheDocument();
    expect(within(strip).getByRole('tab', { name: /Officers/ })).toBeInTheDocument();
  });

  it('shows the role views with counts, and both members by default', async () => {
    render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />);

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();

    const select = screen.getByRole('combobox', { name: 'View: Member views' });
    expect(select).toHaveTextContent(/^All \(2\)/);
    await userEvent.setup().click(select);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: /^Admins/ })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /^Show secretaries/ })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /^Officers/ })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: /^Lapsed/ })).not.toBeInTheDocument();
  });

  it('selecting the Show secretaries view narrows the table and writes ?view= to the URL', async () => {
    getClubShowManagers.mockResolvedValue([
      {
        personId: 'person-2',
        personName: 'Grace Hopper',
        personEmail: 'grace@example.com',
        isClubMember: true,
        membershipStatus: 'lapsed',
      },
    ]);
    const user = userEvent.setup();
    render(
      <>
        <ClubMembersManager clubId="club-1" clubName="Heartland Club" />
        <SearchProbe />
      </>
    );
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('combobox', { name: 'View: Member views' }));
    await user.click(await screen.findByRole('option', { name: /^Show secretaries/ }));

    await waitFor(() => {
      expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('view=secretaries');
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 2 people.');
  });

  it('the Status filter narrows the table and writes ?status= to the URL', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ClubMembersManager clubId="club-1" clubName="Heartland Club" />
        <SearchProbe />
      </>
    );
    await screen.findByText('Ada Lovelace');

    await user.click(screen.getByRole('combobox', { name: 'Status' }));
    await user.click(await screen.findByRole('option', { name: /^Lapsed/ }));

    await waitFor(() => {
      expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('status=lapsed');
  });

  it('keeps an old ?status= link working', async () => {
    render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />, {
      initialRoute: '/?status=lapsed',
    });
    expect(await screen.findByText('Grace Hopper')).toBeInTheDocument();
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('searching by name narrows the table', async () => {
    const user = userEvent.setup();
    render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />);
    await screen.findByText('Ada Lovelace');

    await user.type(screen.getByPlaceholderText('Search people by name or email...'), 'grace');

    await waitFor(() => {
      expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Grace Hopper')).toBeInTheDocument();
  });

  it('"Show all people" clears view, status and search in ONE URL update', async () => {
    const user = userEvent.setup();
    render(
      <>
        <ClubMembersManager clubId="club-1" clubName="Heartland Club" />
        <SearchProbe />
      </>,
      { initialRoute: '/?view=officers&status=lapsed&q=grace' }
    );

    await user.click(await screen.findByRole('button', { name: 'Show all people' }));

    await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/));
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });

  it('ignores a status or view no control offers (a stale link): the list is unfiltered', async () => {
    render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />, {
      initialRoute: '/?status=bogus&view=bogus',
    });
    await screen.findByRole('combobox', { name: 'View: Member views' });
    await waitFor(() =>
      expect(screen.getAllByRole('status').map(el => el.textContent)).toContain(
        'Showing all 2 people.'
      )
    );
  });

  it('shows the one line that says what each role does', async () => {
    render(<ClubMembersManager clubId="club-1" clubName="Heartland Club" />);
    expect(
      await screen.findByText(
        "Admins manage the club: members, payments and branding. Show secretaries create and run the club's shows. Officer titles print in your premium list and change nothing else."
      )
    ).toBeInTheDocument();
  });
});
