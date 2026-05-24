import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
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

vi.mock('@/pages/secretary/ShowWorkbenchPage', async () => {
  const { useLocation } =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ShowWorkbenchPage: () => {
      const location = useLocation();
      return (
        <div data-testid="show-workbench">
          {location.pathname}
          {location.search}
        </div>
      );
    },
  };
});

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

function renderSecretaryRoutes(initialPath: string) {
  mockUseAuth.mockReturnValue(makeAuthReturn());
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>{SecretaryRoutes()}</Routes>
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

  it('redirects day-of to the active show Show Desk phase', async () => {
    renderSecretaryRoutes('/secretary/day-of');

    expect(await screen.findByTestId('show-workbench')).toHaveTextContent(
      '/secretary/shows/show-1?phase=show-desk'
    );
  });

  it('redirects the secretary index to the active show workbench', async () => {
    renderSecretaryRoutes('/secretary');

    expect(await screen.findByTestId('show-workbench')).toHaveTextContent(
      '/secretary/shows/show-1'
    );
  });

  it('redirects check-in to Show Desk', async () => {
    renderSecretaryRoutes('/secretary/check-in');

    expect(await screen.findByTestId('show-workbench')).toHaveTextContent(
      '/secretary/shows/show-1?phase=show-desk'
    );
  });

  it('redirects run-order to Setup', async () => {
    renderSecretaryRoutes('/secretary/run-order');

    expect(await screen.findByTestId('show-workbench')).toHaveTextContent(
      '/secretary/shows/show-1?phase=setup'
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

    expect(await screen.findByTestId('show-workbench')).toHaveTextContent(
      '/secretary/shows/stored-show?phase=show-desk'
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
});
