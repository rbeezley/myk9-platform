import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ShowDetailsPage from '@/pages/ShowDetailsPage';

const publishExperienceMock = vi.hoisted(() => vi.fn());
const updateShowLocallyMock = vi.hoisted(() => vi.fn());
const showEditPanelMock = vi.hoisted<{
  impl: (props: { onSave: (data: Record<string, unknown>) => Promise<void> }) => React.ReactNode;
}>(() => ({
  impl: () => null,
}));

// Mock auth context
const mockAuthContext = {
  user: { id: 'user-1' } as Record<string, unknown> | null,
  isSecretary: false,
  isAdmin: false,
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

// Mock navigation performance
vi.mock('@/hooks/useNavigationPerformance', () => ({
  useNavigationPerformance: () => ({ endNavigation: vi.fn() }),
}));

// Mock trial store
vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = { trials: [], trialClasses: {} };
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
  ClassesTab: () => <div data-testid="classes-tab">ClassesTab</div>,
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

function renderPage(showId = 'show-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/shows/${showId}`]}>
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
    trials: [],
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
    mockAuthContext.user = { id: 'user-1' };
    mockAuthContext.isSecretary = false;
    mockAuthContext.isAdmin = false;
    publishExperienceMock.mockReset();
    updateShowLocallyMock.mockReset();
    updateShowLocallyMock.mockImplementation(async (id: string, updates: Record<string, unknown>) => ({
      ...mockShow,
      ...updates,
      id,
    }));
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

  it('publishes experience after saving draft show changes when requested', async () => {
    const user = userEvent.setup();
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const setQueryDataSpy = vi.spyOn(QueryClient.prototype, 'setQueryData');
    mockAuthContext.isSecretary = true;
    showEditPanelMock.impl = ({ onSave }) => (
      <button
        onClick={() =>
          onSave({
            name: 'Bluegrass Classic',
            status: 'draft',
            organization: 'AKC',
            clubId: 'club-1',
            startDate: '2026-03-22',
            endDate: '2026-03-23',
            assignedJudges: [],
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
      expect.objectContaining({ style: 'heritage' })
    );
    expect(publishExperienceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        showId: 'show-1',
        inkSaver: false,
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['shows', 'show-1', 'publish-info'],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['shows', 'detail', 'show-1'],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['shows', 'list'],
    });
    expect(setQueryDataSpy).toHaveBeenCalledWith(
      ['shows', 'detail', 'show-1'],
      expect.objectContaining({ style: 'heritage' })
    );
    expect(setQueryDataSpy).toHaveBeenCalledWith(['shows', 'list'], expect.any(Function));
  });
});
