/**
 * MYK9-1297: the retired Mission Control URLs redirect instead of 404ing. The pipeline URL carries
 * only a trial id, so it resolves the show like the MYK9-907 redirect. Rendered through the REAL
 * secretary route table.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Routes, useLocation } from 'react-router-dom';
import { AuthContext, type AuthContextType } from '@/context/AuthContext';
import { UserRole } from '@/types/auth-types';
import { useTrialStore } from '@/store/trialStore';
import { SecretaryRoutes } from './secretaryRoutes';

// The show page is the parent of the /shows/:id/... child routes; stub only that shell, and
// show the landed path so the redirect target is asserted exactly.
vi.mock('@/pages/ShowDetailsPage', () => ({
  default: () => <Outlet />,
}));
vi.mock('@/pages/secretary/SecretaryDashboardPage', () => ({
  SecretaryDashboardPage: () => <div data-testid="dashboard" />,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

const mockTrialQuery = vi.hoisted(() => ({
  current: { data: undefined, isSuccess: false, isError: false, refetch: () => undefined } as {
    data: unknown;
    isSuccess: boolean;
    isError: boolean;
    refetch: () => unknown;
  },
}));
vi.mock('@/hooks/queries/useTrialsDatabase', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useTrialsDatabase')>()),
  useTrialQuery: (id?: string) =>
    id ? mockTrialQuery.current : { data: undefined, isSuccess: false, isError: false },
}));

const authValue = {
  user: { id: 'u1', email: 'sec@example.com' },
  loading: false,
  hasRole: (role: string) => role === UserRole.SECRETARY,
  hasPermission: () => true,
} as unknown as AuthContextType;

function renderAt(path: string) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <Routes>{SecretaryRoutes()}</Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

function setQuery(partial: Partial<typeof mockTrialQuery.current>) {
  mockTrialQuery.current = {
    data: undefined,
    isSuccess: false,
    isError: false,
    refetch: () => undefined,
    ...partial,
  };
}

describe('retired Mission Control URLs (MYK9-1297)', () => {
  beforeEach(() => {
    setQuery({});
    useTrialStore.setState({ trials: [], isLoading: false });
  });

  it('/secretary/pipeline/:trialId lands on the show home (warm store)', async () => {
    useTrialStore.setState({ trials: [{ id: 'trial-9', showId: 'show-3' }] as never });
    renderAt('/secretary/pipeline/trial-9');
    expect(await screen.findByTestId('location')).toHaveTextContent(/^\/shows\/show-3$/);
  });

  it('/secretary/pipeline/:trialId lands on the show home once a cold by-id query resolves', async () => {
    setQuery({ data: { id: 'trial-9', showId: 'show-3' }, isSuccess: true });
    renderAt('/secretary/pipeline/trial-9');
    expect(await screen.findByTestId('location')).toHaveTextContent(/^\/shows\/show-3$/);
  });

  it('/secretary/pipeline/:trialId waits while the cold query is pending', () => {
    renderAt('/secretary/pipeline/trial-9');
    expect(screen.getByTestId('location')).toHaveTextContent('/secretary/pipeline/trial-9');
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });

  it('/secretary/pipeline/:trialId shows a retry error when the cold query failed', () => {
    setQuery({ isError: true });
    renderAt('/secretary/pipeline/trial-9');
    expect(screen.getByText(/couldn't load this trial/i)).toBeInTheDocument();
  });

  it('/secretary/pipeline/:trialId falls back to the dashboard for a missing trial', async () => {
    setQuery({ data: null, isSuccess: true });
    renderAt('/secretary/pipeline/trial-9');
    expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
  });

  it('the class secretary dashboard URL lands on the class page', async () => {
    renderAt('/shows/show-3/trials/trial-9/classes/class-2/secretary');
    expect(await screen.findByTestId('location')).toHaveTextContent(
      /^\/shows\/show-3\/trials\/trial-9\/classes\/class-2$/
    );
  });
});
