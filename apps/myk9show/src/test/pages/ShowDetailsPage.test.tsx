import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ShowDetailsPage from '@/pages/ShowDetailsPage';

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
  useUpdateShowMutation: () => ({ mutateAsync: vi.fn() }),
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
  ShowEditPanel: () => null,
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
  DetailHero: ({ name }: { name: string }) => <div data-testid="detail-hero">{name}</div>,
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
    };
    mockLoading = false;
    mockUserEntries = [];
    mockAuthContext.user = { id: 'user-1' };
    mockAuthContext.isSecretary = false;
    mockAuthContext.isAdmin = false;
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
    expect(screen.queryByRole('tab', { name: /Results/ })).toBeNull();
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
});
