import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ShowDetailsPage from '@/pages/ShowDetailsPage';

const publishExperienceMock = vi.hoisted(() => vi.fn());
const updateShowLocallyMock = vi.hoisted(() => vi.fn());
const notificationsSuccessMock = vi.hoisted(() => vi.fn());
const showEditPanelMock = vi.hoisted<{
  impl: (props: { onSave: (data: Record<string, unknown>) => Promise<void> }) => React.ReactNode;
}>(() => ({
  impl: () => null,
}));

// Mock auth context
const mockAuthContext = {
  user: { id: 'user-1' } as Record<string, unknown> | null,
  userWithRoles: { databaseUserId: 'person-1' } as { databaseUserId?: string } | null,
  isSecretary: false,
  isAdmin: false,
  hasRole: vi.fn(() => false),
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

// Mock entries for "mine" detection
let mockUserEntries: Array<{ id: string; showId: string }> = [];
let mockUserEntriesLoading = false;
vi.mock('@/hooks/useMyEntries', () => ({
  useMyEntries: () => ({
    entries: mockUserEntries,
    entriesByClass: [],
    isLoading: mockUserEntriesLoading,
    isError: false,
  }),
}));

let mockShowEntriesLoading = false;
let mockShowEntries: Array<{
  id: string;
  show_id?: string;
  dog_id?: string;
  class_id?: string;
  entry_status?: string;
  check_in_status?: string;
}> = [];
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: mockShowEntries, isLoading: mockShowEntriesLoading }),
}));

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
    primaryAction,
    secondaryActions,
  }: {
    name: string;
    primaryAction?: { label: string; onClick: () => void };
    secondaryActions?: React.ReactNode;
  }) => (
    <div data-testid="detail-hero">
      {name}
      {primaryAction && <button data-testid="hero-action">{primaryAction.label}</button>}
      {secondaryActions}
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
              path="show-desk"
              element={<div data-testid="canonical-child">Show Desk child</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
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
      events: ['Agility'],
      status: 'Upcoming',
      entryOpenDate: '2026-01-01',
      entryCloseDate: '2027-12-31',
    };
    mockLoading = false;
    mockUserEntries = [];
    mockUserEntriesLoading = false;
    mockShowEntries = [];
    mockShowEntriesLoading = false;
    mockDogs = [];
    mockTrials = [];
    mockTrialClasses = {};
    mockAuthContext.user = { id: 'user-1' };
    mockAuthContext.userWithRoles = { databaseUserId: 'person-1' };
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
    renderPage();
    expect(screen.getByText('Bluegrass Classic')).toBeInTheDocument();
  });

  it('renders exhibitor tabs: Overview, Trials, My Entries, Classes, Results', () => {
    mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
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
    mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
    renderPage();
    const tab = screen.getByRole('tab', { name: /My Entries/ });
    expect(tab.closest('[data-state="active"], [aria-selected="true"]')).toBeTruthy();
  });

  it('holds the exhibitor tabs while entry defaulting is loading', () => {
    mockUserEntriesLoading = true;
    mockShowEntriesLoading = true;
    renderPage();
    expect(screen.queryByRole('tab', { name: /Overview/ })).toBeNull();
    expect(document.querySelector('[class*="animate-pulse"]')).toBeInTheDocument();
  });

  it('defaults to Overview tab when user has no entries', () => {
    mockUserEntries = [];
    renderPage();
    const tab = screen.getByText('Overview');
    expect(tab.closest('[data-state="active"], [aria-selected="true"]')).toBeTruthy();
  });

  it('shows Manage Entry when an owned dog has an active entry', () => {
    mockDogs = [{ id: 'dog-1', ownerId: 'person-1' }];
    mockShowEntries = [{ id: 'entry-1', show_id: 'show-1', dog_id: 'dog-1', class_id: 'class-1' }];
    renderPage();
    expect(screen.getByRole('button', { name: 'Manage Entry' })).toBeInTheDocument();
  });

  it('shows Enter This Show when owned dog entries are all pulled or scratched', () => {
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
    expect(screen.getByRole('button', { name: 'Enter This Show' })).toBeInTheDocument();
  });

  it('hides Show Map, My Entries and My Stats tabs for unauthenticated users', () => {
    mockAuthContext.user = null;
    renderPage();
    expect(screen.getByRole('tab', { name: /Overview/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Classes/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /My Entries/ })).toBeNull();
    // Results tab is now visible to all users (including unauthenticated)
    expect(screen.getByRole('tab', { name: /Results/ })).toBeInTheDocument();
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

  it('shows "Enter This Show" button when user has no entries and entries are open', () => {
    mockUserEntries = [];
    renderPage();
    expect(screen.getByRole('button', { name: 'Enter This Show' })).toBeInTheDocument();
  });

  it('shows "Manage Entry" button when user has entries and entries are open', () => {
    mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
    renderPage();
    expect(screen.getByRole('button', { name: 'Manage Entry' })).toBeInTheDocument();
  });

  it('shows "View Entry" button when user has entries and entries are closed', () => {
    mockShow = {
      ...mockShow,
      entryOpenDate: '2020-01-01',
      entryCloseDate: '2020-12-31',
    };
    mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
    renderPage();
    expect(screen.getByRole('button', { name: 'View Entry' })).toBeInTheDocument();
  });

  it('shows no action button when entries are closed and user has no entries', () => {
    mockShow = {
      ...mockShow,
      entryOpenDate: '2020-01-01',
      entryCloseDate: '2020-12-31',
    };
    mockUserEntries = [];
    renderPage();
    expect(screen.queryByRole('button', { name: 'Enter This Show' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage Entry' })).not.toBeInTheDocument();
  });

  it('does not render a separate Premium List edit button for show managers', () => {
    mockAuthContext.isSecretary = true;
    mockShow = {
      ...mockShow,
      organization: 'AKC',
    };

    renderPage();

    expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /premium list/i })).toBeNull();
  });

  it('shows canonical management nav for show managers', () => {
    mockAuthContext.isSecretary = true;

    renderPage();

    expect(screen.getByTestId('canonical-show-management-nav')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute(
      'href',
      '/shows/show-1/setup'
    );
    expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute(
      'href',
      '/shows/show-1/show-desk'
    );
    expect(screen.getByRole('link', { name: 'Entry Management' })).toHaveAttribute(
      'href',
      '/shows/show-1/entry-management'
    );
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/shows/show-1/reports'
    );
  });

  it('hides canonical management nav from exhibitors', () => {
    renderPage();

    expect(screen.queryByTestId('canonical-show-management-nav')).not.toBeInTheDocument();
  });

  it('does not expose preview public page or manage in workbench destinations for managers', () => {
    mockAuthContext.isSecretary = true;

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /more.*actions/i }));
    expect(screen.queryByRole('link', { name: /preview public page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /manage in workbench/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /manage in workbench/i })).not.toBeInTheDocument();
  });

  it('renders canonical child sections below the show hero', () => {
    mockAuthContext.isSecretary = true;

    renderPage('show-1', '/show-desk');

    expect(screen.getByTestId('detail-hero')).toBeInTheDocument();
    expect(screen.getByTestId('canonical-child')).toHaveTextContent('Show Desk child');
    expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('renders the public Show Map as read-only for show managers', async () => {
    mockAuthContext.isSecretary = true;
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

  it('does not render any styled landing for shows with style=null (preserves legacy behavior)', () => {
    mockShow = {
      ...mockShow,
      style: null,
      landing_style: null,
    };

    renderPage();

    expect(screen.queryByTestId('monogram-landing')).toBeNull();
    expect(screen.queryByTestId('heritage-landing')).toBeNull();
    expect(screen.queryByTestId('headline-landing')).toBeNull();
  });

  it('does not render any styled landing for shows with style="default"', () => {
    mockShow = {
      ...mockShow,
      style: 'default',
    };

    renderPage();

    expect(screen.queryByTestId('monogram-landing')).toBeNull();
  });

  it('renders the tabbed UI for an authenticated exhibitor with entries, even on a styled show', () => {
    mockShow = {
      ...mockShow,
      style: 'headline',
    };
    mockUserEntries = [{ id: 'entry-1', showId: 'show-1' }];

    renderPage();

    expect(screen.queryByTestId('headline-landing')).toBeNull();
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
});
