import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Dog } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';

// ── Mock data ───────────────────────────────────────────────────────────────

const makeDog = (overrides: Partial<Dog> = {}): Dog => ({
  id: 'dog-1',
  name: 'Champion Goldenworth Max',
  callName: 'Max',
  breed: 'Golden Retriever',
  sex: 'male',
  ownerId: 'owner-1',
  ownerName: 'Jane Doe',
  registrations: [
    {
      id: 'reg-1',
      organization: 'AKC',
      registeredName: 'Champion Goldenworth Max',
      breed: 'Golden Retriever',
      registrationNumber: 'DN12345678',
      status: 'Active',
    },
    {
      id: 'reg-2',
      organization: 'UKC',
      registeredName: 'Goldenworth Max',
      breed: 'Golden Retriever',
      registrationNumber: 'R123456',
      status: 'Active',
    },
  ],
  ...overrides,
});

// ── Mutable mock state ──────────────────────────────────────────────────────

let mockBrowseDogsReturn = {
  dogs: [makeDog()],
  filteredDogs: [makeDog()],
  isLoading: false,
  hasError: false,
  handleRetry: vi.fn(),
  filters: { search: '', breed: 'all', sex: 'all' },
  setFilters: vi.fn(),
  hasActiveFilters: false,
  clearAllFilters: vi.fn(),
  availableBreeds: ['Golden Retriever', 'Border Collie'],
};

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useBrowseDogsData', () => ({
  useBrowseDogsData: () => mockBrowseDogsReturn,
}));

const mockGetUserRoles = vi.fn().mockReturnValue(['secretary']);
// Derived from the same role set rather than a standalone stub: the page now
// asks `hasRole` (via `useRosterIsOwnDogsOnly`) as well as `getUserRoles`, and
// an auth mock whose two accessors disagree would let a role-scoping bug pass.
const mockHasRole = vi.fn((role: UserRole) => (mockGetUserRoles() as string[]).includes(role));
// `useRoleBasedDogs` scopes the roster off `userWithRoles`, so the page treats a
// null value as "identity not resolved yet" rather than "this user owns no dogs".
let mockUserWithRoles: unknown = { id: 'user-1', databaseUserId: 'person-1', roles: [] };

vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    useAuthContext: () => ({
      getUserRoles: mockGetUserRoles,
      hasRole: mockHasRole,
      userWithRoles: mockUserWithRoles,
    }),
  };
});

// `useRosterIsOwnDogsOnly` is deliberately NOT stubbed — it is the predicate
// under test, and it reads the mocked auth context above. Stubbing it would
// make every role assertion below a test of the stub.
vi.mock('@/hooks/useRoleBasedData', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    useCurrentUserPersonId: () => 'person-1',
  };
});

const mockRefreshRbac = vi.fn();

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: () => true,
    isLoading: false,
    refresh: mockRefreshRbac,
  }),
}));

vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="add-dog-panel">
        Add dog panel
        <button type="button" onClick={onClose}>
          Close dog panel
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/common/SkeletonLoaders', () => ({
  BrowseDogsSkeleton: () => <div data-testid="dogs-skeleton">Loading...</div>,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

import BrowseDogsPage from '../BrowseDogsPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="current-location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialRoute = '/dogs') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <BrowseDogsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('BrowseDogsPage (shared primitives migration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGetUserRoles.mockReturnValue(['secretary']);
    mockUserWithRoles = { id: 'user-1', databaseUserId: 'person-1', roles: [] };
    mockBrowseDogsReturn = {
      dogs: [makeDog()],
      filteredDogs: [makeDog()],
      isLoading: false,
      hasError: false,
      handleRetry: vi.fn(),
      filters: { search: '', breed: 'all', sex: 'all' },
      setFilters: vi.fn(),
      hasActiveFilters: false,
      clearAllFilters: vi.fn(),
      availableBreeds: ['Golden Retriever', 'Border Collie'],
    };
  });

  it('renders inside a PageShell wrapper (max-w-7xl container)', () => {
    renderPage();
    // PageShell renders a div with max-w-7xl class
    const shell = document.querySelector('.max-w-7xl');
    expect(shell).toBeTruthy();
  });

  it('renders breadcrumb with "Dogs" link via PageHeader', () => {
    renderPage();
    // PageHeader includes a breadcrumb nav
    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav).toBeInTheDocument();
    // The breadcrumb should contain "Dogs" text (within the nav)
    const dogsInBreadcrumb = nav.querySelector('.text-foreground');
    expect(dogsInBreadcrumb).toBeTruthy();
    expect(dogsInBreadcrumb!.textContent).toBe('Dogs');
  });

  it('renders ErrorState when hook returns error', () => {
    mockBrowseDogsReturn = {
      ...mockBrowseDogsReturn,
      hasError: true,
      isLoading: false,
      dogs: [],
      filteredDogs: [],
    };

    renderPage();

    expect(screen.getByText("We couldn't load your dogs.")).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders EmptyState when no dogs exist (no filters active)', () => {
    mockBrowseDogsReturn = {
      ...mockBrowseDogsReturn,
      dogs: [],
      filteredDogs: [],
      hasActiveFilters: false,
    };

    renderPage();

    expect(screen.getByText('No dogs yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add your first dog to track health records, registrations, and competitions.'
      )
    ).toBeInTheDocument();
  });

  it('renders filtered EmptyState when filters produce zero results', () => {
    mockBrowseDogsReturn = {
      ...mockBrowseDogsReturn,
      dogs: [makeDog()],
      filteredDogs: [],
      hasActiveFilters: true,
    };

    renderPage();

    expect(screen.getByText('No dogs match your filters')).toBeInTheDocument();
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  it('renders dog table view by default', () => {
    renderPage();

    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Breed' })).toBeInTheDocument();
  });

  it('renders dog cards by default for exhibitor-only users', () => {
    mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);

    renderPage();

    expect(screen.getByText('DN12345678')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Name' })).not.toBeInTheDocument();
  });

  it('ignores a stored table preference and stays card-only for exhibitor-only users', () => {
    // My Dogs is card-only for exhibitors (design.md D3) — unlike
    // secretary/admin, no stored preference can switch them to the table.
    localStorage.setItem('view-pref-dogs', 'table');
    mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);

    renderPage();

    expect(screen.queryByRole('columnheader', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.getByText('DN12345678')).toBeInTheDocument();
  });

  it('hides the view-mode toggle entirely for exhibitor-only users', () => {
    mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);

    renderPage();

    expect(screen.queryByTitle('Cards view')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Table view')).not.toBeInTheDocument();
  });

  it('navigates to the dog detail page on card click for exhibitor-only users', async () => {
    const user = userEvent.setup();
    mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);

    renderPage();

    await user.click(screen.getByRole('link', { name: /max/i }));

    expect(screen.getByTestId('current-location')).toHaveTextContent('/dogs/dog-1');
  });

  it('navigates to the dog detail page on Enter for exhibitor-only users', async () => {
    const user = userEvent.setup();
    mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);

    renderPage();

    const card = screen.getByRole('link', { name: /max/i });
    card.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByTestId('current-location')).toHaveTextContent('/dogs/dog-1');
  });

  it('renders dog cards with a registration row per registry when cards are selected', () => {
    localStorage.setItem('view-pref-dogs', 'cards');

    renderPage();

    // One org / number row per registry should be visible on the card
    expect(screen.getByText('DN12345678')).toBeInTheDocument();
    expect(screen.getByText('R123456')).toBeInTheDocument();
  });

  it('renders dog cards without registration badges when none exist', () => {
    localStorage.setItem('view-pref-dogs', 'cards');
    mockBrowseDogsReturn = {
      ...mockBrowseDogsReturn,
      dogs: [makeDog({ registrations: [] })],
      filteredDogs: [makeDog({ registrations: [] })],
    };

    renderPage();

    // Dog card should still render
    expect(screen.getByText('Max')).toBeInTheDocument();
    // No registration badges
    expect(screen.queryByText('DN12345678')).not.toBeInTheDocument();
  });

  it('uses "Sex" consistently for the filter and table column', () => {
    localStorage.setItem('view-pref-dogs', 'cards');

    renderPage();

    expect(screen.getByText('Sex')).toBeInTheDocument();
    expect(screen.queryByText('Gender')).not.toBeInTheDocument();
  });

  it('renders SearchBar with correct placeholder', () => {
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search dogs by name, breed, or owner...');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders ViewToggle with Cards and Table modes', () => {
    renderPage();

    expect(screen.getByTitle('Cards view')).toBeInTheDocument();
    expect(screen.getByTitle('Table view')).toBeInTheDocument();
  });

  it('renders ResultsCount showing correct numbers', () => {
    renderPage();

    // 1 of 1 dog
    expect(screen.getByText('1 dog')).toBeInTheDocument();
  });

  it('opens the add dog panel from the add query parameter', () => {
    renderPage('/dogs?add=true');

    expect(screen.getByTestId('add-dog-panel')).toBeInTheDocument();
  });

  it('removes the add query parameter when the add dog panel closes', async () => {
    const user = userEvent.setup();
    renderPage('/dogs?add=true');

    expect(screen.getByTestId('current-location')).toHaveTextContent('/dogs?add=true');

    await user.click(screen.getByRole('button', { name: 'Close dog panel' }));

    expect(screen.queryByTestId('add-dog-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent('/dogs');
  });

  it('shows loading skeleton when isLoading and no dogs', () => {
    mockBrowseDogsReturn = {
      ...mockBrowseDogsReturn,
      isLoading: true,
      dogs: [],
      filteredDogs: [],
    };

    renderPage();

    expect(screen.getByTestId('dogs-skeleton')).toBeInTheDocument();
  });

  it('shows "My Dogs" title and exhibitor-friendly placeholder for exhibitor-only users', () => {
    mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);

    renderPage();

    expect(screen.getByRole('heading', { name: 'My Dogs' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search your dogs by name or breed...')).toBeInTheDocument();
  });

  it.each([
    ['judge', [UserRole.JUDGE]],
    ['steward', [UserRole.STEWARD, UserRole.EXHIBITOR]],
    ['chairman', [UserRole.CHAIRMAN, UserRole.EXHIBITOR]],
  ] as const)('uses the My Dogs title whenever %s has an own-dogs-only roster', (_label, roles) => {
    mockGetUserRoles.mockReturnValue(roles);

    renderPage();

    expect(screen.getByRole('heading', { name: 'My Dogs' })).toBeInTheDocument();
  });

  it('keeps the Dogs title when any full-roster role is held', () => {
    mockGetUserRoles.mockReturnValue([UserRole.JUDGE, UserRole.CLUB_ADMIN]);

    renderPage();

    expect(screen.getByRole('heading', { name: 'Dogs' })).toBeInTheDocument();
  });

  describe('unresolved identity', () => {
    // useRoleBasedDogs returns [] until userWithRoles resolves, while isLoading
    // tracks only the dogs query. The page used to fall straight through to
    // "No dogs yet" in that window — and on a cold offline boot roles settle at
    // [] permanently, so the lie was terminal, not a flash (MYK9-200).
    it('does not claim the roster is empty while identity is still resolving', () => {
      mockUserWithRoles = null;
      mockBrowseDogsReturn = {
        ...mockBrowseDogsReturn,
        isLoading: true,
        dogs: [],
        filteredDogs: [],
      };

      renderPage();

      expect(screen.getByTestId('dogs-skeleton')).toBeInTheDocument();
      expect(screen.queryByText('No dogs yet')).not.toBeInTheDocument();
    });

    it('offers a retry instead of "No dogs yet" when identity never resolves', () => {
      mockUserWithRoles = null;
      mockBrowseDogsReturn = {
        ...mockBrowseDogsReturn,
        isLoading: false,
        dogs: [],
        filteredDogs: [],
      };

      renderPage();

      expect(screen.getByText("We couldn't confirm your account")).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      expect(screen.queryByText('No dogs yet')).not.toBeInTheDocument();
    });

    it('retries the RBAC lookup, not just the dogs query', async () => {
      // RBAC is what failed here, so refetching the dog store alone would put
      // the user straight back on this screen (Codex review finding).
      mockUserWithRoles = null;
      const handleRetry = vi.fn();
      mockBrowseDogsReturn = {
        ...mockBrowseDogsReturn,
        isLoading: false,
        dogs: [],
        filteredDogs: [],
        handleRetry,
      };

      renderPage();
      await userEvent.click(screen.getByRole('button', { name: /try again/i }));

      expect(mockRefreshRbac).toHaveBeenCalled();
      expect(handleRetry).toHaveBeenCalled();
    });

    it('still shows the real empty state once identity is known', () => {
      mockBrowseDogsReturn = {
        ...mockBrowseDogsReturn,
        isLoading: false,
        dogs: [],
        filteredDogs: [],
      };

      renderPage();

      expect(screen.getByText('No dogs yet')).toBeInTheDocument();
    });
  });

  // MYK9-219. The page is what knows which roster the viewer is looking at, so
  // it is the only place the role-aware card can be wired wrong.
  describe('role-aware dog card', () => {
    it('does not show exhibitors their own name on their own dogs', () => {
      mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);

      renderPage();

      expect(screen.getByRole('link', { name: /max/i })).toBeInTheDocument();
      expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
      expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
    });

    it('keeps the owner on the card for a secretary, who sees every dog', () => {
      localStorage.setItem('view-pref-dogs', 'cards');

      renderPage();

      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    // `USER_ROLE_HIERARCHY` ranks JUDGE, CLUB_ADMIN, CHAIRMAN and STEWARD ABOVE
    // EXHIBITOR, so `getPrimaryRole(...) === EXHIBITOR` is false for all of
    // them — while `useRoleBasedDogs` still scopes their roster to dogs they
    // own. Deriving the card from the role instead of from the scope gave every
    // one of these users their own name on every card.
    it.each([
      ['judge', UserRole.JUDGE],
      ['steward', UserRole.STEWARD],
      ['chairman', UserRole.CHAIRMAN],
    ])('does not show a %s their own name on their own dogs', (_label, role) => {
      localStorage.setItem('view-pref-dogs', 'cards');
      mockGetUserRoles.mockReturnValue([role, UserRole.EXHIBITOR]);

      renderPage();

      expect(screen.getByRole('link', { name: /max/i })).toBeInTheDocument();
      expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
    });

    // The complement: holding an elevated role alongside a lower-ranked one
    // must still show the owner, because that roster is the whole platform.
    it('keeps the owner for a judge who is also a secretary', () => {
      localStorage.setItem('view-pref-dogs', 'cards');
      mockGetUserRoles.mockReturnValue([UserRole.JUDGE, UserRole.SECRETARY]);

      renderPage();

      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });

    // NOTHING here sets `view-pref-dogs`. That matters: every other test in
    // this block pre-selects cards, and a judge/steward/chairman has
    // `isExhibitorOnly === false`, so `useViewPreference` lands them on the
    // TABLE. Pre-setting the view is exactly what hid this from the suite —
    // the predicate was extended to these roles but the fix only reached the
    // card view they never see.
    describe('on the view the user actually lands on', () => {
      it.each([
        ['judge', UserRole.JUDGE],
        ['steward', UserRole.STEWARD],
        ['chairman', UserRole.CHAIRMAN],
      ])('does not show a %s their own name on the default view', (_label, role) => {
        mockGetUserRoles.mockReturnValue([role]);

        renderPage();

        expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Owner' })).not.toBeInTheDocument();
        expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
      });

      it('keeps the Owner column for a secretary on the default view', () => {
        renderPage();

        expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeInTheDocument();
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });

      it('keeps the Owner column for a site admin on the default view', () => {
        mockGetUserRoles.mockReturnValue([UserRole.SITE_ADMIN]);

        renderPage();

        expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeInTheDocument();
      });
    });

    it('keeps the owner for a club admin, whose primary role is not elevated', () => {
      // getPrimaryRole([JUDGE, CLUB_ADMIN]) is JUDGE, but CLUB_ADMIN sees every
      // dog — the case where a primary-role test and a hasRole test disagree.
      localStorage.setItem('view-pref-dogs', 'cards');
      mockGetUserRoles.mockReturnValue([UserRole.JUDGE, UserRole.CLUB_ADMIN]);

      renderPage();

      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  // MYK9-218. The table has always paginated at 25; the card view rendered the
  // whole roster, so one dataset behaved two different ways on one route.
  describe('card view pagination', () => {
    const roster = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        makeDog({ id: `dog-${i + 1}`, name: `Dog ${i + 1}`, callName: `Dog ${i + 1}` })
      );

    const cardLinks = () => screen.getAllByRole('link', { name: /^Dog \d+$/ });

    function renderCards(count: number, extra: Record<string, unknown> = {}) {
      const dogs = roster(count);
      mockBrowseDogsReturn = { ...mockBrowseDogsReturn, dogs, filteredDogs: dogs, ...extra };
      localStorage.setItem('view-pref-dogs', 'cards');
      return renderPage();
    }

    it('renders at most 25 cards from a 60-dog roster', () => {
      renderCards(60);

      const links = cardLinks();
      expect(links).toHaveLength(25);
      expect(links[0]).toHaveAccessibleName('Dog 1');
      expect(links[24]).toHaveAccessibleName('Dog 25');
      expect(screen.queryByRole('link', { name: 'Dog 26' })).not.toBeInTheDocument();
    });

    it('walks to the next page of cards', async () => {
      const user = userEvent.setup();
      renderCards(60);

      await user.click(screen.getByRole('button', { name: 'Go to next page' }));

      const links = cardLinks();
      expect(links).toHaveLength(25);
      expect(links[0]).toHaveAccessibleName('Dog 26');
      expect(links[24]).toHaveAccessibleName('Dog 50');
      expect(screen.queryByRole('link', { name: 'Dog 25' })).not.toBeInTheDocument();
    });

    it('renders the short last page rather than padding it', async () => {
      const user = userEvent.setup();
      renderCards(60);

      await user.click(screen.getByRole('button', { name: 'Go to last page' }));

      expect(cardLinks()).toHaveLength(10);
      expect(screen.getByRole('link', { name: 'Dog 60' })).toBeInTheDocument();
    });

    // The guard that matters: putting a ceiling on a previously unbounded list
    // re-arms every count downstream of it. The results summary describes how
    // many dogs MATCH, so it must keep reading the whole filtered set — a page
    // count there would tell a secretary their roster shrank.
    it('reports the whole filtered roster in the results summary, not the page', () => {
      renderCards(60);

      expect(screen.getByText('60 dogs')).toBeInTheDocument();
      expect(screen.queryByText('25 dogs')).not.toBeInTheDocument();

      const nav = screen.getByRole('navigation', { name: 'Dog list pagination' });
      expect(nav.textContent?.replace(/\s+/g, ' ')).toContain('Showing 1 to 25 of 60');
    });

    it('hides the pagination control when the roster fits on one page', () => {
      renderCards(25);

      expect(cardLinks()).toHaveLength(25);
      expect(screen.queryByRole('navigation', { name: 'Dog list pagination' })).not.toBeInTheDocument();
    });

    it('paginates the exhibitor card view too', () => {
      mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);
      renderCards(60);

      expect(cardLinks()).toHaveLength(25);
      expect(screen.getByRole('navigation', { name: 'Dog list pagination' })).toBeInTheDocument();
    });

    it('returns to the first page when the search changes', async () => {
      const user = userEvent.setup();
      renderCards(60);

      await user.click(screen.getByRole('button', { name: 'Go to next page' }));
      expect(cardLinks()[0]).toHaveAccessibleName('Dog 26');

      await user.type(screen.getByPlaceholderText('Search dogs by name, breed, or owner...'), 'a');

      expect(mockBrowseDogsReturn.setFilters).toHaveBeenCalled();
      expect(cardLinks()[0]).toHaveAccessibleName('Dog 1');
    });

    it('clamps to the last available page when the roster shrinks underneath it', async () => {
      const user = userEvent.setup();
      const { rerender } = renderCards(60);

      await user.click(screen.getByRole('button', { name: 'Go to last page' }));
      expect(cardLinks()[0]).toHaveAccessibleName('Dog 51');

      const smaller = roster(26);
      mockBrowseDogsReturn = { ...mockBrowseDogsReturn, dogs: smaller, filteredDogs: smaller };
      rerender(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/dogs']}>
            <BrowseDogsPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Page 3 no longer exists; the grid must show page 2's single card, not
      // an empty grid over a non-empty result set.
      expect(cardLinks()).toHaveLength(1);
      expect(cardLinks()[0]).toHaveAccessibleName('Dog 26');
    });
  });
});
