import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Dog } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';

// ── Mock data ───────────────────────────────────────────────────────────────

const makeDog = (overrides: Partial<Dog> = {}): Dog => ({
  id: 'dog-1',
  name: 'Champion Goldenworth Max',
  callName: 'Max',
  breed: 'Golden Retriever',
  sex: 'male',
  ownerId: 'owner-1',
  ownerName: 'Jane Doe',
  registrations: [
    {
      id: 'reg-1',
      organization: 'AKC',
      registeredName: 'Champion Goldenworth Max',
      breed: 'Golden Retriever',
      registrationNumber: 'DN12345678',
      status: 'Active',
    },
    {
      id: 'reg-2',
      organization: 'UKC',
      registeredName: 'Goldenworth Max',
      breed: 'Golden Retriever',
      registrationNumber: 'R123456',
      status: 'Active',
    },
  ],
  ...overrides,
});

// ── Mutable mock state ──────────────────────────────────────────────────────

let mockBrowseDogsReturn = {
  dogs: [makeDog()],
  filteredDogs: [makeDog()],
  isLoading: false,
  hasError: false,
  handleRetry: vi.fn(),
  filters: { search: '', breed: 'all', sex: 'all' },
  setFilters: vi.fn(),
  hasActiveFilters: false,
  clearAllFilters: vi.fn(),
  availableBreeds: ['Golden Retriever', 'Border Collie'],
};

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useBrowseDogsData', () => ({
  useBrowseDogsData: () => mockBrowseDogsReturn,
}));

const mockGetUserRoles = vi.fn().mockReturnValue(['secretary']);
const mockHasRole = vi.fn().mockReturnValue(false);

vi.mock('@/hooks/useAuthContext', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    useAuthContext: () => ({
      getUserRoles: mockGetUserRoles,
      hasRole: mockHasRole,
    }),
  };
});

vi.mock('@/hooks/useRoleBasedData', () => ({
  useCurrentUserPersonId: () => 'person-1',
}));

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    hasPermission: () => true,
    isLoading: false,
  }),
}));

vi.mock('@/components/panels/edit', () => ({
  AddDogPanel: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="add-dog-panel">
        Add dog panel
        <button type="button" onClick={onClose}>
          Close dog panel
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/common/SkeletonLoaders', () => ({
  BrowseDogsSkeleton: () => <div data-testid="dogs-skeleton">Loading...</div>,
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

import BrowseDogsPage from '../BrowseDogsPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="current-location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage(initialRoute = '/dogs') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <BrowseDogsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('BrowseDogsPage (shared primitives migration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserRoles.mockReturnValue(['secretary']);
    mockBrowseDogsReturn = {
      dogs: [makeDog()],
      filteredDogs: [makeDog()],
      isLoading: false,
      hasError: false,
      handleRetry: vi.fn(),
      filters: { search: '', breed: 'all', sex: 'all' },
      setFilters: vi.fn(),
      hasActiveFilters: false,
      clearAllFilters: vi.fn(),
      availableBreeds: ['Golden Retriever', 'Border Collie'],
    };
  });

  it('renders inside a PageShell wrapper (max-w-7xl container)', () => {
    renderPage();
    // PageShell renders a div with max-w-7xl class
    const shell = document.querySelector('.max-w-7xl');
    expect(shell).toBeTruthy();
  });

  it('renders breadcrumb with "Dogs" link via PageHeader', () => {
    renderPage();
    // PageHeader includes a breadcrumb nav
    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav).toBeInTheDocument();
    // The breadcrumb should contain "Dogs" text (within the nav)
    const dogsInBreadcrumb = nav.querySelector('.text-foreground');
    expect(dogsInBreadcrumb).toBeTruthy();
    expect(dogsInBreadcrumb!.textContent).toBe('Dogs');
  });

  it('renders ErrorState when hook returns error', () => {
    mockBrowseDogsReturn = {
      ...mockBrowseDogsReturn,
      hasError: true,
      isLoading: false,
      dogs: [],
      filteredDogs: [],
    };

    renderPage();

    expect(screen.getByText("We couldn't load your dogs.")).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders EmptyState when no dogs exist (no filters active)', () => {
    mockBrowseDogsReturn = {
      ...mockBrowseDogsReturn,
      dogs: [],
      filteredDogs: [],
      hasActiveFilters: false,
    };

    renderPage();

    expect(screen.getByText('No dogs yet')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add your first dog to track health records, registrations, and competitions.'
      )
    ).toBeInTheDocument();
  });

  it('renders filtered EmptyState when filters produce zero results', () => {
    mockBrowseDogsReturn = {
      ...mockBrowseDogsReturn,
      dogs: [makeDog()],
      filteredDogs: [],
      hasActiveFilters: true,
    };

    renderPage();

    expect(screen.getByText('No dogs match your filters')).toBeInTheDocument();
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  it('renders dog cards with registration number badges', () => {
    renderPage();

    // Registration badges should be visible on the card
    expect(screen.getByText('AKC DN12345678')).toBeInTheDocument();
    expect(screen.getByText('UKC R123456')).toBeInTheDocument();
  });

  it('renders dog cards without registration badges when none exist', () => {
    mockBrowseDogsReturn = {
      ...mockBrowseDogsReturn,
      dogs: [makeDog({ registrations: [] })],
      filteredDogs: [makeDog({ registrations: [] })],
    };

    renderPage();

    // Dog card should still render
    expect(screen.getByText('Max')).toBeInTheDocument();
    // No registration badges
    expect(screen.queryByText('AKC DN12345678')).not.toBeInTheDocument();
  });

  it('uses "Gender" label on filter chip (not "Sex")', () => {
    renderPage();

    // The filter chip for sex should use the label "Gender"
    expect(screen.getByText('Gender')).toBeInTheDocument();
    expect(screen.queryByText('Sex')).not.toBeInTheDocument();
  });

  it('renders SearchBar with correct placeholder', () => {
    renderPage();

    const searchInput = screen.getByPlaceholderText('Search dogs by name, breed, or owner...');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders ViewToggle with Cards and Table modes', () => {
    renderPage();

    expect(screen.getByTitle('Cards view')).toBeInTheDocument();
    expect(screen.getByTitle('Table view')).toBeInTheDocument();
  });

  it('renders ResultsCount showing correct numbers', () => {
    renderPage();

    // 1 of 1 dog
    expect(screen.getByText('1 dog')).toBeInTheDocument();
  });

  it('opens the add dog panel from the add query parameter', () => {
    renderPage('/dogs?add=true');

    expect(screen.getByTestId('add-dog-panel')).toBeInTheDocument();
  });

  it('removes the add query parameter when the add dog panel closes', async () => {
    const user = userEvent.setup();
    renderPage('/dogs?add=true');

    expect(screen.getByTestId('current-location')).toHaveTextContent('/dogs?add=true');

    await user.click(screen.getByRole('button', { name: 'Close dog panel' }));

    expect(screen.queryByTestId('add-dog-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-location')).toHaveTextContent('/dogs');
  });

  it('shows loading skeleton when isLoading and no dogs', () => {
    mockBrowseDogsReturn = {
      ...mockBrowseDogsReturn,
      isLoading: true,
      dogs: [],
      filteredDogs: [],
    };

    renderPage();

    expect(screen.getByTestId('dogs-skeleton')).toBeInTheDocument();
  });

  it('shows "My Dogs" title and exhibitor-friendly placeholder for exhibitor-only users', () => {
    mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);

    renderPage();

    expect(screen.getByRole('heading', { name: 'My Dogs' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search your dogs by name or breed...')).toBeInTheDocument();
  });
});
