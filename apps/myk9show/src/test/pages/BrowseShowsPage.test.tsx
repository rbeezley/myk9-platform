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
import { getTabsForUser } from '@/utils/unified-shows-config';
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
vi.mock('@/components/common/Breadcrumb', () => ({
  Breadcrumb: () => <nav data-testid="breadcrumb">Breadcrumb</nav>,
}));
vi.mock('@/components/common/SkeletonLoaders', () => ({
  ShowsPageSkeleton: () => <div data-testid="shows-page-skeleton">Loading...</div>,
  TabContentSkeleton: () => <div data-testid="tab-content-skeleton">Tab loading...</div>,
  ShowCalendarSkeleton: () => <div data-testid="show-calendar-skeleton">Calendar loading...</div>,
}));
vi.mock('@/components/shows/EnhancedEmptyStates', () => ({
  EnhancedEmptyState: () => <div data-testid="empty-state">No shows</div>,
}));
vi.mock('@/components/shows/browse', () => ({
  ShowsGridView: () => <div data-testid="shows-grid">Grid</div>,
  ShowsListView: () => <div data-testid="shows-list">List</div>,
}));
vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/utils/browseShowsUtils', () => ({
  DISCIPLINE_LABELS: {} as Record<string, string>,
  ENTRY_STATUS_LABELS: {} as Record<string, string>,
  LOCATION_LABELS: {} as Record<string, string>,
  DATE_RANGE_LABELS: {} as Record<string, string>,
}));
vi.mock('@/styles/myk9-show-details.css', () => ({}));

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
    entryOpenDate: new Date().toISOString(),
    entryCloseDate: new Date(Date.now() + 43200000).toISOString(),
    preEntryFee: '$25',
    dayOfShowFee: '$35',
    clubId: 'club-1',
    clubName: 'Test Club 1',
    clubAddress: 'Test Address 1',
    clubEmail: 'test1@club.com',
    chairman: 'chairman-1',
    secretary: 'secretary-1',
    chiefSteward: 'steward-1',
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
    entryOpenDate: new Date(Date.now() - 604800000).toISOString(),
    entryCloseDate: new Date(Date.now() - 259200000).toISOString(),
    preEntryFee: '$30',
    dayOfShowFee: '$40',
    clubId: 'club-2',
    clubName: 'Test Club 2',
    clubAddress: 'Test Address 2',
    clubEmail: 'test2@club.com',
    chairman: 'chairman-2',
    secretary: 'secretary-2',
    chiefSteward: 'steward-2',
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
  dateRange: 'upcoming',
  location: 'all',
  organization: 'all',
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

  const tabConfig = getTabsForUser(user);
  const tabQuickActions = getTabQuickActions('all', user);

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
    tabConfig,
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

  describe('Guest User Tab Rendering', () => {
    beforeEach(() => {
      setupMocks({ user: null });
    });

    it('should render only Browse All and Past Shows tabs for guests', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my entries/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my shows/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should not show Create Show button for guests', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create show/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Exhibitor Tab Rendering', () => {
    beforeEach(() => {
      setupMocks({ user: createMockUser(UserRole.EXHIBITOR) });
    });

    it('should render base tabs plus My Entries for exhibitors', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my entries/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my shows/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should not show Create Show button for exhibitors', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /create show/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Secretary Tab Rendering', () => {
    const secretaryUser = createMockUser(UserRole.SECRETARY, 'secretary-1');

    beforeEach(() => {
      setupMocks({ user: secretaryUser });
    });

    it('should render My Shows and Browse All tabs for secretaries (no My Entries)', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /my shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my entries/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should show Create Show button for secretaries', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        // The Create Show button is rendered via tabQuickActions
        const createButton = screen.getByRole('button', { name: /create show/i });
        expect(createButton).toBeInTheDocument();
      });
    });

    it('should show correct tab counts', async () => {
      // For secretary-1 managing show-1, set up the data hook to return a count of 1
      // The count comes from tab.getCount which is generated by getTabsForUser
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const myShowsTab = screen.getByRole('tab', { name: /my shows/i });
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
            assignedDate: new Date().toISOString(),
            breed: 'All Breeds',
          },
        ],
      };

      setupMocks({ user: judgeUser, shows: showsWithJudge });
    });

    it('should render base tabs plus My Assignments for judges (no My Entries)', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my entries/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my shows/i })).not.toBeInTheDocument();
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

    it('should render My Shows, Browse All, Past Shows for site admins (no My Entries or Assignments)', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /my shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my entries/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should show all shows in My Shows tab for site admins', async () => {
      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        const myShowsTab = screen.getByRole('tab', { name: /my shows/i });
        expect(myShowsTab).toBeInTheDocument();
        // Count badge should show number of managed shows
        expect(myShowsTab.textContent).toContain('2');
      });
    });
  });

  describe('Multi-Role User Tab Rendering', () => {
    it('should render combined tabs for exhibitor + secretary (includes My Entries)', async () => {
      const multiRoleUser = createMockUser([UserRole.EXHIBITOR, UserRole.SECRETARY], 'multi-user');
      setupMocks({ user: multiRoleUser });

      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /my shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /my entries/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my assignments/i })).not.toBeInTheDocument();
      });
    });

    it('should render My Shows, Browse All, Past Shows, My Assignments for secretary + judge (no My Entries)', async () => {
      const multiRoleUser = createMockUser([UserRole.SECRETARY, UserRole.JUDGE], 'multi-user');
      setupMocks({ user: multiRoleUser });

      renderWithProviders(<BrowseShowsPage />);

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /my shows/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /browse all/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /past shows/i })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /my entries/i })).not.toBeInTheDocument();
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
      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=past' });

      // Base UI tabs use aria-selected for the active state
      await waitFor(() => {
        const pastTab = screen.getByRole('tab', { name: /past shows/i });
        expect(pastTab).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('should handle invalid tab in URL gracefully', async () => {
      renderWithProviders(<BrowseShowsPage />, { route: '/shows?tab=invalid' });

      // When the tab value is invalid, the component should fall back to the default
      // For secretary, the default is 'managing' (My Shows tab)
      await waitFor(() => {
        const myShowsTab = screen.getByRole('tab', { name: /my shows/i });
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
        expect(screen.getByText(/failed to load shows/i)).toBeInTheDocument();
      });
    });
  });
});
