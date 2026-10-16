import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Club } from '@/types/club-types';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import ClubsMasterDetailPage from '../ClubsMasterDetailPage';

const makeClub = (id: string, name: string, city: string): Club => ({
  id,
  name,
  clubNumber: '',
  email: '',
  phone: '',
  website: '',
  description: '',
  address: { street: '', city, state: 'CA', zipCode: '', country: 'US' },
  logo: '',
  coverImage: '',
  accentColor: '',
  upcomingShows: [],
  pastShows: [],
});

const clubs = [
  makeClub('c1', 'Golden State Dog Club', 'Sacramento'),
  makeClub('c2', 'Bay Scent Club', 'Oakland'),
];
const data = { clubs, filteredClubs: clubs, isLoading: false, hasError: false };

vi.mock('@/hooks/useBrowseClubsData', () => ({
  useBrowseClubsData: () => ({
    ...data,
    isOffline: false,
    handleRetry: vi.fn(),
    filters: { search: '' },
    setFilters: vi.fn(),
    hasActiveFilters: false,
    clearAllFilters: vi.fn(),
    clubShowCounts: new Map([['c2', 2]]),
  }),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'auth-1', is_anonymous: false },
    userWithRoles: { roles: ['secretary'] },
    hasRole: () => false,
    hasPermission: () => false,
    refreshPermissions: vi.fn(),
  }),
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addClub: vi.fn(), selectClub: vi.fn() }),
}));

vi.mock('../ClubDetailPage', () => ({
  default: () => <p>the open club</p>,
}));

function renderAt(route: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/clubs" element={<ClubsMasterDetailPage />} />
          <Route path="/clubs/:id" element={<ClubsMasterDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Clubs list with a detail pane', () => {
  beforeEach(() => {
    data.clubs = clubs;
    data.filteredClubs = clubs;
    data.hasError = false;
  });

  it('opens a club beside a compact list on a wide screen', () => {
    mockViewportWidth(1440);
    renderAt('/clubs/c2');

    expect(screen.getByText('the open club')).toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Clubs list' });
    const open = screen.getByRole('link', { name: /Bay Scent Club/ });
    expect(list).toContainElement(open);
    expect(open).toHaveAttribute('href', '/clubs/c2');
    expect(open).toHaveAttribute('aria-current', 'page');
    expect(open).toHaveTextContent('Oakland, CA · 2 upcoming shows');
    // Beside a club the list is always compact: no cards/table switch.
    expect(screen.queryByRole('button', { name: 'Cards view' })).not.toBeInTheDocument();
  });

  it('prompts for a club beside the list until one is picked', () => {
    mockViewportWidth(1440);
    renderAt('/clubs');

    expect(screen.getByText('Select a club to see its details')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Golden State Dog Club/ })).toHaveAttribute(
      'href',
      '/clubs/c1'
    );
  });

  it('keeps the page hop on a narrow screen: the club replaces the list', () => {
    mockViewportWidth(390);
    renderAt('/clubs/c2');

    expect(screen.getByText('the open club')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Clubs list' })).not.toBeInTheDocument();
  });

  it('keeps the full list, with its cards/table switch, on a narrow screen', () => {
    mockViewportWidth(390);
    renderAt('/clubs');

    expect(screen.getByRole('button', { name: 'Cards view' })).toBeInTheDocument();
    expect(screen.queryByText('Select a club to see its details')).not.toBeInTheDocument();
  });

  it('keeps an open club readable when the list fails to load', () => {
    mockViewportWidth(1440);
    data.clubs = [];
    data.filteredClubs = [];
    data.hasError = true;
    renderAt('/clubs/c2');

    expect(screen.getByText("We couldn't load your clubs.")).toBeInTheDocument();
    expect(screen.getByText('the open club')).toBeInTheDocument();
  });
});
