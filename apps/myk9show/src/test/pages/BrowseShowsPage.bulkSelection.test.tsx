import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrowseShowsPage from '@/pages/BrowseShowsPage';
import { UserRole, ScopeType } from '@/types/auth-types';
import type { UserWithRoles } from '@/types/auth-types';
import type { Show } from '@/types/show-types';
import type { EnhancedShow, QuickStats } from '@/hooks/useBrowseShowsData';
import type { ShowFilters } from '@/hooks/useBrowseShowsFilters';
import { getTabQuickActions } from '@/utils/show-actions';

// Codex P2 on PR #2566 (MYK9-798): `manageableShows` — the currently-visible,
// fully-filtered rows the page hands `useBulkSelection` — narrows on every
// search/discipline/club/month/radius change WITHOUT touching `resetKey`
// (`resetKey` only covers `selectedTab`/`filters.status`). Without
// `pruneToItems: true`, a show selected and then filtered out stays in the
// underlying id set and can resurface selected once the filter clears, per
// `useBulkSelection`'s own documented failure mode (see
// `hooks/__tests__/useBulkSelection.test.ts`).
//
// This file drives that exact wiring through the real page: it swaps what
// `useBrowseShowsData` hands back as `enhancedShows` (what a narrowing filter
// would produce) between renders, the same way the "Managing view-tab counts"
// block in BrowseShowsPage.test.tsx already does, rather than driving the
// real search input through a hook this file mocks anyway.

const mockUseBrowseShowsData = vi.fn();
vi.mock('@/hooks/useBrowseShowsData', () => ({
  useBrowseShowsData: (...args: unknown[]) => mockUseBrowseShowsData(...args),
}));

const mockUseBrowseShowsFilters = vi.fn();
vi.mock('@/hooks/useBrowseShowsFilters', () => ({
  useBrowseShowsFilters: (...args: unknown[]) => mockUseBrowseShowsFilters(...args),
}));

const mockUseViewerLocation = vi.fn();
vi.mock('@/features/location/useViewerLocation', () => ({
  useViewerLocation: (...args: unknown[]) => mockUseViewerLocation(...args),
}));

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

vi.mock('@/components/common/LazyComponents', () => ({
  ShowCalendar: () => <div data-testid="show-calendar">Calendar</div>,
}));
vi.mock('@/components/common/SkeletonLoaders', () => ({
  ShowsPageSkeleton: () => <div data-testid="shows-page-skeleton">Loading...</div>,
  TabContentSkeleton: () => <div data-testid="tab-content-skeleton">Tab loading...</div>,
  ShowCalendarSkeleton: () => <div data-testid="show-calendar-skeleton">Calendar loading...</div>,
}));

// Real selection wiring, unlike the plain-div mocks in BrowseShowsPage.test.tsx:
// ShowCardGrid renders a checkbox per row bound to isSelected/onToggleSelect,
// and ShowBulkActionsBar renders the exact selectedShows it was handed so a
// test can assert on both the count and which ids are present.
vi.mock('@/components/shows/browse', () => ({
  ShowCardGrid: ({
    shows,
    isSelected,
    onToggleSelect,
  }: {
    shows: EnhancedShow[];
    isSelected?: (show: EnhancedShow) => boolean;
    onToggleSelect?: (show: EnhancedShow) => void;
  }) => (
    <div data-testid="shows-cards">
      {shows.map(show => (
        <label key={show.id}>
          <input
            type="checkbox"
            aria-label={`Select ${show.name}`}
            checked={isSelected?.(show) ?? false}
            onChange={() => onToggleSelect?.(show)}
          />
          {show.name}
        </label>
      ))}
    </div>
  ),
  ShowsTableView: () => <div data-testid="shows-table" />,
  ShowBulkActionsBar: ({ selectedShows }: { selectedShows: EnhancedShow[] }) => (
    <div data-testid="bulk-actions-bar">
      <span data-testid="bulk-count">{selectedShows.length} selected</span>
      <ul>
        {selectedShows.map(show => (
          <li key={show.id} data-testid="bulk-selected-id">
            {show.id}
          </li>
        ))}
      </ul>
    </div>
  ),
}));

vi.mock('@/components/auth/PermissionGuard', () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/styles/myk9-show-details.css', () => ({}));
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
vi.mock('@/components/common/ErrorState', () => ({
  ErrorState: ({ message }: { message: string }) => <div data-testid="error-state">{message}</div>,
}));
vi.mock('@/components/common/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state">No shows</div>,
}));

const mockAuthUser = { current: null as UserWithRoles | null };
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    userWithRoles: mockAuthUser.current,
    user: mockAuthUser.current,
    getUserRoles: () => mockAuthUser.current?.roles || [],
    isAuthenticated: !!mockAuthUser.current,
    isSecretary: true,
    isAdmin: false,
    hasRole: (role: UserRole) => role === UserRole.SECRETARY,
  }),
}));

const baseShow: Show = {
  id: 'show-1',
  name: 'Spring Agility Trial',
  organization: 'Agility',
  startDate: new Date(Date.now() + 86400000).toISOString(),
  endDate: new Date(Date.now() + 172800000).toISOString(),
  location: 'Test Location 1',
  status: 'draft',
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
  clubName: 'Test Club',
  clubAddress: 'Test Address',
  clubEmail: 'test@club.com',
  assignedJudges: [],
  stats: [],
  trials: [],
};

const showA: Show = { ...baseShow, id: 'show-a', name: 'Show A' };
const showB: Show = { ...baseShow, id: 'show-b', name: 'Show B' };

function toEnhanced(shows: Show[]): EnhancedShow[] {
  return shows.map(s => ({
    ...s,
    relationship: ['managing' as const],
    userCanManage: true,
    userIsJudging: false,
    userHasEntries: false,
  }));
}

const defaultQuickStats: QuickStats = { upcoming: 2, closingSoon: 0, userEntries: 0 };
const defaultFilters: ShowFilters = {
  search: '',
  discipline: 'all',
  entryStatus: 'all',
  month: 'all',
  radius: 'all',
  organization: 'all',
  club: 'all',
  status: 'all',
};

function setupMocks(shows: Show[]) {
  const enhancedShows = toEnhanced(shows);
  const tabQuickActions = getTabQuickActions('all', mockAuthUser.current, () => {});

  mockUseBrowseShowsData.mockReturnValue({
    user: mockAuthUser.current,
    isLoading: false,
    hasError: false,
    showsError: null,
    showsOffline: false,
    entriesError: null,
    shows,
    entries: [],
    enhancedShows,
    userContext: {
      userId: mockAuthUser.current!.id,
      roles: mockAuthUser.current!.roles,
      permissions: mockAuthUser.current!.permissions,
      managedShows: shows.map(s => s.id),
      judgeAssignments: [],
      entries: [],
    },
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/shows?tab=managing&view=cards']}>
        <BrowseShowsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('BrowseShowsPage bulk selection prunes to visible rows (MYK9-798, Codex P2)', () => {
  const secretary: UserWithRoles = {
    id: 'secretary-1',
    aud: 'authenticated',
    email: 'secretary-1@test.com',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    roles: [UserRole.SECRETARY],
    permissions: [],
    scopes: [
      {
        userId: 'secretary-1',
        roleId: UserRole.SECRETARY,
        scopeType: ScopeType.CLUB,
        scopeId: 'club-1',
        createdAt: new Date(),
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser.current = secretary;
    mockUseViewerLocation.mockReturnValue({
      location: null,
      isResolving: false,
      chooseTyped: vi.fn(async () => true),
      useDeviceLocation: vi.fn(async () => true),
      chooseAnywhere: vi.fn(),
    });
  });

  it('drops a selected show from the bulk bar once a filter hides it, and does not resurrect it when the filter clears', async () => {
    const user = userEvent.setup();

    // Both shows visible — select both.
    setupMocks([showA, showB]);
    const { rerender } = renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Select Show A' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Show B' }));

    expect(screen.getByTestId('bulk-count')).toHaveTextContent('2 selected');
    expect(screen.getAllByTestId('bulk-selected-id').map(el => el.textContent)).toEqual([
      'show-a',
      'show-b',
    ]);

    // A search/discipline/club/month/radius filter narrows `enhancedShows` to
    // just Show A — the same shape change `manageableShows` sees when a real
    // filter applies, without touching `resetKey` (selectedTab/filters.status
    // are unchanged).
    setupMocks([showA]);
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/shows?tab=managing&view=cards']}>
          <BrowseShowsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('bulk-count')).toHaveTextContent('1 selected');
    const idsAfterFilter = screen.getAllByTestId('bulk-selected-id').map(el => el.textContent);
    expect(idsAfterFilter).toEqual(['show-a']);
    expect(idsAfterFilter).not.toContain('show-b');

    // Filter cleared — Show B is visible again but must NOT come back selected.
    setupMocks([showA, showB]);
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/shows?tab=managing&view=cards']}>
          <BrowseShowsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('bulk-count')).toHaveTextContent('1 selected');
    const idsAfterClear = screen.getAllByTestId('bulk-selected-id').map(el => el.textContent);
    expect(idsAfterClear).toEqual(['show-a']);
    expect(idsAfterClear).not.toContain('show-b');
    expect(
      within(screen.getByTestId('shows-cards')).getByRole('checkbox', { name: 'Select Show B' })
    ).not.toBeChecked();
  });
});
