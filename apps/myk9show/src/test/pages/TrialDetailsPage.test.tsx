import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrialDetailsPage from '@/pages/TrialDetailsPage';
import type { Trial } from '@/components/trials/types/trial.types';

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
vi.mock('@/store/trialStore', () => ({
  useTrialStore: () => useTrialStoreMock(),
}));

// Auth context
const mockAuthContext = {
  user: null as Record<string, unknown> | null,
  userWithRoles: null as Record<string, unknown> | null,
  isSecretary: false,
  isAdmin: false,
  hasRole: vi.fn(() => false),
};
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthContext,
}));

vi.mock('@/store/templateStore', () => ({
  useTemplateStore: () => ({ templates: [], initializeDefaultTemplates: vi.fn() }),
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

vi.mock('@/hooks/useTrialTemplates', () => ({
  useTrialTemplates: () => ({ handleSaveClassesFromTemplate: vi.fn() }),
}));

// Heavy children / panels → stubs.
vi.mock('@/components/trials/TrialDetailsMain', () => ({
  default: () => <div data-testid="trial-details-main">TrialDetailsMain</div>,
}));
vi.mock('@/components/classes/AddClassesToTrialPanel', () => ({
  AddClassesToTrialPanel: () => null,
}));
vi.mock('@/components/panels/edit/TrialEditPanel', () => ({ TrialEditPanel: () => null }));
vi.mock('@/components/panels/edit/ClassEditPanel', () => ({ ClassEditPanel: () => null }));
vi.mock('@/components/secretary/PromoCodesSection', () => ({ PromoCodesSection: () => null }));
vi.mock('@/components/secretary/FinancialSummary', () => ({ FinancialSummary: () => null }));
vi.mock('@/components/trials/TrialDetail/TrialEntriesTable', () => ({
  TrialEntriesTable: () => <div data-testid="trial-entries-table" />,
}));

// Shared primitives — pass through so we can assert content.
vi.mock('@/components/common/PageShell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/common/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}));
vi.mock('@/components/common/DetailHero', () => ({
  DetailHero: ({
    name,
    secondaryActions,
  }: {
    name: string;
    secondaryActions?: React.ReactNode;
  }) => (
    <div data-testid="detail-hero">
      <span data-testid="hero-name">{name}</span>
      <div data-testid="hero-secondary">{secondaryActions}</div>
    </div>
  ),
}));
vi.mock('@/components/common/PrimaryTabs', () => ({
  PrimaryTabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/trials/trial-1']}>
        <Routes>
          <Route path="/trials/:trialId" element={<TrialDetailsPage />} />
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
    mockAuthContext.userWithRoles = null;
    mockAuthContext.isSecretary = false;
    mockAuthContext.isAdmin = false;
    mockAuthContext.hasRole.mockReturnValue(false);
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
    mockFallbackShow = { id: 'show-1', name: 'Heartland Scent Work Classic', organization: 'AKC' };

    renderPage();

    expect(screen.queryByRole('status', { name: 'Loading trial details' })).not.toBeInTheDocument();
    expect(screen.getByTestId('hero-name')).toHaveTextContent('Scent Work');
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
    mockShows = [{ id: 'show-1', name: 'Heartland Scent Work Classic', organization: 'AKC' }];

    renderPage();

    expect(screen.getByTestId('hero-name')).toHaveTextContent('Scent Work');
    // Store had the trial + show, so both by-id fallbacks stay disabled.
    expect(trialQueryCalls.every(arg => arg === undefined)).toBe(true);
    expect(showQueryCalls.every(arg => arg === '')).toBe(true);
  });
});
