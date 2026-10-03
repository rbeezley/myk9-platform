/**
 * MYK9-907: the legacy /trials/:trialId/classes bookmark must not bounce a cold browser to the
 * dashboard before the trial has loaded. Rendered through the REAL secretary route table.
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

describe('legacy /trials/:trialId/classes redirect', () => {
  beforeEach(() => {
    setQuery({});
    useTrialStore.setState({ trials: [], isLoading: false });
  });

  it('warm store: lands on the show home (Select classes)', async () => {
    useTrialStore.setState({ trials: [{ id: 'trial-9', showId: 'show-3' }] as never });
    renderAt('/trials/trial-9/classes');
    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/shows/show-3?select=classes&trialId=trial-9'
    );
  });

  it('cold store: lands on the show home (Select classes) once the by-id query resolves', async () => {
    setQuery({ data: { id: 'trial-9', showId: 'show-3' }, isSuccess: true });
    renderAt('/trials/trial-9/classes');
    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/shows/show-3?select=classes&trialId=trial-9'
    );
  });

  it('cold store, query pending: stays put and does not go to the dashboard', () => {
    renderAt('/trials/trial-9/classes');
    expect(screen.getByTestId('location')).toHaveTextContent('/trials/trial-9/classes');
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });

  it('cold store, query failed: shows a retry error, not the dashboard', () => {
    setQuery({ isError: true });
    renderAt('/trials/trial-9/classes');
    expect(screen.getByText(/couldn't load this trial/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/trials/trial-9/classes');
  });

  it('trial confirmed absent: falls back to the dashboard', async () => {
    setQuery({ data: null, isSuccess: true });
    renderAt('/trials/trial-9/classes');
    expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/secretary/dashboard');
  });
});
