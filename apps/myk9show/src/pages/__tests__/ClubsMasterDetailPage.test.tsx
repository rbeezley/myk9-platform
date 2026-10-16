import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  captureCsvDownload,
  registeredPageExports,
  resetPageExports,
} from '@/test/utils/csvDownload';
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

const addClub = vi.hoisted(() => vi.fn());

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ addClub, selectClub: vi.fn() }),
}));

vi.mock('@/components/clubs/refreshScopesAfterClubUpload', () => ({
  refreshScopesAfterClubUpload: vi.fn(),
}));

// Counts mounts, so a test can tell "still showing" from "unmounted and shown again".
function OpenClub() {
  useEffect(() => {
    detailMounts.count += 1;
  }, []);
  return <p>the open club</p>;
}

vi.mock('../ClubDetailPage', () => ({ default: OpenClub }));

// Saves the way EditPanelWrapper does: await onSave, then close the panel.
vi.mock('@/components/panels/edit/ClubEditPanel', () => ({
  ClubEditPanel: ({
    onClose,
    onSave,
  }: {
    onClose: () => void;
    onSave: (
      club: Record<string, unknown>,
      context: { runSelfNavigation: (navigate: () => void) => void }
    ) => Promise<void>;
  }) => (
    <div role="dialog" aria-label="Add Club panel">
      <button type="button" onClick={onClose}>
        Close panel
      </button>
      <button
        type="button"
        onClick={async () => {
          await onSave({ name: 'New Club' }, { runSelfNavigation: navigate => navigate() });
          onClose();
        }}
      >
        Save club
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
        <Link to="/clubs/c2?create=true">Add a club from elsewhere</Link>
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
    addClub.mockReset();
    resetPageExports();
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

  it('opens Add Club beside an open club and closes it without touching the URL', async () => {
    const user = userEvent.setup();
    mockViewportWidth(1440);
    renderAt('/clubs/c2');

    await user.click(screen.getByRole('button', { name: 'Add Club' }));
    expect(screen.getByRole('dialog', { name: 'Add Club panel' })).toBeInTheDocument();
    expect(screen.getByText('the open club')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByRole('dialog', { name: 'Add Club panel' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/clubs\/c2$/);
  });

  it('opens Add Club when ?create=true arrives on the page already showing', async () => {
    const user = userEvent.setup();
    mockViewportWidth(1440);
    renderAt('/clubs/c2');

    await user.click(screen.getByRole('link', { name: 'Add a club from elsewhere' }));

    expect(screen.getByRole('dialog', { name: 'Add Club panel' })).toBeInTheDocument();
    expect(detailMounts.count).toBe(1);
  });

  it('lands on the new club after a save, even though the panel closes afterwards', async () => {
    const user = userEvent.setup();
    addClub.mockResolvedValue('club-new');
    mockViewportWidth(1440);
    renderAt('/clubs/c2?create=true');

    await user.click(screen.getByRole('button', { name: 'Save club' }));

    // The save is awaited before the panel closes; wait for both to land.
    await waitFor(() => expect(addClub).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/clubs\/club-new$/)
    );
    expect(screen.queryByRole('dialog', { name: 'Add Club panel' })).not.toBeInTheDocument();
  });

  it('keeps the Export CSV page action beside an open club', () => {
    mockViewportWidth(1440);
    renderAt('/clubs/c2');

    const registered = registeredPageExports();
    expect(registered.map(item => item.id)).toEqual(['clubs']);

    const download = captureCsvDownload();
    try {
      registered[0]!.run();
      const lines = download.csv().split('\n');
      expect(lines[0]).toBe('Club,Type,Location,Members,Upcoming Shows');
      expect(lines).toHaveLength(3);
      expect(lines[2]).toContain('"Bay Scent Club"');
      expect(lines[2]).toContain('"2"');
    } finally {
      download.restore();
    }
  });

  it('opens Add Club on a club route reached with ?create=true', () => {
    mockViewportWidth(1440);
    renderAt('/clubs/c2?create=true');

    expect(screen.getByRole('dialog', { name: 'Add Club panel' })).toBeInTheDocument();
  });
});
