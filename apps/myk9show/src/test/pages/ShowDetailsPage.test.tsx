import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ShowDetailsPage from '@/pages/ShowDetailsPage';
import { ShowWorkbenchSetupPage } from '@/pages/secretary/ShowWorkbenchSetupPage';

const publishExperienceMock = vi.hoisted(() => vi.fn());
const updateShowLocallyMock = vi.hoisted(() => vi.fn());
const notificationsSuccessMock = vi.hoisted(() => vi.fn());
const getEntriesForShowMock = vi.hoisted(() => vi.fn());
const getEntriesByShowMock = vi.hoisted(() => vi.fn());
const showEditPanelMock = vi.hoisted<{
  impl: (props: { onSave: (data: Record<string, unknown>) => Promise<void> }) => React.ReactNode;
}>(() => ({
  impl: () => null,
}));

// Mock auth context
const mockAuthContext = {
  user: { id: 'user-1' } as Record<string, unknown> | null,
  // A secretary's grant is club-scoped — canManageShowSurface narrows on the
  // show's own club, matching is_trial_secretary(club) on the server. A fixture
  // with isSecretary and no scope is a user who cannot exist.
  userWithRoles: {
    databaseUserId: 'person-1',
    scopes: [
      {
        userId: 'user-1',
        roleId: 'secretary',
        scopeType: 'club',
        scopeId: 'club-1',
        createdAt: new Date(),
      },
    ],
  } as Record<string, unknown> | null,
  isSecretary: false,
  isAdmin: false,
  hasRole: vi.fn(() => false),
  hasPermission: vi.fn(() => false),
  checkPermissionAsync: vi.fn().mockResolvedValue(false),
  refreshPermissions: vi.fn().mockResolvedValue(undefined),
  dbPermissions: [],
  rbacUserRoles: [],
  rbacScopedPermissions: [],
  rbacLoading: false,
  rbacError: null,
  rbacLastRefreshed: null,
  personId: 'person-1',
};
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthContext,
}));

// Mock show query
let mockShow: Record<string, unknown> | null = {
  id: 'show-1',
  name: 'Bluegrass Classic',
  startDate: '2026-03-22',
  endDate: '2026-03-23',
  location: 'Louisville, KY',
  clubName: 'Bluegrass KC',
  clubId: 'club-1',
  events: ['Agility'],
  status: 'Upcoming',
};
let mockLoading = false;
vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: mockLoading ? null : mockShow,
    isLoading: mockLoading,
    hasData: !mockLoading && !!mockShow,
    showId: mockShow?.id,
    isFromCache: false,
  }),
}));

let mockShowEntriesLoading = false;
let mockShowEntriesError = false;
const refetchShowEntriesMock = vi.hoisted(() => vi.fn());
let mockShowEntries: Array<{
  id: string;
  show_id?: string;
  dog_id?: string;
  class_id?: string;
  entry_status?: string;
  check_in_status?: string;
  dog?: { owner?: { id?: string } | null } | null;
}> = [];
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({
    data: mockShowEntries,
    isLoading: mockShowEntriesLoading,
    isError: mockShowEntriesError,
    refetch: refetchShowEntriesMock,
  }),
  useSecretaryShowEntriesQuery: () => ({
    data: mockShowEntries,
    isLoading: mockShowEntriesLoading,
    isSuccess: !mockShowEntriesLoading && !mockShowEntriesError,
    isError: mockShowEntriesError,
    refetch: refetchShowEntriesMock,
  }),
}));

vi.mock('@/services/database/entries', async () => {
  const actual = await vi.importActual<typeof import('@/services/database/entries')>(
    '@/services/database/entries'
  );
  return {
    ...actual,
    getEntriesForShow: getEntriesForShowMock,
    // The manager Entries tab's own private read (MYK9-630 AC3). Nothing on
    // this page may call it any more; the tests below assert that.
    getEntriesByShow: getEntriesByShowMock,
  };
});

let mockDogs: Array<{ id: string; ownerId: string }> = [];
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: mockDogs }),
}));

// Mock shows query
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsQuery: () => ({ data: mockShow ? [mockShow] : [] }),
  useUpdateShowMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  showQueryKeys: {
    detail: (showId: string) => ['shows', 'detail', showId],
    lists: () => ['shows', 'list'],
  },
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ updateShow: updateShowLocallyMock }),
}));

vi.mock('@/services/database/judges', () => ({
  persistShowJudgeAssignments: vi.fn(async () => undefined),
}));

vi.mock('@/features/experience/publishExperience', () => ({
  publishExperience: (args: unknown) => publishExperienceMock(args),
}));
vi.mock('@/lib/notifications', () => ({
  notifications: {
    error: vi.fn(),
    success: notificationsSuccessMock,
  },
}));
vi.mock('@/features/heritage/landing/HeritageLandingPage', () => ({
  HeritageLandingPage: ({ show }: { show: { style?: string | null } }) => (
    <div data-testid="heritage-landing">{show.style}</div>
  ),
}));
vi.mock('@/features/headline/landing/HeadlineLandingPage', () => ({
  HeadlineLandingPage: ({ show }: { show: { style?: string | null } }) => (
    <div data-testid="headline-landing">{show.style}</div>
  ),
}));
vi.mock('@/features/monogram/landing/MonogramLandingPage', () => ({
  MonogramLandingPage: ({ show }: { show: { style?: string | null } }) => (
    <div data-testid="monogram-landing">{show.style}</div>
  ),
}));
vi.mock('@/features/banner/landing/BannerLandingPage', () => ({
  BannerLandingPage: ({ show }: { show: { style?: string | null } }) => (
    <div data-testid="banner-landing">{show.style}</div>
  ),
}));

// Mock navigation performance
vi.mock('@/hooks/useNavigationPerformance', () => ({
  useNavigationPerformance: () => ({ endNavigation: vi.fn() }),
}));

vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => ({ status: 'synced', queueSize: 0 }),
}));

// Mock trial store
let mockTrials: Array<Record<string, unknown>> = [];
let mockTrialClasses: Record<string, Array<Record<string, unknown>>> = {};
vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      trials: mockTrials,
      trialClasses: mockTrialClasses,
      loadTrials: vi.fn(),
      loadTrialClasses: vi.fn(),
    };
    return selector(state);
  },
}));

// Mock heavy child components
vi.mock('@/components/shows/tabs/ShowOverviewTab', () => ({
  ShowOverviewTab: () => <div data-testid="show-overview-tab">ShowOverviewTab</div>,
}));
vi.mock('@/components/panels/edit/ShowEditPanel', () => ({
  ShowEditPanel: (props: { onSave: (data: Record<string, unknown>) => Promise<void> }) =>
    showEditPanelMock.impl(props),
}));
vi.mock('@/components/shows/ShowDetails/dialogs/DeleteShowDialog', () => ({
  default: () => null,
}));
// Mock tab content components
vi.mock('@/components/shows/tabs/MyEntriesTab', () => ({
  MyEntriesTab: () => <div data-testid="my-entries-tab">MyEntriesTab</div>,
}));
vi.mock('@/features/show-map/ShowMapTab', () => ({
  default: ({ canManageShow }: { canManageShow: boolean }) => (
    <div data-testid="show-map-tab" data-can-manage={String(canManageShow)}>
      ShowMapTab
    </div>
  ),
}));
vi.mock('@/components/shows/EntryList', () => ({
  EntryList: () => <div data-testid="entry-list">EntryList</div>,
}));
vi.mock('@/components/shows/ArmbandLookup', () => ({
  ArmbandLookup: () => null,
}));
vi.mock('@/hooks/queries/useArmbandLookup', () => ({
  useArmbandCount: () => ({ data: 0 }),
}));

// Mock shared primitives to pass through
vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-shell">{children}</div>
  ),
}));
vi.mock('@/components/common/PageHeader', () => ({
  PageHeader: () => <div data-testid="page-header" />,
}));
vi.mock('@/components/common/DetailHero', () => ({
  DetailHero: ({
    name,
    headerActions,
    primaryAction,
    secondaryActions,
    closedMessage,
    footer,
  }: {
    name: string;
    headerActions?: React.ReactNode;
    primaryAction?: { label: string; onClick: () => void };
    secondaryActions?: React.ReactNode;
    closedMessage?: string;
    footer?: React.ReactNode;
  }) => (
    <div data-testid="detail-hero">
      {name}
      {closedMessage && <div>{closedMessage}</div>}
      <div data-testid="hero-header-actions">{headerActions}</div>
      {primaryAction && <button data-testid="hero-action">{primaryAction.label}</button>}
      <div data-testid="hero-secondary-actions">{secondaryActions}</div>
      <div data-testid="hero-footer">{footer}</div>
    </div>
  ),
}));
vi.mock('@/components/common/NotFoundState', () => ({
  NotFoundState: () => <div data-testid="not-found">Show Not Found</div>,
}));
vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" className="animate-pulse" />,
}));

function renderPage(showId = 'show-1', subPath = '', query = '') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/shows/${showId}${subPath}${query}`]}>
        <Routes>
          <Route path="/shows/:id" element={<ShowDetailsPage />}>
            <Route
              path="show-day"
              element={<div data-testid="canonical-child">Show Desk child</div>}
            />
            {/* The REAL Setup page: `?tab=map|trials|classes` redirects here
                now (MYK9-630 phase 2), and a placeholder would let the redirect
                land somewhere that renders none of the three views. */}
            <Route path="setup" element={<ShowWorkbenchSetupPage />} />
            <Route path="entries" element={<div data-testid="canonical-entries-child" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function seedOwnedEntry(overrides: Partial<(typeof mockShowEntries)[number]> = {}): void {
  mockDogs = [{ id: 'dog-1', ownerId: 'person-1' }];
  mockShowEntries = [
    {
      id: 'entry-1',
      show_id: 'show-1',
      dog_id: 'dog-1',
      class_id: 'class-1',
      entry_status: 'confirmed',
      ...overrides,
    },
  ];
}

function makeGeneratedPremium(style: 'heritage' = 'heritage') {
  return {
    org: 'AKC',
    style,
    templateId: null,
    show: {
      name: 'Bluegrass Classic',
      startDate: '2026-03-22',
      endDate: '2026-03-23',
      venue: 'Louisville',
      entryOpenDate: null,
      entryCloseDate: null,
      preEntryFee: 25,
      dayOfFee: 30,
      acceptChecks: false,
      acceptCash: false,
    },
    club: { name: 'Bluegrass KC', logoUrl: null },
    secretary: { name: null, email: null, phone: null, mailingAddress: null },
    officials: { chairman: null, steward: null },
    trials: [
      {
        name: 'Trial 1',
        date: '2026-03-22',
        startTime: null,
        eventNumber: '20260001',
        type: 'Scent Work',
        judges: [{ name: 'Stale Judge', elements: ['Exterior'] }],
        classes: [],
      },
    ],
    supplemental: {
      vetClinic: null,
      accommodations: [],
      hospitalityNotes: 'Coffee provided.',
      awardsDescription: null,
      additionalNotes: null,
    },
    narratives: {
      showHours: 'Doors open at 7:00 AM.',
      trialInformation: 'Trial briefing at 8:00 AM.',
    },
  };
}

describe('ShowDetailsPage', () => {
  beforeEach(() => {
    mockShow = {
      id: 'show-1',
      name: 'Bluegrass Classic',
      startDate: '2026-03-22',
      endDate: '2026-03-23',
      location: 'Louisville, KY',
      clubName: 'Bluegrass KC',
      clubId: 'club-1',
      events: ['Agility'],
      status: 'Upcoming',
      entryOpenDate: '2026-01-01',
      entryCloseDate: '2027-12-31',
    };
    mockLoading = false;
    mockShowEntries = [];
    mockShowEntriesLoading = false;
    mockShowEntriesError = false;
    refetchShowEntriesMock.mockReset();
    getEntriesForShowMock.mockResolvedValue({ data: [], error: null });
    getEntriesByShowMock.mockReset();
    getEntriesByShowMock.mockResolvedValue({ data: [], error: null, resultsReadComplete: true });
    mockAuthContext.rbacLoading = false;
    mockDogs = [];
    mockTrials = [];
    mockTrialClasses = {};
    mockAuthContext.user = { id: 'user-1' };
    mockAuthContext.userWithRoles = {
      databaseUserId: 'person-1',
      scopes: [
        {
          userId: 'user-1',
          roleId: 'secretary',
          scopeType: 'club',
          scopeId: 'club-1',
          createdAt: new Date(),
        },
      ],
    };
    mockAuthContext.isSecretary = false;
    mockAuthContext.isAdmin = false;
    mockAuthContext.hasRole.mockReturnValue(false);
    publishExperienceMock.mockReset();
    updateShowLocallyMock.mockReset();
    notificationsSuccessMock.mockReset();
    updateShowLocallyMock.mockImplementation(
      async (id: string, updates: Record<string, unknown>) => ({
        ...mockShow,
        ...updates,
        id,
      })
    );
    showEditPanelMock.impl = () => null;
  });

  it('renders DetailHero with show name', () => {
    seedOwnedEntry();
    renderPage();
    expect(screen.getByText('Bluegrass Classic')).toBeInTheDocument();
  });

  it('renders exhibitor tabs: Overview, Trials, My Entries, Classes, Results', () => {
    seedOwnedEntry();
    renderPage();
    expect(screen.getByRole('tab', { name: /Overview/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Trials/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /My Entries/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Classes/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /My Stats/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Results/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Show Map/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /^Entries$/ })).toBeNull();
  });

  it('defaults to My Entries tab when user has entries', () => {
    seedOwnedEntry();
    renderPage();
    const tab = screen.getByRole('tab', { name: /My Entries/ });
    expect(tab.closest('[data-state="active"], [aria-selected="true"]')).toBeTruthy();
  });

  it('holds the exhibitor tabs while entry defaulting is loading', () => {
    mockShowEntriesLoading = true;
    renderPage();
    expect(screen.queryByRole('tab', { name: /Overview/ })).toBeNull();
    expect(document.querySelector('[class*="animate-pulse"]')).toBeInTheDocument();
  });

  it('keeps the public landing available without treating a failed entry read as zero', () => {
    mockShowEntriesError = true;
    renderPage();

    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
    expect(screen.queryByText("We couldn't load your entries. Please try again.")).toBeNull();
    expect(screen.queryByText('My Entries 0')).toBeNull();
  });

  it('preserves the anonymous public landing when the entry read fails', () => {
    mockAuthContext.user = null;
    mockAuthContext.userWithRoles = null;
    mockShowEntriesError = true;

    renderPage();

    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
    expect(screen.queryByText('My Entries 0')).toBeNull();
  });

  it('renders the default Monogram landing when user has no entries', () => {
    renderPage();
    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Overview/ })).toBeNull();
  });

  it('shows Add Classes when an owned dog has an active entry', () => {
    mockDogs = [{ id: 'dog-1', ownerId: 'person-1' }];
    mockShowEntries = [
      {
        id: 'entry-1',
        show_id: 'show-1',
        dog_id: 'dog-1',
        class_id: 'class-1',
        entry_status: 'confirmed',
      },
    ];
    renderPage();
    expect(screen.getByRole('button', { name: 'Add Classes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /My Entries/ })).toHaveTextContent('1');
  });

  it('uses the canonical entry owner when the independent dog store is cold', () => {
    mockShowEntries = [
      {
        id: 'entry-1',
        show_id: 'show-1',
        dog_id: 'dog-1',
        class_id: 'class-1',
        entry_status: 'confirmed',
        dog: { owner: { id: 'person-1' } },
      },
    ];

    renderPage();

    expect(screen.getByRole('tab', { name: /My Entries/ })).toHaveTextContent('1');
    expect(screen.queryByTestId('monogram-landing')).toBeNull();
  });

  it('keeps pulled or scratched owned entries visible as history without an active-entry CTA', () => {
    mockDogs = [{ id: 'dog-1', ownerId: 'person-1' }];
    mockShowEntries = [
      {
        id: 'entry-1',
        show_id: 'show-1',
        dog_id: 'dog-1',
        class_id: 'class-1',
        check_in_status: 'pulled',
      },
      {
        id: 'entry-2',
        show_id: 'show-1',
        dog_id: 'dog-1',
        class_id: 'class-2',
        entry_status: 'scratched',
      },
    ];
    renderPage();
    expect(screen.getByRole('tab', { name: /My Entries/ })).toHaveTextContent('2');
    expect(screen.queryByRole('button', { name: 'Add Classes' })).toBeNull();
  });

  // MYK9-387: the badge counts the exhibitor's whole entry HISTORY for this
  // show — terminal states included — minus the dead move-up source row. The
  // run-schedule header on the tab counts only runnable entries and says so;
  // see MyEntriesTab.countReconciliation.test.tsx for both figures together.
  it('counts withdrawn and promotion-expired entries in the My Entries badge, but not the dead move-up source', () => {
    mockDogs = [{ id: 'dog-1', ownerId: 'person-1' }];
    mockShowEntries = [
      {
        id: 'e1',
        show_id: 'show-1',
        dog_id: 'dog-1',
        class_id: 'class-1',
        entry_status: 'confirmed',
      },
      {
        id: 'e2',
        show_id: 'show-1',
        dog_id: 'dog-1',
        class_id: 'class-2',
        entry_status: 'withdrawn',
      },
      {
        id: 'e3',
        show_id: 'show-1',
        dog_id: 'dog-1',
        class_id: 'class-3',
        entry_status: 'promotion-expired',
      },
      { id: 'e4', show_id: 'show-1', dog_id: 'dog-1', class_id: 'class-4', entry_status: 'moved' },
      {
        id: 'e5',
        show_id: 'show-1',
        dog_id: 'dog-1',
        class_id: 'class-5',
        entry_status: 'confirmed',
      },
    ];
    renderPage();
    expect(screen.getByRole('tab', { name: /My Entries/ })).toHaveTextContent('4');
  });

  it('renders the default public landing for unauthenticated users', () => {
    mockAuthContext.user = null;
    renderPage();
    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Overview/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Show Map/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /My Entries/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /My Stats/ })).toBeNull();
  });

  it('renders NotFoundState when show does not exist', () => {
    mockShow = null;
    renderPage('nonexistent');
    expect(screen.getByText(/Not Found/)).toBeInTheDocument();
  });

  it('renders loading skeleton while loading', () => {
    mockLoading = true;
    const { container } = renderPage();
    expect(container.querySelector('[class*="animate-pulse"]')).toBeInTheDocument();
  });

  it('does not show the product-detail entry button for public users with no entries', () => {
    renderPage();
    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enter This Show' })).not.toBeInTheDocument();
  });

  it('renders the public landing when loaded trials have no classes', () => {
    mockTrials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];
    mockTrialClasses = { 'trial-1': [] };

    renderPage();

    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-hero')).not.toBeInTheDocument();
  });

  it('surfaces a "See classes" deep-link in the hero when the show has classes (UX-P2-04)', () => {
    seedOwnedEntry();
    mockTrials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];
    mockTrialClasses = { 'trial-1': [{ id: 'class-1', element: 'Container', level: 'Novice' }] };

    renderPage();

    const secondary = screen.getByTestId('hero-secondary-actions');
    expect(within(secondary).getByRole('button', { name: /see classes/i })).toBeInTheDocument();
    // Still alongside the primary entry action — the deep-link is additive.
    expect(within(secondary).getByRole('button', { name: 'Add Classes' })).toBeInTheDocument();
  });

  it('omits the "See classes" link when the show has no classes assigned', () => {
    seedOwnedEntry();
    mockTrials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];
    mockTrialClasses = { 'trial-1': [] };

    renderPage();

    expect(screen.queryByRole('button', { name: /see classes/i })).not.toBeInTheDocument();
  });

  it('shows "Add Classes" button when user has entries and entries are open', () => {
    seedOwnedEntry();
    renderPage();
    expect(screen.getByRole('button', { name: 'Add Classes' })).toBeInTheDocument();
  });

  it('shows "View Entry" button when user has entries and entries are closed', () => {
    mockShow = {
      ...mockShow,
      entryOpenDate: '2020-01-01',
      entryCloseDate: '2020-12-31',
    };
    seedOwnedEntry();
    renderPage();
    expect(screen.getByRole('button', { name: 'View Entry' })).toBeInTheDocument();
  });

  it('shows no action button when entries are closed and user has no entries', () => {
    mockShow = {
      ...mockShow,
      entryOpenDate: '2020-01-01',
      entryCloseDate: '2020-12-31',
    };
    renderPage();
    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enter This Show' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Classes' })).not.toBeInTheDocument();
  });

  it('does not render a separate Premium List edit button for show managers', () => {
    mockAuthContext.isSecretary = true;
    mockShow = {
      ...mockShow,
      organization: 'AKC',
    };

    renderPage();

    // Positive control that the MANAGER shell rendered at all -- otherwise the
    // absence below would pass on any page. It used to be the `...` trigger,
    // which MYK9-630 phase 1 deleted, then the section nav, which phase 2 did.
    expect(screen.getByRole('tab', { name: /^Setup$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /premium list/i })).toBeNull();
  });

  it('keeps show manager status in the hero header slot, with no overflow menu beside it', () => {
    mockAuthContext.isSecretary = true;

    renderPage();

    const heroActions = screen.getByTestId('hero-header-actions');
    expect(heroActions).toHaveTextContent('Upcoming');
    // MYK9-630 deleted the `...` menu that used to share this slot; the one
    // actions surface is the app header's Actions button.
    expect(screen.queryByRole('button', { name: /more show actions/i })).toBeNull();
    expect(screen.getByTestId('hero-secondary-actions')).toBeEmptyDOMElement();
  });

  it('gives a manager ONE row of six tabs and no standalone page links', () => {
    // MYK9-630 phase 2 (Richard: "there are 11 or more and difficult to tell if
    // they are tabs or links or buttons"). The five-link row above the old
    // six-tab strip is deleted: Show Desk, Entry Management, Reports, Results
    // and Submit Results are tabs now, not links beside tabs.
    mockAuthContext.isSecretary = true;

    renderPage();

    expect(
      screen.getAllByRole('tab').map(tab => tab.textContent?.replace(/\d+$/, '').trim())
    ).toEqual(['Overview', 'Setup', 'Entries', 'Show Day', 'Results', 'Reports']);
    expect(screen.queryByTestId('canonical-show-management-nav')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /show management section/i })).toBeNull();
    for (const label of ['Show Desk', 'Entry Management', 'Reports', 'Results', 'Submit Results']) {
      expect(screen.queryByRole('link', { name: label })).toBeNull();
    }
  });

  it('keeps the one tab row scrollable at phone widths with no fixed minimum width', () => {
    mockAuthContext.isSecretary = true;

    renderPage();

    const list = screen.getAllByRole('tab')[0].closest('[class*="overflow-x-auto"]');
    expect(list?.className).toContain('overflow-x-auto');
    expect(list?.className).toContain('max-w-full');
    // No min-w-* or fixed pixel widths that force desktop layout on phones
    expect(list?.className).not.toMatch(/min-w-\[/);
    expect(list?.className).not.toMatch(/w-\[\d/);
  });

  it('hides the six management tabs from exhibitors with entries', () => {
    seedOwnedEntry();
    renderPage();

    expect(screen.queryByTestId('canonical-show-management-nav')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Show Day$/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /^My Entries/ })).toBeInTheDocument();
  });

  it('does not expose preview public page or manage in workbench destinations for managers', () => {
    mockAuthContext.isSecretary = true;

    renderPage();

    // There is no menu left to open: Edit and Delete moved into the Show Edit
    // panel's own surface, Preview moved to the Overview landing card.
    expect(screen.queryByRole('button', { name: /more show actions/i })).toBeNull();
    expect(screen.getByRole('tab', { name: /^Setup$/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /preview public page/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /manage in workbench/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /manage in workbench/i })).not.toBeInTheDocument();
  });

  it('renders Show Desk below its compact context instead of the full hero', () => {
    mockAuthContext.isSecretary = true;

    renderPage('show-1', '/show-day');

    expect(screen.queryByTestId('detail-hero')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Show Desk context' })).toBeInTheDocument();
    expect(screen.getByTestId('canonical-child')).toHaveTextContent('Show Desk child');
    expect(screen.getByRole('tab', { name: /^Show Day$/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  // Regression: the Show Desk publish exception links to #setup-publish on the
  // primary Overview. The anchor must remain in the shared management shell so
  // the exception lands on the existing publish cards rather than a dead route.
  it('renders the #setup-publish anchor target on the primary Overview', () => {
    // isSecretary=true makes canManageShow true, which is the gate the anchor
    // renders under — so this also implicitly asserts that auth gate. If a
    // refactor moves the anchor behind a different gate, expect this to fail.
    mockAuthContext.isSecretary = true;
    // mockShow (beforeEach) has no publishedPremiumUrl/At/experienceIsPublished,
    // so the unpublished chip is what a secretary sees here.

    renderPage('show-1');

    expect(screen.queryByTestId('canonical-setup-child')).not.toBeInTheDocument();
    const anchorTarget = document.getElementById('setup-publish');
    expect(anchorTarget).toBeInTheDocument();
    // The chips emit href="#setup-publish-premium" / "#setup-publish-landing"
    // (see SetupAdaptiveHeader.test / setupReadinessSignals.test); matching
    // elements holding the actual cards mean the fragment jump lands on the
    // fix, not on an empty div.
    expect(document.getElementById('setup-publish-premium')).toHaveTextContent('Premium List');
    expect(document.getElementById('setup-publish-landing')).toBeInTheDocument();
  });

  it('renders canonical child sections instead of styled landing for direct management URLs', () => {
    mockAuthContext.user = null;
    mockAuthContext.userWithRoles = null;
    mockShow = {
      ...mockShow,
      style: 'headline',
    };

    renderPage('show-1', '/show-day');

    expect(screen.queryByTestId('headline-landing')).not.toBeInTheDocument();
    expect(screen.getByTestId('canonical-child')).toHaveTextContent('Show Desk child');
  });

  it('renders the public Show Map as read-only for show managers', async () => {
    mockAuthContext.isSecretary = true;
    getEntriesForShowMock.mockResolvedValue({ data: [], error: null });
    getEntriesByShowMock.mockReset();
    getEntriesByShowMock.mockResolvedValue({ data: [], error: null, resultsReadComplete: true });
    mockAuthContext.rbacLoading = false;
    mockTrials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];

    renderPage('show-1', '', '?tab=map');

    const showMap = await screen.findByTestId('show-map-tab');
    expect(showMap).toHaveAttribute('data-can-manage', 'false');
  });

  it('pauses manager entry-derived counts when secretary entries fail to load', async () => {
    mockAuthContext.isSecretary = true;
    mockShowEntries = [
      { id: 'replicated-entry-1', show_id: 'show-1', class_id: 'class-1' },
      { id: 'replicated-entry-2', show_id: 'show-1', class_id: 'class-1' },
    ];
    mockShowEntriesError = true;
    mockTrials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];
    mockTrialClasses = {
      'trial-1': [{ id: 'class-1', element: 'Container', level: 'Novice' }],
    };

    renderPage('show-1', '', '?tab=map');

    expect(await screen.findAllByText("Couldn't load entry counts.")).toHaveLength(2);
    expect(screen.getByTestId('hero-footer')).toHaveTextContent('Total EntriesUnavailable');
    expect(screen.queryByText('Total Entries0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('show-map-tab')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Entries$/ })).toBeInTheDocument();
  });

  it('uses the published experience style for public landing selection', () => {
    mockShow = {
      ...mockShow,
      style: 'poster',
      experienceIsPublished: true,
      experiencePublishedStyle: 'heritage',
    };

    renderPage();

    expect(screen.getByTestId('heritage-landing')).toHaveTextContent('heritage');
  });

  it('renders the Headline public landing for public visitors', () => {
    mockShow = {
      ...mockShow,
      style: 'headline',
    };

    renderPage();

    expect(screen.getByTestId('headline-landing')).toHaveTextContent('headline');
  });

  it('renders the Monogram public landing when style is explicit monogram', () => {
    mockShow = {
      ...mockShow,
      style: 'monogram',
    };

    renderPage();

    expect(screen.getByTestId('monogram-landing')).toHaveTextContent('monogram');
  });

  it('routes Banner-style shows to the dedicated BannerLandingPage', () => {
    mockShow = {
      ...mockShow,
      style: 'banner',
    };

    renderPage();

    expect(screen.getByTestId('banner-landing')).toHaveTextContent('banner');
    expect(screen.queryByTestId('monogram-landing')).toBeNull();
  });

  it('renders the Monogram public landing for shows with style=null', () => {
    mockShow = {
      ...mockShow,
      style: null,
      landing_style: null,
    };

    renderPage();

    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
    expect(screen.queryByTestId('heritage-landing')).toBeNull();
    expect(screen.queryByTestId('headline-landing')).toBeNull();
  });

  it('renders the Monogram public landing for shows with style="default"', () => {
    mockShow = {
      ...mockShow,
      style: 'default',
    };

    renderPage();

    expect(screen.getByTestId('monogram-landing')).toBeInTheDocument();
  });

  it('renders the tabbed UI for an authenticated exhibitor with entries, even on a styled show', () => {
    mockShow = {
      ...mockShow,
      style: 'headline',
    };
    seedOwnedEntry();

    renderPage();

    expect(screen.queryByTestId('headline-landing')).toBeNull();
    expect(screen.getByTestId('detail-hero')).toBeInTheDocument();
  });

  it('renders the tabbed UI for an authenticated exhibitor with entries on a default-style show', () => {
    mockShow = {
      ...mockShow,
      style: null,
      landing_style: null,
    };
    seedOwnedEntry();

    renderPage();

    expect(screen.queryByTestId('monogram-landing')).toBeNull();
    expect(screen.getByTestId('detail-hero')).toBeInTheDocument();
  });

  it('shows success feedback after saving show edits', async () => {
    const user = userEvent.setup();
    mockAuthContext.isSecretary = true;
    showEditPanelMock.impl = ({ onSave }) => (
      <button
        onClick={() =>
          onSave({
            name: 'Bluegrass Classic Renamed',
            status: 'upcoming',
            organization: 'AKC',
            clubId: 'club-1',
            startDate: '2026-03-22',
            endDate: '2026-03-23',
            assignedJudges: [],
          })
        }
      >
        save mocked edit panel
      </button>
    );

    renderPage();

    await user.click(screen.getByRole('button', { name: /save mocked edit panel/i }));

    await waitFor(() => {
      expect(notificationsSuccessMock).toHaveBeenCalledWith('Show changes saved');
    });
  });

  it('publishes experience after saving draft show changes when requested', async () => {
    const user = userEvent.setup();
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const setQueryDataSpy = vi.spyOn(QueryClient.prototype, 'setQueryData');
    mockAuthContext.isSecretary = true;
    showEditPanelMock.impl = ({ onSave }) => (
      <button
        onClick={() =>
          onSave({
            name: 'Bluegrass Classic Renamed',
            status: 'draft',
            organization: 'AKC',
            clubId: 'club-1',
            startDate: '2026-03-22',
            endDate: '2026-03-23',
            location: 'Lexington, KY',
            preEntryFee: '31.50',
            dayOfShowFee: '41',
            acceptCheckPayments: true,
            acceptCashPayments: true,
            assignedJudges: [
              {
                judgeId: 'judge-1',
                judgeName: 'Fresh Judge',
                assignedDate: '2026-01-01',
                assignedClasses: ['Container', 'Interior'],
              },
            ],
            style: 'heritage',
            publishExperience: true,
            generatedPremium: makeGeneratedPremium('heritage'),
            inkSaver: false,
          })
        }
      >
        save mocked edit panel
      </button>
    );

    renderPage();

    await user.click(screen.getByRole('button', { name: /save mocked edit panel/i }));

    expect(updateShowLocallyMock).toHaveBeenCalledWith(
      'show-1',
      expect.objectContaining({ name: 'Bluegrass Classic Renamed', style: 'heritage' })
    );
    expect(publishExperienceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        showId: 'show-1',
        inkSaver: false,
        premium: expect.objectContaining({
          style: 'heritage',
          show: expect.objectContaining({
            name: 'Bluegrass Classic Renamed',
            venue: 'Lexington, KY',
            preEntryFee: 31.5,
            dayOfFee: 41,
            acceptChecks: true,
            acceptCash: true,
          }),
          trials: expect.arrayContaining([
            expect.objectContaining({
              judges: [
                {
                  name: 'Fresh Judge',
                  elements: ['Container', 'Interior'],
                },
              ],
            }),
          ]),
        }),
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['shows', 'show-1', 'publish-info'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['shows', 'show-1', 'published-experience-content'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['shows', 'detail', 'show-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['shows', 'list'],
    });
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ['shows', 'detail', 'show-1'],
      expect.objectContaining({ style: 'heritage' })
    );
    expect(setQueryDataSpy).toHaveBeenCalledWith(['shows', 'list'], expect.any(Function));
  });

  it('computes per-trial entry counts from the entryCountByClassId index', async () => {
    // 1 trial, 2 classes, 3 entries split 2/1, plus 1 entry with undefined class_id
    mockTrials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];
    mockTrialClasses = {
      'trial-1': [
        {
          id: 'class-a',
          element: 'Container',
          level: 'Novice',
          section: '',
          judgeName: '',
          startTime: '',
          status: 'Scheduled',
          completedEntries: 0,
        },
        {
          id: 'class-b',
          element: 'Interior',
          level: 'Novice',
          section: '',
          judgeName: '',
          startTime: '',
          status: 'Scheduled',
          completedEntries: 0,
        },
      ],
    };
    mockShowEntries = [
      { id: 'e1', show_id: 'show-1', class_id: 'class-a' },
      { id: 'e2', show_id: 'show-1', class_id: 'class-a' },
      { id: 'e3', show_id: 'show-1', class_id: 'class-b' },
      // e4 has no class_id — must not contribute to any class's count
      { id: 'e4', show_id: 'show-1' },
    ];
    getEntriesForShowMock.mockResolvedValue({ data: mockShowEntries, error: null });
    mockAuthContext.isSecretary = true;

    renderPage('show-1', '', '?tab=trials');

    // TrialsTab renders "<count> entries" — trialStats for trial-1 = 3 (class-a:2 + class-b:1)
    // e4 has no class_id, so it must not be counted.
    const strong = await screen.findByText((content, el) => {
      return el?.tagName === 'STRONG' && content === '3';
    });
    expect(strong.closest('span')?.parentElement).toHaveTextContent('entries');
  });

  describe('manager deep links into the six tabs (MYK9-634, MYK9-630 AC3)', () => {
    beforeEach(() => {
      mockAuthContext.isSecretary = true;
    });

    // PIN, not a fix: this one also passes before the change, because the
    // `pending` audience already held the page while RBAC loaded. It is here so
    // the property cannot be lost. The mutation-proven guard is the next case.
    it('never mounts the exhibitor entries body for a manager whose roles are still resolving', () => {
      // ROOT CAUSE: `useShowManageGate` cannot tell "not a manager" from "not
      // resolved yet", and the exhibitor "My Entries" tab and the manager
      // "Entries" tab shared the id `my-entries`, so `useUrlTab` kept a cold
      // `?tab=my-entries` valid across the flip and mounted the EXHIBITOR body,
      // over the whole show's rows, for a secretary. Clicking the tab never did
      // — by then the scope had resolved. That is the deep-link/click asymmetry
      // the error boundary reported as "Failed to load component".
      mockAuthContext.rbacLoading = true;

      renderPage('show-1', '', '?tab=my-entries');

      expect(screen.queryByTestId('my-entries-tab')).toBeNull();
      expect(screen.queryByText('Failed to load component')).toBeNull();
    });

    // Mutation-proven: forcing `viewerRolesResolved` to `true` reds this case.
    it('does not offer the entries tab at all until roles have resolved', () => {
      mockAuthContext.isSecretary = false;
      mockAuthContext.rbacLoading = true;
      seedOwnedEntry();

      renderPage('show-1', '', '?tab=my-entries');

      expect(screen.queryByRole('tab', { name: /entries/i })).toBeNull();
      expect(screen.queryByTestId('my-entries-tab')).toBeNull();
    });

    it('sends a resolved manager from ?tab=my-entries to the Entries page', async () => {
      renderPage('show-1', '', '?tab=my-entries');

      expect(await screen.findByTestId('canonical-entries-child')).toBeInTheDocument();
      expect(screen.queryByTestId('my-entries-tab')).toBeNull();
    });

    it.each([
      ['?tab=trials', 'section=trials'],
      ['?tab=classes', 'section=classes'],
      ['?tab=map', 'section=map'],
    ])('sends a manager from %s into Setup', async (query, _section) => {
      renderPage('show-1', '', query);

      expect(await screen.findByRole('group', { name: /setup section/i })).toBeInTheDocument();
    });

    it("leaves an exhibitor's own ?tab=my-entries alone", async () => {
      mockAuthContext.isSecretary = false;
      seedOwnedEntry();

      renderPage('show-1', '', '?tab=my-entries');

      expect(await screen.findByTestId('my-entries-tab')).toBeInTheDocument();
      expect(screen.queryByTestId('canonical-entries-child')).toBeNull();
    });

    it("badges Entries from the page's own read, with no second entries query (AC3)", () => {
      mockShowEntries = [
        { id: 'e1', show_id: 'show-1', class_id: 'class-a' },
        { id: 'e2', show_id: 'show-1', class_id: 'class-a' },
        { id: 'e3', show_id: 'show-1', class_id: 'class-b' },
      ];

      renderPage();

      expect(screen.getByRole('tab', { name: /^Entries/ }).textContent).toContain('3');
      // The stub tab's private `getEntriesByShow` read is deleted, so the badge
      // and the body can no longer disagree (517 beside "No Entries Yet").
      expect(getEntriesByShowMock).not.toHaveBeenCalled();
    });
  });
});
