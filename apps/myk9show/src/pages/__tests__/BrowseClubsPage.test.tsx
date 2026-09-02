import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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

const mockAddClub = vi.hoisted(() => vi.fn());

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useBrowseClubsData', () => ({
  useBrowseClubsData: () => mockBrowseClubsReturn,
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      addClub: mockAddClub,
      selectClub: vi.fn(),
      clubs: [],
    }),
}));

vi.mock('@/components/panels/edit/ClubEditPanel', () => ({
  ClubEditPanel: ({ onSave }: { onSave: (club: Partial<Club>) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSave({
          name: 'Complete Club',
          email: 'club@example.com',
          address: {
            street: '1 Main St',
            city: 'Tulsa',
            state: 'OK',
            zipCode: '74103',
            country: 'US',
          },
        })
      }
    >
      Submit complete club
    </button>
  ),
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialEntry = '/clubs') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/clubs" element={<BrowseClubsPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('BrowseClubsPage (shared primitives migration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAddClub.mockResolvedValue('club-new');
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
    expect(
      screen.getByText(
        'Get started by creating your first club to manage organizations and events.'
      )
    ).toBeInTheDocument();
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

  it('renders club table view by default', () => {
    renderPage();

    expect(screen.getByTestId('clubs-list')).toBeInTheDocument();
    expect(screen.getByText('Golden State Dog Club')).toBeInTheDocument();
  });

  it('honors a stored cards preference', () => {
    localStorage.setItem('view-pref-clubs', 'cards');

    renderPage();

    expect(screen.getByTestId('clubs-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('clubs-list')).not.toBeInTheDocument();
  });
});

// ── New Club button role-gate tests ─────────────────────────────────────────

describe('BrowseClubsPage — New Club button visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAddClub.mockResolvedValue('club-new');
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

  it('shows New Club button when user is a site admin', () => {
    mockAuthReturn = {
      user: { id: 'admin-user' },
      userWithRoles: { roles: ['site_admin'] },
    };

    renderPage();

    expect(screen.getByRole('button', { name: /new club/i })).toBeInTheDocument();
  });

  it('shows New Club button when user is a secretary', () => {
    mockAuthReturn = {
      user: { id: 'secretary-user' },
      userWithRoles: { roles: ['secretary'] },
    };

    renderPage();

    expect(screen.getByRole('button', { name: /new club/i })).toBeInTheDocument();
  });

  it('shows New Club button when user is a club admin', () => {
    mockAuthReturn = {
      user: { id: 'club-admin-user' },
      userWithRoles: { roles: ['club_admin'] },
    };

    renderPage();

    expect(screen.getByRole('button', { name: /new club/i })).toBeInTheDocument();
  });

  it('hides New Club button when user is unauthenticated', () => {
    mockAuthReturn = {
      user: null,
      userWithRoles: null,
    };

    renderPage();

    expect(screen.queryByRole('button', { name: /new club/i })).not.toBeInTheDocument();
  });

  it('opens the complete club creator from a wizard handoff and returns the new club', async () => {
    mockAuthReturn = {
      user: { id: 'secretary-user' },
      userWithRoles: { roles: ['secretary'] },
    };

    renderPage(
      '/clubs?create=true&returnTo=%2Fsecretary%2Fcreate-show%2Fwizard%3Fsource%3Dclub-link'
    );

    fireEvent.click(await screen.findByRole('button', { name: /submit complete club/i }));

    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/secretary/create-show/wizard?source=club-link&clubId=club-new'
    );
  });
});
