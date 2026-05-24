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
  }: {
    show: { id: string };
    trials: unknown[];
    classes: unknown[];
    entries: unknown[];
    canManageShow: boolean;
    initialDayScope?: string;
    initialCompletionScope?: string;
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
    // Phase B5: only Setup + Show Desk remain. Today and Wrap-up tabs were
    // removed; their surfaces are now reachable from Show Desk.
    expect(screen.getByRole('tab', { name: /Setup/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Show Desk/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Today$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Wrap-up$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /preview public page/i })).toHaveAttribute(
      'href',
      '/shows/show-1'
    );
    expect(screen.getByTestId('quick-info')).toHaveTextContent('show-1');
  });

  it('honors the phase URL param', async () => {
    renderWorkbench('/secretary/shows/show-1?phase=setup');

    const setupTab = await screen.findByRole('tab', { name: /Setup/ });
    expect(setupTab).toHaveAttribute('aria-selected', 'true');
  });

  it('redirects legacy ?phase=today to Show Desk (Phase B5)', async () => {
    renderWorkbench('/secretary/shows/show-1?phase=today');

    const showDeskTab = await screen.findByRole('tab', { name: /Show Desk/ });
    expect(showDeskTab).toHaveAttribute('aria-selected', 'true');
  });

  it('redirects legacy ?phase=wrap-up to Show Desk (Phase B5)', async () => {
    renderWorkbench('/secretary/shows/show-1?phase=wrap-up');

    const showDeskTab = await screen.findByRole('tab', { name: /Show Desk/ });
    expect(showDeskTab).toHaveAttribute('aria-selected', 'true');
  });

  it('lands on Show Desk by default when no ?phase is provided (Phase B2a)', async () => {
    renderWorkbench('/secretary/shows/show-1');

    const showDeskTab = await screen.findByRole('tab', { name: /Show Desk/ });
    expect(showDeskTab).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to the default tab on an unknown ?phase value', async () => {
    renderWorkbench('/secretary/shows/show-1?phase=garbage');

    const showDeskTab = await screen.findByRole('tab', { name: /Show Desk/ });
    expect(showDeskTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders the adaptive header status pill on the Show Desk tab', async () => {
    renderWorkbench('/secretary/shows/show-1?phase=show-desk');

    expect(await screen.findByTestId('show-desk-status-pill')).toBeInTheDocument();
  });

  it('updates phase when a tab is selected', async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(await screen.findByRole('tab', { name: /Setup/ }));

    expect(screen.getByRole('tab', { name: /Setup/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders Setup panels without public-discovery panels', async () => {
    // Phase B2a: bare URL lands on Show Desk by default; Setup is reached via explicit ?phase=setup.
    // Phase B8 replaced the AboutThisPhase banner + PhaseChecklist + AskQ help
    // card with the SetupAdaptiveHeader, and consolidated Premium + Landing
    // into the SetupPublishSection.
    renderWorkbench('/secretary/shows/show-1?phase=setup');

    expect(await screen.findByLabelText('Setup readiness')).toBeInTheDocument();
    // Deleted surfaces should not appear.
    expect(screen.queryByRole('heading', { name: 'About Setup' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What do I do if...' })).not.toBeInTheDocument();
    // Publish section groups the two existing cards.
    expect(screen.getByRole('heading', { name: 'Publish' })).toBeInTheDocument();
    expect(await screen.findByTestId('premium-download-card')).toHaveTextContent('show-1');
    expect(screen.getByTestId('landing-page-card')).toHaveTextContent('show-1');
    // Reference info still inline.
    expect(screen.getByTestId('schedule-summary')).toHaveTextContent('show-1');
    expect(screen.getByTestId('venue-map')).toHaveTextContent('Louisville, KY');
    expect(screen.getByTestId('show-officials')).toHaveTextContent('show-1');
    expect(screen.getByTestId('judges-list')).toBeInTheDocument();
    expect(screen.queryByTestId('myk9q-access')).not.toBeInTheDocument();
  });

  // Phase B5 removed the Today and Wrap-up workbench tabs entirely. Their
  // surfaces are now reachable from Show Desk (tree, tools sheet, closeout
  // section). The two former tests "renders Today operational surfaces" and
  // "renders Wrap-up links to existing closeout surfaces" were exercising
  // those deleted tabs and have been removed alongside the tabs themselves.
  // The Tools sheet behavior is now covered by ShowDeskToolsSheet.test.tsx
  // and the Closeout section by ShowDeskCloseoutSection.test.tsx.
  //
  // The "opens AskQ with a selected show-day prompt" test was also removed —
  // the "Scratch or no-show" prompt it asserted was a Today-phase prompt that
  // B5 dropped from SECRETARY_SHOW_DAY_PROMPTS. Phase B8 removed the
  // Setup-tab AskQ help card entirely (along with the AboutThisPhase banner
  // and PhaseChecklist) in favor of the signal-driven SetupAdaptiveHeader.

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

  // Phase B5 integration coverage: the legacy "renders Today operational
  // surfaces" + "renders Wrap-up links" tests were deleted alongside their
  // tabs, but those tests proved that ShowWorkbenchPage actually composes the
  // 7 desk-tool cards + 3 closeout links with the right props. The new
  // component tests for ShowDeskToolsSheet + ShowDeskCloseoutSection only
  // verify the shells (they pass stub children). This test fills the gap.
  it('composes the 7 tool cards + 3 closeout links into the Show Desk tab', async () => {
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
          status: 'completed',
        },
      ],
    };
    mockShowEntries = [{ id: 'entry-1', class_id: 'class-1' }];

    renderWorkbench('/secretary/shows/show-1?phase=show-desk');

    // Tools sheet: open it and assert all 9 cards render with show-scoped data.
    await user.click(await screen.findByRole('button', { name: /open tools panel/i }));
    const dialog = await screen.findByRole('dialog', { name: /show desk tools/i });
    expect(within(dialog).getByTestId('late-entry-action')).toHaveTextContent(
      'Add late entry for show-1'
    );
    expect(within(dialog).getByRole('heading', { name: 'Hospitality' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Quick broadcast' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: 'Message a class' })).toBeInTheDocument();
    expect(within(dialog).getByTestId('incident-log-card')).toHaveTextContent(
      'Incident log for show-1'
    );
    expect(
      within(dialog).getByRole('heading', { name: 'Schedule delay script' })
    ).toBeInTheDocument();
    expect(within(dialog).getByTestId('myk9q-access')).toHaveAttribute('data-show-id', 'show-1');
    expect(within(dialog).getByRole('heading', { name: 'Volunteers' })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /tasks & notes/i })).toBeInTheDocument();

    // Closeout section: only renders when the show has a wrap-up-eligible
    // class (we seeded class-1 as 'completed'). All 3 destination links
    // present with the correct hrefs the legacy Wrap-up tab used. Resolve
    // via the labeled text then walk up to the anchor — Button asChild +
    // Link composes the accessible name differently than a plain anchor.
    const closeout = await screen.findByTestId('show-desk-closeout-section');
    const resultsControlLink = within(closeout).getByText('Results Control').closest('a');
    expect(resultsControlLink).toHaveAttribute('href', '/secretary/results-control');
    const reportsLink = within(closeout).getByText('Reports').closest('a');
    expect(reportsLink).toHaveAttribute('href', '/secretary/reports');
    const submitLink = within(closeout).getByText('Submit Results').closest('a');
    expect(submitLink).toHaveAttribute('href', '/secretary/results-submission');
  });
});
