import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthContext, ProtectedRoute } from '@/context/AuthContext';
import type { AuthContextType } from '@/context/AuthContext';
import { UserRole } from '@/types/auth-types';
import { CREATE_SHOW_WIZARD_ROLES, canOpenCreateShowWizard } from './createShowWizardAccess';

/**
 * The server's create gate is `is_site_admin() OR is_club_admin(club) OR
 * is_trial_secretary(club)` (create_show_with_children), so the route must admit a
 * club admin who holds no secretary grant (MYK9-895).
 */
describe('create-show wizard access (MYK9-895)', () => {
  it('admits secretary, club admin and site admin', () => {
    expect(CREATE_SHOW_WIZARD_ROLES).toEqual(
      expect.arrayContaining([UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN])
    );
    expect(canOpenCreateShowWizard([UserRole.CLUB_ADMIN])).toBe(true);
  });

  it('still refuses roles the server refuses', () => {
    for (const role of [UserRole.EXHIBITOR, UserRole.JUDGE, UserRole.STEWARD]) {
      expect(canOpenCreateShowWizard([role])).toBe(false);
    }
    expect(canOpenCreateShowWizard(undefined)).toBe(false);
  });

  function renderRoute(roles: UserRole[]) {
    // hasRole mirrors AuthContext: any ACTIVE role row counts, whatever its scope, so a
    // club-scoped club_admin grant answers true.
    const value = {
      user: { id: 'u1', email: 'club-admin@example.com' },
      loading: false,
      hasRole: (role: string) => roles.includes(role as UserRole),
      hasPermission: () => true,
    } as unknown as AuthContextType;
    return render(
      <AuthContext.Provider value={value}>
        <MemoryRouter initialEntries={['/secretary/create-show/wizard']}>
          <Routes>
            <Route
              path="/secretary/create-show/wizard"
              element={
                <ProtectedRoute requiredRole={[...CREATE_SHOW_WIZARD_ROLES]}>
                  <div data-testid="wizard-page">Wizard</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );
  }

  it('renders the wizard for a club-admin-only user', () => {
    renderRoute([UserRole.CLUB_ADMIN]);
    expect(screen.getByTestId('wizard-page')).toBeInTheDocument();
  });

  it('turns an exhibitor away', () => {
    renderRoute([UserRole.EXHIBITOR]);
    expect(screen.queryByTestId('wizard-page')).not.toBeInTheDocument();
  });
});
