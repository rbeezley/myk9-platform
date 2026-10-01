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
});
