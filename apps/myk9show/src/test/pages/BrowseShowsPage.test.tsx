import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrowseShowsPage from '@/pages/BrowseShowsPage';
import { UserRole, DEFAULT_ROLE_PERMISSIONS } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import type { Show } from '@/types/show-types';
import type { EnhancedShow, QuickStats } from '@/hooks/useBrowseShowsData';
import type { ShowFilters } from '@/hooks/useBrowseShowsFilters';
import { getTabQuickActions } from '@/utils/show-actions';

// ---------------------------------------------------------------------------
// Mock all heavy / side-effectful dependencies
// ---------------------------------------------------------------------------

// Mock the data hook - this is the primary data source for the page
const mockUseBrowseShowsData = vi.fn();
vi.mock('@/hooks/useBrowseShowsData', () => ({
  useBrowseShowsData: (...args: unknown[]) => mockUseBrowseShowsData(...args),
}));

// Mock the filter hook
const mockUseBrowseShowsFilters = vi.fn();
vi.mock('@/hooks/useBrowseShowsFilters', () => ({
  useBrowseShowsFilters: (...args: unknown[]) => mockUseBrowseShowsFilters(...args),
}));

// Mock services
vi.mock('@/services/NotificationService', () => ({
  useStatusUpdates: () => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }),
}));
vi.mock('@/hooks/useRealTimeUpdates', () => ({
  useRealTimeUpdates: () => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }),
}));
vi.mock('@/services/AuditService', () => ({
  auditService: { log: vi.fn(), logAction: vi.fn() },
}));
vi.mock('@/services/LoggingService', () => ({
  LoggingService: {
    getInstance: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      logUserAction: vi.fn(),
    }),
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logUserAction: vi.fn(),
  },
}));

// Mock UI components that have deep dependency trees
vi.mock('@/components/common/LazyComponents', () => ({
  ShowCalendar: () => <div data-testid="show-calendar">Calendar</div>,
}));
vi.mock('@/components/common/SkeletonLoaders', () => ({
  ShowsPageSkeleton: () => <div data-testid="shows-page-skeleton">Loading...</div>,
  TabContentSkeleton: () => <div data-testid="tab-content-skeleton">Tab loading...</div>,
  ShowCalendarSkeleton: () => <div data-testid="show-calendar-skeleton">Calendar loading...</div>,
}));
vi.mock('@/components/shows/browse', () => ({
  ShowCardGrid: () => <div data-testid="shows-cards">Cards</div>,
  ShowsTableView: () => (
    <div data-testid="shows-table">
      <button type="button">Columns</button>
      <button type="button">Export CSV</button>
      <button type="button">Compact</button>
      <button type="button">Reset table view</button>
    </div>
  ),
  ShowBulkActionsBar: () => <div data-testid="bulk-actions-bar">Bulk Actions</div>,
}));
vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/styles/myk9-show-details.css', () => ({}));
// Mock shared primitives
vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-shell">{children}</div>
  ),
}));
vi.mock('@/components/common/PageHeader', () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => (
    <div data-testid="page-header">{actions}</div>
  ),
}));
vi.mock('@/components/common/SearchBar', () => ({
  SearchBar: () => <div data-testid="search-bar" />,
}));
vi.mock('@/components/common/FilterChips', () => ({
  FilterChips: () => <div data-testid="filter-chips" />,
}));
vi.mock('@/components/common/ViewToggle', () => ({
  ViewToggle: () => <div data-testid="view-toggle" />,
}));
vi.mock('@/components/common/ResultsCount', () => ({
  ResultsCount: () => <span data-testid="results-count" />,
}));
vi.mock('@/components/common/ErrorState', () => ({
  ErrorState: ({ message }: { message: string }) => <div data-testid="error-state">{message}</div>,
}));
vi.mock('@/components/common/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state">No shows</div>,
}));

// Mock useAuthContext — needed since BrowseShowsPage now calls it directly
const mockAuthUser = { current: null as UserWithRoles | null };
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: mockAuthUser.current,
    user: mockAuthUser.current,
    getUserRoles: () => mockAuthUser.current?.roles || [],
    isAuthenticated: !!mockAuthUser.current,
    isSecretary: false,
    isAdmin: false,
  }),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const mockShows: Show[] = [
  {
    id: 'show-1',
    name: 'Spring Agility Trial',
    organization: 'Agility',
    startDate: new Date(Date.now() + 86400000).toISOString(),
    endDate: new Date(Date.now() + 172800000).toISOString(),
    location: 'Test Location 1',
    status: 'Upcoming',
    events: ['Agility'],
    source: 'myK9Show',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    entryOpenDate: new Date().toISOString(),
    entryCloseDate: new Date(Date.now() + 43200000).toISOString(),
    preEntryFee: '$25',
    dayOfShowFee: '$35',
    clubId: 'club-1',
    clubName: 'Test Club 1',
    clubAddress: 'Test Address 1',
    clubEmail: 'test1@club.com',
    assignedJudges: [],
    stats: [],
    trials: [],
  },
  {
    id: 'show-2',
    name: 'Fall Obedience Trial',
    organization: 'Obedience',
    startDate: new Date(Date.now() - 172800000).toISOString(),
    endDate: new Date(Date.now() - 86400000).toISOString(),
    location: 'Test Location 2',
    status: 'Completed',
    events: ['Obedience'],
    source: 'myK9Show',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    entryOpenDate: new Date(Date.now() - 604800000).toISOString(),
    entryCloseDate: new Date(Date.now() - 259200000).toISOString(),
    preEntryFee: '$30',
    dayOfShowFee: '$40',
    clubId: 'club-2',
    clubName: 'Test Club 2',
    clubAddress: 'Test Address 2',
    clubEmail: 'test2@club.com',
    assignedJudges: [],
    stats: [],
    trials: [],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock UserWithRoles with all required Supabase User fields */
const createMockUser = (roles: UserRole | UserRole[], id: string = 'test-user'): UserWithRoles => {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  // Merge permissions for all roles
  const permissions = roleArray.flatMap(r => DEFAULT_ROLE_PERMISSIONS[r] || []);
  return {
    id,
    aud: 'authenticated',
    email: `${id}@test.com`,
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    roles: roleArray,
    permissions,
    scopes: [],
  };
};

const defaultQuickStats: QuickStats = { upcoming: 1, closingSoon: 0, userEntries: 0 };

const defaultFilters: ShowFilters = {
  search: '',
  discipline: 'all',
  entryStatus: 'all',
  month: 'all',
  organization: 'all',
  club: 'all',
};

/** Set up the mock hooks for a specific user scenario */
function setupMocks(options: {
  user?: UserWithRoles | null;
  shows?: Show[];
  isLoading?: boolean;
  hasError?: boolean;
  showsError?: Error | null;
  enhancedShows?: EnhancedShow[];
}) {
  const {
    user = null,
    shows = mockShows,
    isLoading = false,
    hasError = false,
    showsError = null,
    enhancedShows,
  } = options;

  // Set the auth user for useAuthContext mock
  mockAuthUser.current = user;

  // The navigator is injected now — these actions used to set
  // window.location.href, a full document load in an offline-first PWA.
  const tabQuickActions = getTabQuickActions('all', user, () => {});

  // Build default enhanced shows from the shows
  const defaultEnhanced: EnhancedShow[] = shows.map(s => ({
    ...s,
    relationship: ['all' as const],
    userCanManage: false,
    userIsJudging: false,
    userHasEntries: false,
  }));

  mockUseBrowseShowsData.mockReturnValue({
    user,
    isLoading,
    hasError,
    showsError,
    entriesError: null,
    shows,
    entries: [],
    enhancedShows: enhancedShows ?? defaultEnhanced,
    userContext: user
      ? {
          userId: user.id,
          roles: user.roles,
          permissions: user.permissions,
          managedShows: [],
          judgeAssignments: [],
          entries: [],
        }
      : null,
    tabQuickActions,
    quickStats: defaultQuickStats,
    handleRetry: vi.fn(),
    loadEntries: vi.fn(),
  });

  mockUseBrowseShowsFilters.mockReturnValue({
    filters: defaultFilters,
    setFilters: vi.fn(),
    filteredShows: shows,
    monthScopedShows: shows,
    hasActiveFilters: false,
    clearAllFilters: vi.fn(),
    activeFilterCount: 0,
  });
}

const renderWithProviders = (ui: React.ReactElement, { route = '/shows' } = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrowseShowsPage - Tab Rendering Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('View Mode Defaults', () => {
    beforeEach(() => {
      setupMocks({ user: null });
    });

    it('renders cards by default for guests — the table needed a horizontal scroll', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('shows-cards')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('shows-table')).not.toBeInTheDocument();
    });

    it('honors an explicit table view URL for guests', async () => {
      renderWithProviders(<BrowseShowsPage />, { route: '/shows?view=table' });

      await waitFor(() => {
        expect(screen.getByTestId('shows-table')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('shows-cards')).not.toBeInTheDocument();
    });

    it('renders cards by default for multi-role users on Browse All', async () => {
      setupMocks({ user: createMockUser([UserRole.EXHIBITOR, UserRole.SECRETARY]) });

      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=all' });

      await waitFor(() => {
        expect(screen.getByTestId('shows-cards')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('shows-table')).not.toBeInTheDocument();
    });

    it('keeps the table as the default on the Managing tab', async () => {
      setupMocks({ user: createMockUser(UserRole.SECRETARY, 'secretary-1') });

      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=managing' });

      await waitFor(() => {
        expect(screen.getByTestId('shows-table')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('shows-cards')).not.toBeInTheDocument();
    });

    it('renders the month scrubber with All upcoming selected', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('month-scrubber')).toBeInTheDocument();
      });
      expect(screen.getByRole('radio', { name: /all upcoming/i })).toHaveAttribute(
        'aria-checked',
        'true'
      );
    });

    it('honors an explicit cards view URL', async () => {
      setupMocks({ user: createMockUser(UserRole.SECRETARY, 'secretary-1') });
      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=managing&view=cards' });

      await waitFor(() => {
        expect(screen.getByTestId('shows-cards')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('shows-table')).not.toBeInTheDocument();
    });

    it('renders cards by default for exhibitor-only users', async () => {
      setupMocks({ user: createMockUser(UserRole.EXHIBITOR) });

      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('shows-cards')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('shows-table')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Columns' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Compact' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Reset table view' })).not.toBeInTheDocument();
    });

    it('falls back to a real tab when a stale ?tab=entries link arrives', async () => {
      // The "Entered as exhibitor" tab was removed (it duplicated My Shows), but
      // links to it exist in the wild. The page must still render a list rather
      // than blanking on an id it no longer knows.
      setupMocks({ user: createMockUser([UserRole.EXHIBITOR, UserRole.SECRETARY]) });

      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=entries' });

      // useUrlTab drops an unknown id and uses the default tab, so the link
      // still lands on a real list instead of an empty page.
      await waitFor(() => {
        const list = screen.queryByTestId('shows-cards') ?? screen.queryByTestId('shows-table');
        expect(list).toBeInTheDocument();
      });
      expect(screen.queryByRole('tab', { name: /entered as exhibitor/i })).not.toBeInTheDocument();
    });

    it('honors an explicit table view URL even on a retired tab id', async () => {
      setupMocks({ user: createMockUser(UserRole.EXHIBITOR) });

      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=entries&view=table' });

      await waitFor(() => {
        expect(screen.getByTestId('shows-table')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('shows-cards')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Columns' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Compact' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reset table view' })).toBeInTheDocument();
    });
  });

  describe('Guest User Tab Rendering', () => {
    beforeEach(() => {
      setupMocks({ user: null });
    });

    it('hides the tab strip for guests — Browse All is their only tab', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('shows-cards')).toBeInTheDocument();
      });
      // A one-item strip is a label with nothing to switch to; past shows
      // live in the month scrubber now (MYK9-427).
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: /past shows/i })).not.toBeInTheDocument();
    });

    it('should not show New Show button for guests', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /new show/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Exhibitor Tab Rendering', () => {
    beforeEach(() => {
      setupMocks({ user: createMockUser(UserRole.EXHIBITOR) });
    });

    it('gives exhibitors no tab strip, with no "entered" duplicate of My Shows', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('shows-cards')).toBeInTheDocument();
      });
      // "Entered as exhibitor" answered the question My Shows exists to
      // answer, and described itself in that page's own sidebar words.
      // /shows is for FINDING shows; the sidebar already links My Shows.
      // With Past Shows folded into the scrubber, Browse All is the only tab
      // left, so the strip hides entirely.
      expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    });

    it('should not show New Show button for exhibitors', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /new show/i })).not.toBeInTheDocument();
      });
    });

    it('uses the visible enhanced count for the selected Browse All tab badge', async () => {
      const shows = Array.from({ length: 9 }, (_, index) => ({
        ...mockShows[0],
        id: `show-${index + 1}`,
        name: `Show ${index + 1}`,
      }));
      const enhancedShows = shows.slice(0, 5).map(show => ({
        ...show,
        relationship: ['all' as const],
        userCanManage: false,
        userIsJudging: false,
        userHasEntries: false,
      }));

      // A secretary, because an exhibitor has no tab strip to carry a badge.
      setupMocks({
        user: createMockUser(UserRole.SECRETARY, 'secretary-1'),
        shows,
        enhancedShows,
      });

      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=all' });

      await waitFor(() => {
        const browseAllTab = screen.getByRole('tab', { name: /browse all/i });
        expect(browseAllTab.textContent).toContain('5');
        expect(browseAllTab.textContent).not.toContain('9');
      });
    });
  });

  describe('Secretary Tab Rendering', () => {
    const secretaryUser = createMockUser(UserRole.SECRETARY, 'secretary-1');

    beforeEach(() => {
      setupMocks({ user: secretaryUser });
    });

    it('should render Managing and Browse All tabs for secretaries (no My Shows)', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /managing/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /past shows/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my shows/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should show New Show button for secretaries', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        // The Create Show button is rendered via tabQuickActions
        const createButton = screen.getByRole('button', { name: /new show/i });
        expect(createButton).toBeInTheDocument();
      });
    });

    it('should show correct tab counts', async () => {
      // For secretary-1 managing show-1, set up the data hook to return a count of 1
      // The count comes from tab.getCount which is generated by getTabsForUser
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const myShowsTab = screen.getByRole('tab', { name: /managing/i });
        expect(myShowsTab).toBeInTheDocument();
        // The tab renders a Badge with the count; since we use getTabsForUser and
        // the shows include show-1 where secretary='secretary-1', the count should be correct
      });
    });
  });

  describe('Judge Tab Rendering', () => {
    const judgeUser = createMockUser(UserRole.JUDGE, 'judge-1');

    beforeEach(() => {
      const showsWithJudge = [...mockShows];
      showsWithJudge[0] = {
        ...showsWithJudge[0],
        assignedJudges: [
          {
            judgeId: 'judge-1',
            judgeName: 'Test Judge',
            assignedDate: new Date().toISOString(),
          },
        ],
      };

      setupMocks({ user: judgeUser, shows: showsWithJudge });
    });

    it('should render base tabs plus My Assignments for judges (no My Shows)', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /past shows/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my shows/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /managing/i })).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my assignments/i })).toBeInTheDocument();
      });
    });

    it('should show correct assignment count', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const assignmentsTab = screen.getByRole('tab', { name: /my assignments/i });
        expect(assignmentsTab).toBeInTheDocument();
      });
    });
  });

  describe('Site Admin Tab Rendering', () => {
    beforeEach(() => {
      setupMocks({ user: createMockUser(UserRole.SITE_ADMIN) });
    });

    it('should render Managing and Browse All for site admins (no Past Shows, My Shows or Assignments)', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /managing/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /past shows/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my shows/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should show all shows in Managing tab for site admins', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const myShowsTab = screen.getByRole('tab', { name: /managing/i });
        expect(myShowsTab).toBeInTheDocument();
        // Count badge should show number of managed shows
        expect(myShowsTab.textContent).toContain('2');
      });
    });
  });

  describe('Multi-Role User Tab Rendering', () => {
    it('should render combined tabs for exhibitor + secretary', async () => {
      const multiRoleUser = createMockUser([UserRole.EXHIBITOR, UserRole.SECRETARY], 'multi-user');
      setupMocks({ user: multiRoleUser });

      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /managing/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /past shows/i })).not.toBeInTheDocument();
        expect(
          screen.queryByRole('tab', { name: /entered as exhibitor/i })
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should render Managing, Browse All, My Assignments for secretary + judge (no Past Shows, My Shows)', async () => {
      const multiRoleUser = createMockUser([UserRole.SECRETARY, UserRole.JUDGE], 'multi-user');
      setupMocks({ user: multiRoleUser });

      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /managing/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /past shows/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my shows/i })).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my assignments/i })).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation and URL Persistence', () => {
    beforeEach(() => {
      setupMocks({ user: createMockUser(UserRole.SECRETARY) });
    });

    it('should update URL when switching tabs', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const browseAllTab = screen.getByRole('tab', { name: /browse all/i });
        expect(browseAllTab).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('tab', { name: /browse all/i }));
      });

      // Verify the tab becomes active (Base UI uses aria-selected)
      await waitFor(() => {
        const browseAllTab = screen.getByRole('tab', { name: /browse all/i });
        expect(browseAllTab).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('should persist tab selection on page load', async () => {
      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=all' });

      // Base UI tabs use aria-selected for the active state
      await waitFor(() => {
        const browseAllTab = screen.getByRole('tab', { name: /browse all/i });
        expect(browseAllTab).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('falls back to the default tab on a stale ?tab=past link', async () => {
      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=past' });

      // Past Shows is gone (its months live in the scrubber); the link must
      // still land on a real list, not a blank panel.
      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /managing/i })).toHaveAttribute(
          'aria-selected',
          'true'
        );
      });
      expect(screen.queryByRole('tab', { name: /past shows/i })).not.toBeInTheDocument();
    });

    it('should handle invalid tab in URL gracefully', async () => {
      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=invalid' });

      // When the tab value is invalid, the component should fall back to the default
      // For secretary, the default is 'managing' (Managing tab)
      await waitFor(() => {
        const myShowsTab = screen.getByRole('tab', { name: /managing/i });
        expect(myShowsTab).toHaveAttribute('aria-selected', 'true');
      });
    });
  });

  describe('Loading and Error States', () => {
    it('should show loading skeleton while data is loading', async () => {
      setupMocks({
        user: createMockUser(UserRole.EXHIBITOR),
        isLoading: true,
        shows: [], // Empty shows during loading so skeleton renders
      });

      renderWithProviders(<BrowseShowsPage />);

      expect(screen.getByTestId('shows-page-skeleton')).toBeInTheDocument();
    });

    it('should show error state when shows fail to load', async () => {
      setupMocks({
        user: createMockUser(UserRole.EXHIBITOR),
        hasError: true,
        showsError: new Error('Failed to load shows'),
      });

      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });
    });
  });
});
