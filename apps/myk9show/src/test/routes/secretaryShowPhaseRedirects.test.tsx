import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/context/AuthContext';
import { SecretaryRoutes } from '@/routes/secretaryRoutes';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useToastStore } from '@/store/toastStore';
import type { Show } from '@/types/show-types';
import { fromAny } from '@total-typescript/shoehorn';

const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getUserPermissions: vi.fn().mockResolvedValue({
      roles: [
        {
          role_id: 'role-secretary',
          role: { name: 'secretary', display_name: 'Secretary' },
          is_active: true,
        },
      ],
      permissions: [],
      effectivePermissions: [],
      effectivePermissionScopes: [],
    }),
    getUserRoles: vi.fn().mockResolvedValue([]),
    getUserRolesByEmail: vi.fn().mockResolvedValue([]),
    hasPermission: vi.fn().mockResolvedValue(false),
    checkPermission: vi.fn().mockResolvedValue(false),
    clearUserCache: vi.fn(),
    clearAllCache: vi.fn(),
  },
}));

vi.mock('@/pages/secretary/SecretaryDashboardPage', () => ({
  SecretaryDashboardPage: () => <div data-testid="secretary-dashboard">Dashboard</div>,
}));

vi.mock('@/components/common/LoadingSkeleton', () => ({
  LoadingSkeleton: () => <div data-testid="redirect-loading" />,
}));

const originalLoadTrials = useTrialStore.getState().loadTrials;

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
    useTrialStore.setState({
      trials: [
        fromAny({
          id: 'trial-1',
          showId: 'show-1',
          name: 'Saturday Trial',
          trialDate: '2026-03-22',
          status: 'Scheduled',
        }),
      ],
      isLoading: false,
      loadTrials: originalLoadTrials,
    });
    useToastStore.setState({ toasts: [] });
  });

  it('redirects the legacy secretary show base route to canonical setup', async () => {
    renderSecretaryRoutes('/secretary/shows/show-1');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/setup'
    );
  });

  it('redirects the legacy show-desk phase query to canonical Show Desk', async () => {
    renderSecretaryRoutes('/secretary/shows/show-1?phase=show-desk&from=email');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/show-desk?from=email'
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

  it('redirects legacy personal tasks to the dashboard and explains the consolidation', async () => {
    renderSecretaryRoutes('/secretary/tasks');

    expect(await screen.findByTestId('secretary-dashboard')).toBeInTheDocument();
    expect(useToastStore.getState().toasts[0]?.payload).toMatchObject({
      id: 'tasks-moved',
      title: 'Tasks moved',
      body: 'Personal tasks now live on your secretary dashboard.',
    });
  });

  it('redirects legacy waitlist to the selected show exception and explains the consolidation', async () => {
    renderSecretaryRoutes('/secretary/waitlist');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/entry-management?tab=waitlist'
    );
    expect(useToastStore.getState().toasts[0]?.payload).toMatchObject({
      id: 'waitlist-moved',
      title: 'Waitlist moved',
      body: 'Waitlist work now lives in Entry Management for this show.',
    });
  });

  it('explains the waitlist dashboard fallback when no show context is available', async () => {
    useShowStore.setState({
      selectedShowId: '',
      shows: [makeShow('show-1'), makeShow('show-2')],
      isLoading: false,
    });

    renderSecretaryRoutes('/secretary/waitlist');

    expect(await screen.findByTestId('secretary-dashboard')).toBeInTheDocument();
    expect(useToastStore.getState().toasts[0]?.payload).toMatchObject({
      id: 'waitlist-no-show-context',
      title: 'Select a show to continue',
      body: 'Waitlist work lives in Entry Management inside a show.',
    });
  });

  it('redirects legacy trial class management to the show workbench class route', async () => {
    renderSecretaryRoutes('/trials/trial-1/classes');

    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/classes/trial-1'
    );
  });

  it('waits for trial hydration before falling back from a legacy class-management deep link', async () => {
    let resolveLoadTrials: (() => void) | undefined;
    useTrialStore.setState({
      trials: [],
      isLoading: false,
      loadTrials: vi.fn(() => {
        return new Promise<void>(resolve => {
          resolveLoadTrials = () => {
            useTrialStore.setState({
              trials: [
                fromAny({
                  id: 'trial-1',
                  showId: 'show-1',
                  name: 'Saturday Trial',
                  trialDate: '2026-03-22',
                  status: 'Scheduled',
                }),
              ],
              isLoading: false,
            });
            resolve();
          };
        });
      }),
    });

    renderSecretaryRoutes('/trials/trial-1/classes');

    expect(screen.getByTestId('redirect-loading')).toBeInTheDocument();
    await waitFor(() => expect(useTrialStore.getState().loadTrials).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveLoadTrials?.();
    });
    expect(await screen.findByTestId('canonical-show-route')).toHaveTextContent(
      '/shows/show-1/classes/trial-1'
    );
    expect(screen.queryByTestId('secretary-dashboard')).not.toBeInTheDocument();
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
