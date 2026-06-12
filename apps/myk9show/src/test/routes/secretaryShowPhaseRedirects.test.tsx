import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { SecretaryRoutes } from '@/routes/secretaryRoutes';
import { useShowStore } from '@/store/showStore';
import type { Show } from '@/types/show-types';

const mockUseAuth = vi.hoisted(() => vi.fn());

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

vi.mock('@/pages/secretary/SecretaryDashboardPage', () => ({
  SecretaryDashboardPage: () => <div data-testid="secretary-dashboard">Dashboard</div>,
}));

vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="redirect-loading" />,
}));

function makeShow(id: string): Show {
  return {
    id,
    name: 'Bluegrass Classic',
    organization: 'AKC',
    startDate: '2026-03-22',
    endDate: '2026-03-23',
    location: 'Louisville, KY',
    status: 'accepting_entries',
    events: [],
    source: 'myK9Show',
    entryOpenDate: '2026-01-01',
    entryCloseDate: '2027-12-31',
    preEntryFee: '$30',
    clubId: 'club-1',
    clubName: 'Bluegrass KC',
    clubAddress: '',
    clubEmail: '',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    stats: [],
    trials: [],
  };
}

function makeAuthReturn(email = 'secretary@example.com') {
  return {
    user: { id: 'u1', email },
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
}

function CanonicalShowRoute() {
  const location = useLocation();
  return (
    <div data-testid="canonical-show-route">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderSecretaryRoutes(initialPath: string) {
  mockUseAuth.mockReturnValue(makeAuthReturn());
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            {SecretaryRoutes()}
            <Route path="/shows/:id/*" element={<CanonicalShowRoute />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe('secretary show phase redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useShowStore.setState({
      selectedShowId: 'show-1',
      shows: [makeShow('show-1')],
      isLoading: false,
    });
  });

  it('redirects the legacy secretary show base route to canonical setup', async () => {
    renderSecretaryRoutes('/secretary/shows/show-1');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/setup'
    );
  });

  it('redirects legacy secretary show-desk to the canonical show-desk route', async () => {
    renderSecretaryRoutes('/secretary/shows/show-1/show-desk');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/show-desk'
    );
  });

  it('redirects legacy secretary setup to the canonical setup route', async () => {
    renderSecretaryRoutes('/secretary/shows/show-1/setup');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/setup'
    );
  });

  it('preserves query string through legacy secretary entry management redirects', async () => {
    renderSecretaryRoutes('/secretary/shows/show-1/entry-management?entryTab=pending');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/entry-management?entryTab=pending'
    );
  });

  it('redirects unknown legacy nested show paths into the canonical show namespace', async () => {
    renderSecretaryRoutes('/secretary/shows/show-1/legacy/path?x=1');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/legacy/path?x=1'
    );
  });

  it('redirects legacy show edit to the canonical edit query', async () => {
    renderSecretaryRoutes('/secretary/shows/show-1/edit');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1?edit=true'
    );
  });

  it('preserves existing query strings through the legacy show edit redirect', async () => {
    renderSecretaryRoutes('/secretary/shows/show-1/edit?returnTo=dashboard');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1?returnTo=dashboard&edit=true'
    );
  });

  it('redirects day-of to the active show show-desk sub-route', async () => {
    renderSecretaryRoutes('/secretary/day-of');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/show-desk'
    );
  });

  it('redirects the secretary index to the active show setup route', async () => {
    renderSecretaryRoutes('/secretary');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/setup'
    );
  });

  it('redirects check-in to Show Desk sub-route', async () => {
    renderSecretaryRoutes('/secretary/check-in');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/show-desk'
    );
  });

  it('redirects run-order to the canonical setup route', async () => {
    renderSecretaryRoutes('/secretary/run-order');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/setup'
    );
  });

  it('uses the last selected show from localStorage before the store hydrates', async () => {
    useShowStore.setState({
      selectedShowId: '',
      shows: [],
      isLoading: false,
    });
    localStorage.setItem('myk9show:entryMgmt:lastShowId', 'stored-show');

    renderSecretaryRoutes('/secretary/day-of');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/stored-show/show-desk'
    );
  });

  it('waits while show selection is still loading', () => {
    useShowStore.setState({
      selectedShowId: '',
      shows: [],
      isLoading: true,
    });

    renderSecretaryRoutes('/secretary/day-of');

    expect(screen.getByTestId('redirect-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('secretary-dashboard')).not.toBeInTheDocument();
  });

  it('falls back to dashboard when multiple shows exist and none is selected', async () => {
    useShowStore.setState({
      selectedShowId: '',
      shows: [makeShow('show-1'), makeShow('show-2')],
      isLoading: false,
    });

    renderSecretaryRoutes('/secretary/day-of');

    expect(await screen.findByTestId('secretary-dashboard')).toBeInTheDocument();
  });

  it('preserves query string through the entries redirect', async () => {
    renderSecretaryRoutes('/secretary/entries/show-1?entryTab=pending');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/entry-management?entryTab=pending'
    );
  });
});
