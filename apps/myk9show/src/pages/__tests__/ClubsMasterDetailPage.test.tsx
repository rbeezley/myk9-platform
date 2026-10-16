import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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
const detailMounts = { count: 0 };

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
    hasRole: (role: string) => role === 'secretary',
    hasPermission: () => false,
    refreshPermissions: vi.fn(),
  }),
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addClub: vi.fn(), selectClub: vi.fn() }),
}));

// Counts mounts, so a test can tell "still showing" from "unmounted and shown again".
function OpenClub() {
  useEffect(() => {
    detailMounts.count += 1;
  }, []);
  return <p>the open club</p>;
}

vi.mock('../ClubDetailPage', () => ({ default: OpenClub }));

vi.mock('@/components/panels/edit/ClubEditPanel', () => ({
  ClubEditPanel: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Add Club panel">
      <button type="button" onClick={onClose}>
        Close panel
      </button>
    </div>
  ),
}));

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(route: string) {
  const client = new QueryClient();
  // A fresh element each time: React skips a rerender handed the identical element.
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/clubs" element={<ClubsMasterDetailPage />} />
          <Route path="/clubs/:id" element={<ClubsMasterDetailPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(tree());
  // The same tree again, after the test changes what the data hook returns.
  return { ...result, refresh: () => result.rerender(tree()) };
}

describe('Clubs list with a detail pane', () => {
  beforeEach(() => {
    data.clubs = clubs;
    data.filteredClubs = clubs;
    data.hasError = false;
    data.isLoading = false;
    detailMounts.count = 0;
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

  it('keeps an open club mounted while the list loads, fails and retries', () => {
    mockViewportWidth(1440);
    data.clubs = [];
    data.filteredClubs = [];
    data.hasError = true;
    const { refresh } = renderAt('/clubs/c2');

    expect(screen.getByText("We couldn't load your clubs.")).toBeInTheDocument();
    expect(screen.getByText('the open club')).toBeInTheDocument();

    // A retry: the list loads again, then fails again. The club never leaves the pane.
    data.hasError = false;
    data.isLoading = true;
    refresh();
    expect(screen.getByText('the open club')).toBeInTheDocument();
    expect(detailMounts.count).toBe(1);
  });

  it('opens Add Club from the URL beside an open club, and closing it drops the parameter', async () => {
    const user = userEvent.setup();
    mockViewportWidth(1440);
    renderAt('/clubs/c2');

    await user.click(screen.getByRole('button', { name: 'Add Club' }));

    expect(screen.getByRole('dialog', { name: 'Add Club panel' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/clubs/c2?create=true');
    expect(screen.getByText('the open club')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('dialog', { name: 'Add Club panel' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/clubs\/c2$/);
  });

  it('opens Add Club on a club route reached with ?create=true', () => {
    mockViewportWidth(1440);
    renderAt('/clubs/c2?create=true');

    expect(screen.getByRole('dialog', { name: 'Add Club panel' })).toBeInTheDocument();
  });
});
