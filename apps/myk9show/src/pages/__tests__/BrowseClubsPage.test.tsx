import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Club } from '@/types/club-types';

// Mutable so individual tests can override role
let mockAuthReturn: { user: { id: string } | null; userWithRoles: { roles: string[] } | null } = {
  user: { id: 'test-user' },
  userWithRoles: { roles: ['secretary'] },
};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => mockAuthReturn,
}));

// ── Mock data ───────────────────────────────────────────────────────────────

const makeClub = (overrides: Partial<Club> = {}): Club => ({
  id: 'club-1',
  name: 'Golden State Dog Club',
  clubNumber: 'GS-001',
  email: 'info@goldenstatedc.org',
  phone: '555-0100',
  website: 'https://goldenstatedc.org',
  description: 'A premier dog club in California',
  address: {
    street: '123 Main St',
    city: 'Sacramento',
    state: 'CA',
    zipCode: '95814',
    country: 'US',
  },
  logo: '',
  coverImage: '',
  accentColor: '',
  clubType: 'all-breed',
  upcomingShows: [],
  pastShows: [],
  ...overrides,
});

// ── Mutable mock state ──────────────────────────────────────────────────────

let mockBrowseClubsReturn = {
  clubs: [makeClub()],
  filteredClubs: [makeClub()],
  isLoading: false,
  hasError: false,
  handleRetry: vi.fn(),
  filters: { search: '', clubType: 'all' },
  setFilters: vi.fn(),
  hasActiveFilters: false,
  clearAllFilters: vi.fn(),
  clubShowCounts: new Map<string, number>(),
};

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useBrowseClubsData', () => ({
  useBrowseClubsData: () => mockBrowseClubsReturn,
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      addClub: vi.fn(),
      selectClub: vi.fn(),
      clubs: [],
    }),
}));

vi.mock('@/components/panels', () => ({
  PanelProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PanelStack: () => null,
}));

vi.mock('@/components/panels/edit/ClubEditPanel', () => ({
  ClubEditPanel: () => null,
}));

vi.mock('@/components/clubs/browse', () => ({
  ClubsGridView: ({ clubs }: { clubs: Club[] }) => (
    <div data-testid="clubs-grid">
      {clubs.map(c => (
        <div key={c.id}>{c.name}</div>
      ))}
    </div>
  ),
  ClubsListView: ({ clubs }: { clubs: Club[] }) => (
    <div data-testid="clubs-list">
      {clubs.map(c => (
        <div key={c.id}>{c.name}</div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/common/SkeletonLoaders', () => ({
  BrowseClubsSkeleton: () => <div data-testid="clubs-skeleton">Loading...</div>,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

import BrowseClubsPage from '../BrowseClubsPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <BrowseClubsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('BrowseClubsPage (shared primitives migration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthReturn = {
      user: { id: 'test-user' },
      userWithRoles: { roles: ['secretary'] },
    };
    mockBrowseClubsReturn = {
      clubs: [makeClub()],
      filteredClubs: [makeClub()],
      isLoading: false,
      hasError: false,
      handleRetry: vi.fn(),
      filters: { search: '', clubType: 'all' },
      setFilters: vi.fn(),
      hasActiveFilters: false,
      clearAllFilters: vi.fn(),
      clubShowCounts: new Map<string, number>(),
    };
  });

  it('renders inside a PageShell wrapper (max-w-7xl container)', () => {
    renderPage();
    const shell = document.querySelector('.max-w-7xl');
    expect(shell).toBeTruthy();
  });

  it('renders breadcrumb with "Clubs" link via PageHeader', () => {
    renderPage();
    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav).toBeInTheDocument();
    const clubsInBreadcrumb = nav.querySelector('.text-foreground');
    expect(clubsInBreadcrumb).toBeTruthy();
    expect(clubsInBreadcrumb!.textContent).toBe('Clubs');
  });

  it('renders ErrorState when hook returns error', () => {
    mockBrowseClubsReturn = {
      ...mockBrowseClubsReturn,
      hasError: true,
      isLoading: false,
      clubs: [],
      filteredClubs: [],
    };

    renderPage();

    expect(screen.getByText("We couldn't load your clubs.")).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders EmptyState when no clubs exist (no filters active)', () => {
    mockBrowseClubsReturn = {
      ...mockBrowseClubsReturn,
      clubs: [],
      filteredClubs: [],
      hasActiveFilters: false,
    };

    renderPage();

    expect(screen.getByText('No clubs yet')).toBeInTheDocument();
    // Default mock role is 'secretary' (non-admin), so the non-admin description is shown
    expect(screen.getByText('No clubs are listed yet.')).toBeInTheDocument();
  });

  it('renders filtered EmptyState when filters produce zero results', () => {
    mockBrowseClubsReturn = {
      ...mockBrowseClubsReturn,
      clubs: [makeClub()],
      filteredClubs: [],
      hasActiveFilters: true,
    };

    renderPage();

    expect(screen.getByText('No clubs match your filters')).toBeInTheDocument();
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  it('renders SearchBar with correct placeholder', () => {
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search clubs by name, city, or state...');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders ViewToggle with Cards and Table modes', () => {
    renderPage();

    expect(screen.getByTitle('Cards view')).toBeInTheDocument();
    expect(screen.getByTitle('Table view')).toBeInTheDocument();
  });

  it('renders ResultsCount showing correct numbers', () => {
    renderPage();

    // 1 of 1 club
    expect(screen.getByText('1 club')).toBeInTheDocument();
  });

  it('shows loading skeleton when isLoading and no clubs', () => {
    mockBrowseClubsReturn = {
      ...mockBrowseClubsReturn,
      isLoading: true,
      clubs: [],
      filteredClubs: [],
    };

    renderPage();

    expect(screen.getByTestId('clubs-skeleton')).toBeInTheDocument();
  });

  it('renders club grid view by default', () => {
    renderPage();

    expect(screen.getByTestId('clubs-grid')).toBeInTheDocument();
    expect(screen.getByText('Golden State Dog Club')).toBeInTheDocument();
  });
});

// ── Add Club button role-gate tests ─────────────────────────────────────────

describe('BrowseClubsPage — Add Club button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBrowseClubsReturn = {
      clubs: [makeClub()],
      filteredClubs: [makeClub()],
      isLoading: false,
      hasError: false,
      handleRetry: vi.fn(),
      filters: { search: '', clubType: 'all' },
      setFilters: vi.fn(),
      hasActiveFilters: false,
      clearAllFilters: vi.fn(),
      clubShowCounts: new Map<string, number>(),
    };
  });

  it('shows Add Club button when user is a site admin', () => {
    mockAuthReturn = {
      user: { id: 'admin-user' },
      userWithRoles: { roles: ['site_admin'] },
    };

    renderPage();

    expect(screen.getByRole('button', { name: /add club/i })).toBeInTheDocument();
  });

  it('hides Add Club button when user is a secretary', () => {
    mockAuthReturn = {
      user: { id: 'secretary-user' },
      userWithRoles: { roles: ['secretary'] },
    };

    renderPage();

    expect(screen.queryByRole('button', { name: /add club/i })).not.toBeInTheDocument();
  });

  it('hides Add Club button when user is unauthenticated', () => {
    mockAuthReturn = {
      user: null,
      userWithRoles: null,
    };

    renderPage();

    expect(screen.queryByRole('button', { name: /add club/i })).not.toBeInTheDocument();
  });
});
