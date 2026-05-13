import { render, screen, waitFor } from '@testing-library/react';
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
vi.mock('@/hooks/useMyEntries', () => ({
  useMyEntries: () => ({
    entries: mockUserEntries,
    entriesByClass: [],
    isLoading: false,
    isError: false,
  }),
}));

let mockShowEntries: Array<{
  id: string;
  show_id?: string;
  dog_id?: string;
  class_id?: string;
  entry_status?: string;
  check_in_status?: string;
}> = [];
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: mockShowEntries }),
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
vi.mock('@/components/shows/tabs/ClassesTab', () => ({
  ClassesTab: ({
    classes,
    userHasEntries,
  }: {
    classes: Array<{ userHasEntry: boolean }>;
    userHasEntries: boolean;
  }) => (
    <div
      data-testid="classes-tab"
      data-mine-count={classes.filter(cls => cls.userHasEntry).length}
      data-user-has-entries={String(userHasEntries)}
    >
      ClassesTab
    </div>
  ),
}));
vi.mock('@/components/shows/tabs/TrialsTab', () => ({
  TrialsTab: () => <div data-testid="trials-tab">TrialsTab</div>,
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

function renderPage(showId = 'show-1', query = '') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/shows/${showId}${query}`]}>
        <Routes>
          <Route path="/shows/:id" element={<ShowDetailsPage />} />
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
    mockShowEntries = [];
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

  it('renders tabs: Overview, Trials, Classes, Entries, Results', () => {
    mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
    renderPage();
    expect(screen.getByRole('tab', { name: /Overview/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Trials/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Classes/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Entries/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Results/ })).toBeInTheDocument();
  });

  it('defaults to Overview tab when user has entries', () => {
    mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
    renderPage();
    const tab = screen.getByRole('tab', { name: /Overview/ });
    expect(tab.closest('[data-state="active"], [aria-selected="true"]')).toBeTruthy();
  });

  it('defaults to Overview tab when user has no entries', () => {
    mockUserEntries = [];
    renderPage();
    const tab = screen.getByText('Overview');
    expect(tab.closest('[data-state="active"], [aria-selected="true"]')).toBeTruthy();
  });

  it('marks show classes as mine when an owned dog is entered', () => {
    mockDogs = [{ id: 'dog-1', ownerId: 'person-1' }];
    mockShowEntries = [
      { id: 'entry-1', show_id: 'show-1', dog_id: 'dog-1', class_id: 'class-1' },
      { id: 'entry-2', show_id: 'show-1', dog_id: 'dog-2', class_id: 'class-2' },
    ];
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
        { id: 'class-1', element: 'Container', level: 'Novice', status: 'scheduled' },
        { id: 'class-2', element: 'Interior', level: 'Advanced', status: 'scheduled' },
      ],
    };

    renderPage('show-1', '?tab=classes');

    const classesTab = screen.getByTestId('classes-tab');
    expect(classesTab).toHaveAttribute('data-mine-count', '1');
    expect(classesTab).toHaveAttribute('data-user-has-entries', 'true');
  });

  it('does not mark pulled entries as my classes', () => {
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
      { id: 'entry-3', show_id: 'show-1', dog_id: 'dog-1', class_id: 'class-3' },
    ];
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
        { id: 'class-1', element: 'Container', level: 'Novice A', status: 'scheduled' },
        { id: 'class-2', element: 'Container', level: 'Novice B', status: 'scheduled' },
        { id: 'class-3', element: 'Interior', level: 'Advanced', status: 'scheduled' },
      ],
    };

    renderPage('show-1', '?tab=classes');

    const classesTab = screen.getByTestId('classes-tab');
    expect(classesTab).toHaveAttribute('data-mine-count', '1');
    expect(classesTab).toHaveAttribute('data-user-has-entries', 'true');
  });

  it('hides Entries and Results tabs for unauthenticated users', () => {
    mockAuthContext.user = null;
    renderPage();
    expect(screen.getByRole('tab', { name: /Overview/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Classes/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Entries/ })).toBeNull();
    // Results tab is now visible to all users (including unauthenticated)
    expect(screen.getByRole('tab', { name: /Results/ })).toBeInTheDocument();
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
    const btn = screen.getByTestId('hero-action');
    expect(btn).toHaveTextContent('Enter This Show');
  });

  it('shows "Manage Entry" button when user has entries and entries are open', () => {
    mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
    renderPage();
    const btn = screen.getByTestId('hero-action');
    expect(btn).toHaveTextContent('Manage Entry');
  });

  it('shows "View Entry" button when user has entries and entries are closed', () => {
    mockShow = {
      ...mockShow,
      entryOpenDate: '2020-01-01',
      entryCloseDate: '2020-12-31',
    };
    mockUserEntries = [{ id: 'e1', showId: 'show-1' }];
    renderPage();
    const btn = screen.getByTestId('hero-action');
    expect(btn).toHaveTextContent('View Entry');
  });

  it('shows no action button when entries are closed and user has no entries', () => {
    mockShow = {
      ...mockShow,
      entryOpenDate: '2020-01-01',
      entryCloseDate: '2020-12-31',
    };
    mockUserEntries = [];
    renderPage();
    expect(screen.queryByTestId('hero-action')).not.toBeInTheDocument();
  });

  it('does not render a separate Premium List edit button for show managers', () => {
    mockAuthContext.isSecretary = true;
    mockShow = {
      ...mockShow,
      organization: 'AKC',
    };

    renderPage();

    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /premium list/i })).toBeNull();
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
