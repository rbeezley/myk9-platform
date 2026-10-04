import { act, render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrialDetailsPage from '@/pages/TrialDetailsPage';
import type { Trial } from '@/components/trials/types/trial.types';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';

// ---------------------------------------------------------------------------
// Lane 3.7 regression: a logged-out guest never syncs the trial store, so the
// page must resolve the trial via the anon-safe by-id query fallback instead of
// being stuck on "Loading trial...". The authed path must keep reading the
// store (no regression / no extra fetch).
// ---------------------------------------------------------------------------

// Trial store — cold for anon, warm for authed (driven per test).
let mockTrials: Array<Record<string, unknown>> = [];
let mockSelectedTrialId: string | null = null;
const trialStoreState = {
  get trials() {
    return mockTrials;
  },
  get selectedTrialId() {
    return mockSelectedTrialId;
  },
  selectTrial: vi.fn(),
  updateTrial: vi.fn(),
  deleteTrial: vi.fn(),
  loadTrialClasses: vi.fn(),
};
const useTrialStoreMock = vi.fn(() => trialStoreState) as unknown as {
  (): typeof trialStoreState;
  getState: () => typeof trialStoreState;
};
useTrialStoreMock.getState = () => trialStoreState;
// The trial dialogs save classes through useClassEditActions, which reads the connection.
vi.mock('@/hooks/useConnectionHint', () => ({ useConnectionHint: () => undefined }));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => useTrialStoreMock(),
}));

// Auth context
const mockAuthContext = {
  user: null as Record<string, unknown> | null,
  // A secretary's grant is club-scoped — canManageShowSurface narrows on the
  // parent show's own club, matching is_trial_secretary(club) on the server.
  // A fixture with isSecretary and no scope is a user who cannot exist.
  userWithRoles: {
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
};
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthContext,
}));

let mockShows: Array<Record<string, unknown>> = [];
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({ shows: mockShows }),
}));

vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({
    addClass: vi.fn(),
    classes: [],
    updateClass: vi.fn(),
    deleteClass: vi.fn(),
  }),
}));

// The by-id fallback queries — capture args to assert the store-first gating.
let mockFallbackTrial: Trial | null = null;
let mockFallbackTrialPending = false;
let mockTrialQueryError = false;
const trialQueryCalls: Array<string | undefined> = [];
vi.mock('@/hooks/queries/useTrialsDatabase', () => ({
  useTrialQuery: (id: string | undefined) => {
    trialQueryCalls.push(id);
    if (!id) {
      // Disabled (warm store) — never resolves on its own.
      return { data: undefined, isSuccess: false, isError: false, refetch: vi.fn() };
    }
    if (mockFallbackTrialPending) {
      return { data: undefined, isSuccess: false, isError: false, refetch: vi.fn() };
    }
    if (mockTrialQueryError) {
      return { data: undefined, isSuccess: false, isError: true, refetch: vi.fn() };
    }
    return { data: mockFallbackTrial, isSuccess: true, isError: false, refetch: vi.fn() };
  },
}));

let mockFallbackShow: Record<string, unknown> | null = null;
const showQueryCalls: string[] = [];
vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowQuery: (id: string) => {
    showQueryCalls.push(id);
    return { data: id ? mockFallbackShow : undefined };
  },
}));

vi.mock('@/hooks/queries/useTrialEntries', () => ({
  useTrialEntries: () => ({ data: [] }),
}));

vi.mock('@/hooks/useTrialStats', () => ({
  useTrialStats: () => ({ entries: { total: 0 } }),
}));

// Heavy children / panels → stubs.
vi.mock('@/components/trials/TrialDetailsMain', () => ({
  default: ({ onAddClassesFromTemplate }: { onAddClassesFromTemplate?: () => void }) => (
    <div data-testid="trial-details-main">
      TrialDetailsMain
      {onAddClassesFromTemplate && <button onClick={onAddClassesFromTemplate}>Add Classes</button>}
    </div>
  ),
}));
vi.mock('@/components/panels/edit/TrialEditPanel', () => ({
  TrialEditPanel: ({ open }: { open: boolean }) =>
    open ? <div data-testid="trial-edit-panel" /> : null,
}));
vi.mock('@/components/panels/edit/ClassEditPanel', () => ({ ClassEditPanel: () => null }));
vi.mock('@/components/secretary/FinancialSummary', () => ({ FinancialSummary: () => null }));
vi.mock('@/components/trials/TrialDetail/TrialEntriesTable', () => ({
  TrialEntriesTable: () => <div data-testid="trial-entries-table" />,
}));

// Shared primitives — pass through so we can assert content.
vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-shell">{children}</div>
  ),
}));
vi.mock('@/components/common/PageHeader', () => ({
  PageHeader: ({
    title,
    breadcrumbs,
    omitTitle,
  }: {
    title: string;
    breadcrumbs: Array<{ label: string; href: string }>;
    omitTitle?: boolean;
  }) => (
    <div>
      <div data-testid="page-header" data-omit-title={String(Boolean(omitTitle))}>
        {title}
      </div>
      <nav aria-label="Breadcrumb">
        {breadcrumbs.map(crumb => (
          <a key={crumb.href} href={crumb.href}>
            {crumb.label}
          </a>
        ))}
      </nav>
    </div>
  ),
}));
vi.mock('@/components/common/DetailHero', () => ({
  DetailHero: ({
    name,
    secondaryActions,
    parent,
    headingLevel,
  }: {
    name: string;
    secondaryActions?: React.ReactNode;
    parent?: { label: string; href: string };
    headingLevel?: number;
  }) => (
    <div data-testid="detail-hero" data-heading-level={headingLevel}>
      <span data-testid="hero-name">{name}</span>
      {parent && <a href={parent.href}>{parent.label}</a>}
      <div data-testid="hero-secondary">{secondaryActions}</div>
    </div>
  ),
}));
vi.mock('@/components/common/PrimaryTabs', () => ({
  PrimaryTabs: ({
    children,
    tabs,
  }: {
    children: React.ReactNode;
    tabs?: Array<{ id: string; label: string }>;
  }) => (
    <div>
      <nav aria-label="Trial sections">
        {tabs?.map(tab => (
          <button key={tab.id}>{tab.label}</button>
        ))}
      </nav>
      {children}
    </div>
  ),
}));
vi.mock('@/components/ui/tabs', () => ({
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function makeFallbackTrial(): Trial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    showName: 'Heartland Scent Work Classic',
    trialDate: '2026-05-01',
    trialNumber: '1',
    status: 'Upcoming',
    type: 'Scent Work',
    name: 'Trial 1',
  };
}

function WizardLocation() {
  const location = useLocation();
  return <div data-testid="wizard-location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialEntry = '/trials/trial-1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/trials/:trialId" element={<TrialDetailsPage />} />
          <Route path="/shows" element={<div data-testid="shows-list" />} />
          <Route path="/shows/:showId" element={<div data-testid="show-page" />} />
          <Route path="/shows/:showId/trials/:trialId" element={<TrialDetailsPage />} />
          <Route path="/secretary/create-show/wizard" element={<WizardLocation />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TrialDetailsPage', () => {
  beforeEach(() => {
    mockTrials = [];
    mockSelectedTrialId = null;
    mockShows = [];
    mockFallbackTrial = null;
    mockFallbackTrialPending = false;
    mockTrialQueryError = false;
    mockFallbackShow = null;
    trialQueryCalls.length = 0;
    showQueryCalls.length = 0;
    mockAuthContext.user = null;
    mockAuthContext.userWithRoles = {
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
    usePageEditTargetStore.setState({ target: null, owner: null });
  });

  it('renders a skeleton while the trial fallback is still loading', () => {
    mockTrials = [];
    mockSelectedTrialId = null;
    mockFallbackTrialPending = true;

    renderPage();

    expect(screen.getByRole('status', { name: 'Loading trial details' })).toBeInTheDocument();
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(screen.queryByText('Loading trial...')).not.toBeInTheDocument();
  });

  it('renders the trial for a cold anon visitor via the by-id fallback (not stuck loading)', () => {
    // Cold store: guest never synced.
    mockTrials = [];
    mockSelectedTrialId = null;
    mockFallbackTrial = makeFallbackTrial();
    mockFallbackShow = {
      id: 'show-1',
      name: 'Heartland Scent Work Classic',
      organization: 'AKC',
      clubId: 'club-1',
    };

    renderPage();

    expect(screen.queryByRole('status', { name: 'Loading trial details' })).not.toBeInTheDocument();
    expect(screen.getByTestId('hero-name')).toHaveTextContent('Trial 1');
    // The fallback query was enabled with the URL trial id…
    expect(trialQueryCalls).toContain('trial-1');
    // …and the parent show resolved through the anon-safe show-by-id query.
    expect(showQueryCalls).toContain('show-1');
    // Anon sees no management affordances.
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('shows not-found (not an infinite spinner) when the anon fallback settles empty', () => {
    mockTrials = [];
    mockSelectedTrialId = null;
    mockFallbackTrial = null; // missing trial — query SUCCEEDED with no row

    renderPage();

    expect(screen.queryByText('Loading trial...')).not.toBeInTheDocument();
    expect(screen.getByText(/doesn't exist/i)).toBeInTheDocument();
  });

  it('not-found is the shared state, in the page shell, with the parent list as its button', async () => {
    mockTrials = [];
    mockFallbackTrial = null;

    renderPage();

    expect(screen.getByTestId('page-shell')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Trial Not Found' })).toBeInTheDocument();
    // The old copy was an ErrorState whose "retry" navigated away.
    expect(screen.queryByRole('button', { name: /try again|retry/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back to Shows' }));
    expect(screen.getByTestId('shows-list')).toBeInTheDocument();
  });

  it('not-found goes back to the parent show when the URL names one', async () => {
    mockTrials = [];
    mockFallbackTrial = null;

    renderPage('/shows/show-1/trials/trial-1');

    await userEvent.click(screen.getByRole('button', { name: 'Back to Show' }));
    expect(screen.getByTestId('show-page')).toBeInTheDocument();
  });

  it('shows a load error (not "doesn\'t exist") when the anon fallback query errors', () => {
    // isFetched is true after an error too — gating not-found on it would
    // mis-render a failed fetch as a missing trial. The page must distinguish
    // a fetch error from a successful empty result.
    mockTrials = [];
    mockSelectedTrialId = null;
    mockTrialQueryError = true;

    renderPage();

    expect(screen.queryByText('Loading trial...')).not.toBeInTheDocument();
    expect(screen.queryByText(/doesn't exist/i)).not.toBeInTheDocument();
    expect(screen.getByText(/couldn't load this trial/i)).toBeInTheDocument();
  });

  it('reads the warm store for an authenticated secretary without enabling the fallback', () => {
    mockAuthContext.user = { id: 'user-1' };
    mockAuthContext.isSecretary = true;
    mockTrials = [
      {
        id: 'trial-1',
        showId: 'show-1',
        trialDate: '2026-05-01',
        trialNumber: '1',
        status: 'Upcoming',
        type: 'Scent Work',
        name: 'Trial 1',
      },
    ];
    mockSelectedTrialId = 'trial-1';
    mockShows = [
      { id: 'show-1', name: 'Heartland Scent Work Classic', organization: 'AKC', clubId: 'club-1' },
    ];

    renderPage();

    expect(screen.getByTestId('hero-name')).toHaveTextContent('Trial 1');
    // Store had the trial + show, so both by-id fallbacks stay disabled.
    expect(trialQueryCalls.every(arg => arg === undefined)).toBe(true);
    expect(showQueryCalls.every(arg => arg === '')).toBe(true);
  });

  it('does not expose promo-code management to a secretary', () => {
    mockAuthContext.user = { id: 'user-1' };
    mockAuthContext.isSecretary = true;
    mockTrials = [makeFallbackTrial() as unknown as Record<string, unknown>];
    mockSelectedTrialId = 'trial-1';
    mockShows = [{ id: 'show-1', name: 'Heartland Scent Work Classic', clubId: 'club-1' }];

    renderPage();

    expect(screen.queryByRole('button', { name: 'Promo Codes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Financials' })).toBeInTheDocument();
  });

  it('does not render the removed promo-code panel when deep-linked', () => {
    mockAuthContext.user = { id: 'user-1' };
    mockAuthContext.isSecretary = true;
    mockTrials = [makeFallbackTrial() as unknown as Record<string, unknown>];
    mockSelectedTrialId = 'trial-1';
    mockShows = [{ id: 'show-1', name: 'Heartland Scent Work Classic', clubId: 'club-1' }];

    renderPage('/trials/trial-1?tab=promo-codes');

    expect(screen.queryByRole('button', { name: 'Promo Codes' })).not.toBeInTheDocument();
    expect(screen.queryByText('PromoCodesSection')).not.toBeInTheDocument();
    expect(screen.getByTestId('trial-details-main')).toBeInTheDocument();
  });

  it('Add Classes opens the show wizard add-classes mode focused on this trial', async () => {
    mockAuthContext.user = { id: 'user-1' };
    mockAuthContext.isSecretary = true;
    mockTrials = [makeFallbackTrial() as unknown as Record<string, unknown>];
    mockSelectedTrialId = 'trial-1';
    mockShows = [{ id: 'show-1', name: 'Heartland Scent Work Classic', clubId: 'club-1' }];

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Add Classes' }));

    expect(screen.getByTestId('wizard-location')).toHaveTextContent(
      '/secretary/create-show/wizard?showId=show-1&mode=add-classes&trialId=trial-1'
    );
  });

  describe('detail-page header (MYK9-930)', () => {
    function warmTrial() {
      mockAuthContext.user = { id: 'user-1' };
      mockAuthContext.isSecretary = true;
      mockTrials = [makeFallbackTrial() as unknown as Record<string, unknown>];
      mockSelectedTrialId = 'trial-1';
      mockShows = [{ id: 'show-1', name: 'Heartland Scent Work Classic', clubId: 'club-1' }];
    }

    it('breadcrumb links up through Shows and the parent show', () => {
      warmTrial();
      renderPage();

      const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
      expect(trail.getByRole('link', { name: 'Shows' })).toHaveAttribute('href', '/shows');
      expect(trail.getByRole('link', { name: 'Heartland Scent Work Classic' })).toHaveAttribute(
        'href',
        '/shows/show-1'
      );
    });

    it('hero carries the parent show as a link and owns the page h1', () => {
      warmTrial();
      renderPage();

      const hero = within(screen.getByTestId('detail-hero'));
      expect(hero.getByRole('link', { name: 'Heartland Scent Work Classic' })).toHaveAttribute(
        'href',
        '/shows/show-1'
      );
      expect(screen.getByTestId('detail-hero')).toHaveAttribute('data-heading-level', '1');
      expect(screen.getByTestId('page-header')).toHaveAttribute('data-omit-title', 'true');
    });
  });

  describe('page actions live in the header Actions menu (MYK9-928)', () => {
    function secretaryOnWarmStore() {
      mockAuthContext.user = { id: 'user-1' };
      mockAuthContext.isSecretary = true;
      mockTrials = [makeFallbackTrial() as unknown as Record<string, unknown>];
      mockSelectedTrialId = 'trial-1';
      mockShows = [{ id: 'show-1', name: 'Heartland Scent Work Classic', clubId: 'club-1' }];
    }

    it('renders no Edit button in the hero, and registers Edit trial for the Actions menu', () => {
      secretaryOnWarmStore();
      renderPage();

      expect(screen.queryByRole('button', { name: /^edit/i })).not.toBeInTheDocument();
      expect(usePageEditTargetStore.getState().target).toMatchObject({
        kind: 'trial',
        addClassesHref:
          '/secretary/create-show/wizard?showId=show-1&mode=add-classes&trialId=trial-1',
      });
    });

    it('opens the trial Edit panel when the registered Edit runs', () => {
      secretaryOnWarmStore();
      renderPage();
      expect(screen.queryByTestId('trial-edit-panel')).not.toBeInTheDocument();

      act(() => usePageEditTargetStore.getState().target?.run());

      expect(screen.getByTestId('trial-edit-panel')).toBeInTheDocument();
    });

    it('registers nothing for a viewer scoped to another club (the old button gate)', () => {
      secretaryOnWarmStore();
      mockShows = [{ id: 'show-1', name: 'Heartland', clubId: 'someone-elses-club' }];
      renderPage();

      expect(usePageEditTargetStore.getState().target).toBeNull();
    });

    it('registers nothing for a guest', () => {
      mockTrials = [];
      mockFallbackTrial = makeFallbackTrial();
      mockFallbackShow = { id: 'show-1', name: 'Heartland', organization: 'AKC', clubId: 'club-1' };
      renderPage();

      expect(usePageEditTargetStore.getState().target).toBeNull();
    });

    it('withdraws the registration when the page unmounts', () => {
      secretaryOnWarmStore();
      const { unmount } = renderPage();
      expect(usePageEditTargetStore.getState().target).not.toBeNull();

      unmount();

      expect(usePageEditTargetStore.getState().target).toBeNull();
    });
  });
});
