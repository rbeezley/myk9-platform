import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, ProtectedRoute } from '@/context/AuthContext';
import ShowWorkbenchPage from '@/pages/secretary/ShowWorkbenchPage';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { UserRole } from '@/types/auth-types';

const navigateMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());

let mockShow: Record<string, unknown> | null = {
  id: 'show-1',
  name: 'Bluegrass Classic',
  organization: 'AKC',
  startDate: '2026-03-22',
  endDate: '2026-03-23',
  location: 'Louisville, KY',
  clubName: 'Bluegrass KC',
  status: 'accepting_entries',
  events: [],
  source: 'myK9Show',
  entryOpenDate: '2026-01-01',
  entryCloseDate: '2027-12-31',
  preEntryFee: '$30',
  clubId: 'club-1',
  clubAddress: '',
  clubEmail: '',
  logoUrl: '',
  coverImageUrl: '',
  accentColor: '',
  assignedJudges: [],
  stats: [],
  trials: [],
};
let mockLoading = false;
let mockError = false;
let mockTrials: Array<Record<string, unknown>> = [];
let mockTrialClasses: Record<string, Array<Record<string, unknown>>> = {};
let mockShowEntries: Array<Record<string, unknown>> = [];
let mockResultSubmissions: Array<Record<string, unknown>> = [];

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getUserRoles: vi.fn().mockResolvedValue([]),
    getUserRolesByEmail: vi.fn().mockResolvedValue([]),
    hasPermission: vi.fn().mockResolvedValue(false),
  },
}));

vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: (showId?: string) => ({
    showId: showId ?? null,
    show: mockLoading ? null : mockShow,
    isLoading: mockLoading,
    isError: mockError,
    refetch: refetchMock,
    isFromCache: false,
    loadTime: 0,
    hasData: !!mockShow,
  }),
}));

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: mockShowEntries }),
}));

vi.mock('@/hooks/queries/useShowJudges', () => ({
  useShowJudges: () => ({ data: [] }),
}));

vi.mock('@/hooks/mutations/useResultSubmission', () => ({
  useResultSubmissions: () => ({ data: mockResultSubmissions }),
}));

vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      trials: mockTrials,
      trialClasses: mockTrialClasses,
      loadTrials: vi.fn(),
      loadTrialClasses: vi.fn(),
    }),
}));

vi.mock('@/features/premium/PremiumDownloadCard', () => ({
  PremiumDownloadCard: ({ showId }: { showId: string }) => (
    <div data-testid="premium-download-card">{showId}</div>
  ),
}));

vi.mock('@/features/premium/LandingPageCard', () => ({
  LandingPageCard: ({ showId }: { showId: string }) => (
    <div data-testid="landing-page-card">{showId}</div>
  ),
}));

vi.mock('@/components/shows/overview/ScheduleSummary', () => ({
  ScheduleSummary: ({ showId }: { showId: string }) => (
    <div data-testid="schedule-summary">{showId}</div>
  ),
}));

vi.mock('@/components/shows/overview/VenueMap', () => ({
  VenueMap: ({ location }: { location: string }) => <div data-testid="venue-map">{location}</div>,
}));

vi.mock('@/components/shows/overview/ShowOfficials', () => ({
  ShowOfficials: ({ showId }: { showId: string }) => (
    <div data-testid="show-officials">{showId}</div>
  ),
}));

vi.mock('@/components/shows/overview/JudgesList', () => ({
  JudgesList: ({ judges }: { judges?: unknown[] }) => (
    <div data-testid="judges-list">{judges?.length ?? 0} judges</div>
  ),
}));

vi.mock('@/components/secretary/MyK9QAccessCard', () => ({
  MyK9QAccessCard: ({ showId, showName }: { showId: string; showName?: string }) => (
    <div data-testid="myk9q-access" data-show-id={showId}>
      {showName}
    </div>
  ),
}));

vi.mock('@/features/show-map/ShowMapTab', () => ({
  default: ({
    show,
    trials,
    classes,
    entries,
    canManageShow,
    initialDayScope,
    initialCompletionScope,
    actionPhase,
  }: {
    show: { id: string };
    trials: unknown[];
    classes: unknown[];
    entries: unknown[];
    canManageShow: boolean;
    initialDayScope?: string;
    initialCompletionScope?: string;
    actionPhase?: string;
  }) => (
    <div
      data-testid="show-map-tab"
      data-show-id={show.id}
      data-trial-count={trials.length}
      data-submitted-trial-count={
        trials.filter(trial => {
          if (!trial || typeof trial !== 'object') return false;
          return Boolean((trial as { resultSubmittedAt?: unknown }).resultSubmittedAt);
        }).length
      }
      data-class-count={classes.length}
      data-has-ring={String(
        classes.some(cls => typeof cls === 'object' && cls !== null && 'ring' in cls)
      )}
      data-entry-count={entries.length}
      data-can-manage={String(canManageShow)}
      data-initial-day-scope={initialDayScope ?? ''}
      data-initial-completion-scope={initialCompletionScope ?? ''}
      data-action-phase={actionPhase ?? ''}
    />
  ),
}));

vi.mock('@/features/show-workbench/WorkbenchLateEntryAction', () => ({
  WorkbenchLateEntryAction: ({ showId }: { showId: string }) => (
    <button type="button" data-testid="late-entry-action">
      Add late entry for {showId}
    </button>
  ),
}));

vi.mock('@/features/show-workbench/IncidentLogCard', () => ({
  IncidentLogCard: ({
    entries,
    judges,
    showId,
  }: {
    entries: unknown[];
    judges: unknown[];
    showId: string;
  }) => (
    <section
      data-testid="incident-log-card"
      data-entry-count={entries.length}
      data-judge-count={judges.length}
    >
      Incident log for {showId}
    </section>
  ),
}));

vi.mock('@/features/show-workbench/IncidentCloseoutSummary', () => ({
  IncidentCloseoutSummary: ({ showId }: { showId: string }) => (
    <section data-testid="incident-closeout-summary">Incident closeout for {showId}</section>
  ),
}));

vi.mock('react-router-dom', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-shell">{children}</div>
  ),
}));

vi.mock('@/components/common/PageHeader', () => ({
  PageHeader: ({
    breadcrumbs,
    title,
    actions,
  }: {
    breadcrumbs: Array<{ label: string }>;
    title: string;
    actions?: React.ReactNode;
  }) => (
    <header data-testid="page-header">
      <h1>{title}</h1>
      <span>{breadcrumbs.map(crumb => crumb.label).join(' / ')}</span>
      {actions}
    </header>
  ),
}));

vi.mock('@/components/common/DetailHero', () => ({
  DetailHero: ({
    name,
    subtitle,
    badges,
    footer,
    secondaryActions,
  }: {
    name: string;
    subtitle?: string;
    badges?: Array<{ label: string }>;
    footer?: React.ReactNode;
    secondaryActions?: React.ReactNode;
  }) => (
    <section data-testid="detail-hero">
      <h2>{name}</h2>
      {subtitle && <p>{subtitle}</p>}
      {badges?.map(badge => (
        <span key={badge.label}>{badge.label}</span>
      ))}
      {secondaryActions}
      {footer}
    </section>
  ),
}));

vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="loading-skeleton" className="animate-pulse" />,
}));

vi.mock('@/components/common/ErrorState', () => ({
  ErrorState: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div data-testid="error-state">
      {message}
      {onRetry && <button onClick={onRetry}>Try Again</button>}
    </div>
  ),
}));

vi.mock('@/components/common/NotFoundState', () => ({
  NotFoundState: ({ entityName }: { entityName: string }) => (
    <div data-testid="not-found">{entityName} Not Found</div>
  ),
}));

vi.mock('@/components/shows/overview/QuickInfoCards', () => ({
  QuickInfoCards: ({ show }: { show: { id: string } }) => (
    <div data-testid="quick-info">{show.id}</div>
  ),
}));

vi.mock('@/components/shows/ShowDateBlock', () => ({
  ShowDateBlock: () => <div data-testid="show-date-block" />,
}));

vi.mock('@/components/shows/ShowStatusPill', () => ({
  ShowStatusPill: ({ status }: { status: string }) => <div data-testid="show-status">{status}</div>,
}));

function makeAuthReturn(email: string | null) {
  return {
    user: email ? { id: 'u1', email } : null,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}

function renderWorkbench(initialPath = '/secretary/shows/show-1', email = 'secretary@example.com') {
  mockUseAuth.mockReturnValue(makeAuthReturn(email));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/sign-in" element={<div data-testid="sign-in">Sign In</div>} />
            <Route
              path="/secretary/shows/:showId"
              element={
                <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
                  <ShowWorkbenchPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('ShowWorkbenchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShow = {
      id: 'show-1',
      name: 'Bluegrass Classic',
      organization: 'AKC',
      startDate: '2026-03-22',
      endDate: '2026-03-23',
      location: 'Louisville, KY',
      clubName: 'Bluegrass KC',
      status: 'accepting_entries',
      events: [],
      source: 'myK9Show',
      entryOpenDate: '2026-01-01',
      entryCloseDate: '2027-12-31',
      preEntryFee: '$30',
      clubId: 'club-1',
      clubAddress: '',
      clubEmail: '',
      logoUrl: '',
      coverImageUrl: '',
      accentColor: '',
      assignedJudges: [],
      stats: [],
      trials: [],
    };
    mockLoading = false;
    mockError = false;
    mockTrials = [];
    mockTrialClasses = {};
    mockShowEntries = [];
    mockResultSubmissions = [];
    useAskQPanelStore.getState().close();
    window.localStorage.clear();
  });

  it('renders the workbench shell for a secretary', async () => {
    renderWorkbench();

    await waitFor(() => {
      expect(screen.getByTestId('detail-hero')).toHaveTextContent('Bluegrass Classic');
    });
    expect(screen.getByRole('tab', { name: /Setup/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Today/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Wrap-up/ })).toBeInTheDocument();
    expect(screen.getByTestId('quick-info')).toHaveTextContent('show-1');
  });

  it('honors the phase URL param', async () => {
    renderWorkbench('/secretary/shows/show-1?phase=today');

    const todayTab = await screen.findByRole('tab', { name: /Today/ });
    expect(todayTab).toHaveAttribute('aria-selected', 'true');
  });

  it('updates phase when a tab is selected', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(await screen.findByRole('tab', { name: /Wrap-up/ }));

    expect(screen.getByRole('tab', { name: /Wrap-up/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders Setup panels without public-discovery panels', async () => {
    renderWorkbench('/secretary/shows/show-1');

    expect(await screen.findByRole('heading', { name: 'About Setup' })).toBeInTheDocument();
    expect(
      screen.getByText(/confirm the schedule, judges, show page, and materials/i)
    ).toBeInTheDocument();
    expect(await screen.findByTestId('premium-download-card')).toHaveTextContent('show-1');
    expect(screen.getByRole('heading', { name: '1 of 5 handled' })).toBeInTheDocument();
    expect(screen.getByText('Trials are added')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What do I do if...' })).toBeInTheDocument();
    expect(screen.getByTestId('landing-page-card')).toHaveTextContent('show-1');
    expect(screen.getByTestId('schedule-summary')).toHaveTextContent('show-1');
    expect(screen.getByTestId('venue-map')).toHaveTextContent('Louisville, KY');
    expect(screen.getByTestId('show-officials')).toHaveTextContent('show-1');
    expect(screen.getByTestId('judges-list')).toBeInTheDocument();
    expect(screen.queryByTestId('myk9q-access')).not.toBeInTheDocument();
  });

  it('renders Today operational surfaces with show-map data', async () => {
    const user = userEvent.setup();
    mockTrials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        order: '1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];
    mockTrialClasses = {
      'trial-1': [
        {
          id: 'class-1',
          element: 'Container',
          level: 'Novice A',
          section: 'A',
          status: 'scheduled',
        },
      ],
    };
    mockShowEntries = [{ id: 'entry-1', class_id: 'class-1' }];

    renderWorkbench('/secretary/shows/show-1?phase=today');

    expect(await screen.findByRole('heading', { name: 'About Today' })).toBeInTheDocument();
    expect(screen.getByText(/keep rings moving/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Late entry help' })).toBeInTheDocument();
    expect(await screen.findByText('Entries are loaded')).toBeInTheDocument();
    const showMap = await screen.findByTestId('show-map-tab');
    const deskTools = screen.getByRole('button', { name: /desk tools/i });
    expect(showMap.compareDocumentPosition(deskTools) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );

    await user.click(deskTools);

    expect(screen.getByTestId('late-entry-action')).toHaveTextContent('Add late entry for show-1');
    expect(screen.getByRole('heading', { name: 'Judge hospitality' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Quick broadcast' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Message a class' })).toBeInTheDocument();
    expect(screen.getByTestId('incident-log-card')).toHaveTextContent('Incident log for show-1');
    expect(screen.getByTestId('incident-log-card')).toHaveAttribute('data-entry-count', '1');
    expect(screen.getByRole('heading', { name: 'Schedule delay script' })).toBeInTheDocument();
    expect((screen.getByLabelText('PA script') as HTMLTextAreaElement).value).toContain(
      'Container Novice A will start later than the posted schedule.'
    );
    expect(await screen.findByTestId('myk9q-access')).toHaveAttribute('data-show-id', 'show-1');
    expect(showMap).toHaveAttribute('data-show-id', 'show-1');
    expect(showMap).toHaveAttribute('data-trial-count', '1');
    expect(showMap).toHaveAttribute('data-class-count', '1');
    expect(showMap).toHaveAttribute('data-has-ring', 'false');
    expect(showMap).toHaveAttribute('data-entry-count', '1');
    expect(showMap).toHaveAttribute('data-can-manage', 'true');
  });

  it('renders Wrap-up links to existing closeout surfaces', async () => {
    mockTrials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        order: '1',
        trialDate: '2026-03-22',
        trialNumber: '1',
        name: 'Trial 1',
      },
    ];
    mockTrialClasses = {
      'trial-1': [
        {
          id: 'class-1',
          element: 'Container',
          level: 'Novice A',
          section: 'A',
          status: 'completed',
        },
      ],
    };
    mockResultSubmissions = [
      {
        id: 'submission-1',
        show_id: 'show-1',
        trial_id: null,
        submitted_at: '2026-03-22T20:00:00Z',
        status: 'sent',
      },
    ];
    mockShowEntries = [
      {
        id: 'late-cash',
        class_id: 'class-1',
        is_day_of_show: true,
        entry_fee: 35,
        payment_status: 'paid',
        payment_method: 'cash',
      },
      {
        id: 'early-online',
        class_id: 'class-1',
        is_day_of_show: false,
        entry_fee: 30,
        payment_status: 'paid',
        payment_method: 'online',
      },
      {
        id: 'paid-scratch',
        class_id: 'class-1',
        entry_fee: 35,
        entry_status: 'scratched',
        check_in_status: 'pulled',
        payment_status: 'paid',
      },
    ];

    renderWorkbench('/secretary/shows/show-1?phase=wrap-up');

    expect(await screen.findByRole('heading', { name: 'About Wrap-up' })).toBeInTheDocument();
    expect(screen.getByText(/submit final files/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Show-day reconciliation' })).toBeInTheDocument();
    expect(screen.getByTestId('incident-closeout-summary')).toHaveTextContent(
      'Incident closeout for show-1'
    );
    expect(
      within(screen.getByRole('group', { name: 'Collected late-entry fees' })).getByText('$35.00')
    ).toBeInTheDocument();
    expect(screen.getByText('1 pulled · 1 review')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Show entries' })).getByText('1 day-of')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Manual refund review' })).getByText(
        '$35.00 paid entries'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit results' })).toBeInTheDocument();
    expect(await screen.findByText('Classes are complete')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Results Control/ })).toHaveAttribute(
      'href',
      '/secretary/results-control'
    );
    expect(screen.getByRole('link', { name: /Reports/ })).toHaveAttribute(
      'href',
      '/secretary/reports'
    );
    expect(screen.getByRole('link', { name: /Submit Results/ })).toHaveAttribute(
      'href',
      '/secretary/results-submission'
    );
    const showMap = await screen.findByTestId('show-map-tab');
    expect(showMap).toHaveAttribute('data-show-id', 'show-1');
    expect(showMap).toHaveAttribute('data-initial-day-scope', 'all');
    expect(showMap).toHaveAttribute('data-initial-completion-scope', 'completed');
    expect(showMap).toHaveAttribute('data-action-phase', 'wrap-up');
    expect(showMap).toHaveAttribute('data-submitted-trial-count', '1');
  });

  it('opens AskQ with a selected show-day prompt', async () => {
    const user = userEvent.setup();
    renderWorkbench('/secretary/shows/show-1?phase=today');

    await user.click(await screen.findByRole('button', { name: 'Scratch or no-show' }));

    expect(useAskQPanelStore.getState().isOpen).toBe(true);
    expect(useAskQPanelStore.getState().suggestedPrompt).toBe(
      'What should I do if an exhibitor says their dog is a scratch or no-show today?'
    );
  });

  it('navigates to the existing edit surface', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(await screen.findByRole('button', { name: /Edit/ }));

    expect(navigateMock).toHaveBeenCalledWith('/shows/show-1?edit=true');
  });

  it('shows the loading state', () => {
    mockLoading = true;

    renderWorkbench();

    expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
  });

  it('shows the error state and retries', async () => {
    const user = userEvent.setup();
    mockError = true;
    mockShow = null;

    renderWorkbench();

    expect(screen.getByTestId('error-state')).toHaveTextContent(
      "We couldn't load this show workbench."
    );
    await user.click(screen.getByRole('button', { name: /Try Again/ }));
    expect(refetchMock).toHaveBeenCalled();
  });

  it('shows not found when the show is missing', () => {
    mockShow = null;

    renderWorkbench();

    expect(screen.getByTestId('not-found')).toHaveTextContent('Show Not Found');
  });

  it('denies exhibitor-only access through the protected route', () => {
    renderWorkbench('/secretary/shows/show-1', 'exhibitor@example.com');

    expect(screen.queryByTestId('detail-hero')).not.toBeInTheDocument();
    expect(screen.getByText(/you don't have permission/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated users through the protected route', () => {
    renderWorkbench('/secretary/shows/show-1', null);

    expect(screen.getByTestId('sign-in')).toBeInTheDocument();
  });
});
