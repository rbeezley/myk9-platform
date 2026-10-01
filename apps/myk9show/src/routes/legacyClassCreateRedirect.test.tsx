/**
 * MYK9-899: the Class Creation page is gone; its two URLs must land on the one class-create
 * flow (the wizard's add-classes mode) for the right show and trial. Rendered through the
 * REAL public + secretary route tables, so a route that stopped matching, or one the show
 * shell swallowed, fails here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Routes, useLocation } from 'react-router-dom';
import { AuthContext, type AuthContextType } from '@/context/AuthContext';
import { UserRole } from '@/types/auth-types';
import { useTrialStore } from '@/store/trialStore';
import { PublicRoutes } from './publicRoutes';
import { SecretaryRoutes } from './secretaryRoutes';

vi.mock('@/pages/secretary/ShowCreationWizardPage', () => ({
  default: function WizardStub() {
    const location = useLocation();
    return <div data-testid="wizard">{`${location.pathname}${location.search}`}</div>;
  },
}));

// The show page is the parent of the /shows/:id/... child routes; stub only that shell so the
// child redirect is exercised without loading a whole show.
vi.mock('@/pages/ShowDetailsPage', () => ({
  default: () => <Outlet />,
}));

vi.mock('@/pages/secretary/SecretaryDashboardPage', () => ({
  SecretaryDashboardPage: () => <div data-testid="dashboard" />,
}));

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
        <Routes>
          {PublicRoutes()}
          {SecretaryRoutes()}
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('retired class-creation URLs redirect into the wizard add-classes mode', () => {
  beforeEach(() => {
    mockTrialQuery.current = {
      data: undefined,
      isSuccess: false,
      isError: false,
      refetch: () => undefined,
    };
    useTrialStore.setState({
      trials: [{ id: 'trial-9', showId: 'show-3' }] as never,
      isLoading: false,
    });
  });

  it('/shows/:id/classes/:trialId/create keeps the show and focuses the trial', async () => {
    renderAt('/shows/show-3/classes/trial-9/create');
    expect(await screen.findByTestId('wizard')).toHaveTextContent(
      '/secretary/create-show/wizard?showId=show-3&mode=add-classes&trialId=trial-9'
    );
  });

  it('/trials/:trialId/classes/create looks the show up from the trial', async () => {
    renderAt('/trials/trial-9/classes/create');
    expect(await screen.findByTestId('wizard')).toHaveTextContent(
      '/secretary/create-show/wizard?showId=show-3&mode=add-classes&trialId=trial-9'
    );
  });

  describe('cold store (trial only reachable through the by-id query)', () => {
    beforeEach(() => {
      useTrialStore.setState({ trials: [], isLoading: false });
    });

    it('lands on the wizard once the by-id query resolves the trial', async () => {
      mockTrialQuery.current = {
        data: { id: 'trial-9', showId: 'show-3' },
        isSuccess: true,
        isError: false,
        refetch: () => undefined,
      };
      renderAt('/trials/trial-9/classes/create');
      expect(await screen.findByTestId('wizard')).toHaveTextContent(
        '/secretary/create-show/wizard?showId=show-3&mode=add-classes&trialId=trial-9'
      );
    });

    it('shows loading, not a redirect, while the query is pending', () => {
      renderAt('/trials/trial-9/classes/create');
      expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    });

    it('falls back to the dashboard only when the trial is confirmed absent', async () => {
      mockTrialQuery.current = {
        data: null,
        isSuccess: true,
        isError: false,
        refetch: () => undefined,
      };
      renderAt('/trials/trial-9/classes/create');
      expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
      expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
    });

    it('does not treat a failed read as absent', () => {
      mockTrialQuery.current = {
        data: undefined,
        isSuccess: false,
        isError: true,
        refetch: () => undefined,
      };
      renderAt('/trials/trial-9/classes/create');
      expect(screen.getByText(/couldn't load this trial/i)).toBeInTheDocument();
    });
  });
});
