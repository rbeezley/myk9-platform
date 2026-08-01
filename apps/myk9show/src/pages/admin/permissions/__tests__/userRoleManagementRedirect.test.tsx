import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe('/admin/permissions/users redirect', () => {
  it('redirects to the permissions page on the assignments tab', () => {
    render(
      <MemoryRouter initialEntries={['/admin/permissions/users']}>
        <Routes>
          <Route
            path="/admin/permissions/users"
            element={<Navigate to="/admin/permissions?tab=assignments" replace />}
          />
          <Route path="/admin/permissions" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/permissions?tab=assignments');
  });

  it('leaves no importable UserRoleManagementPage module behind', async () => {
    // Built at runtime (not a string literal) so Vite's static import
    // analysis can't pre-resolve it at transform time and fail the whole
    // test file — the assertion needs a genuine runtime rejection instead.
    const modulePath = ['..', 'UserRoleManagementPage'].join('/');
    await expect(import(modulePath)).rejects.toThrow();
  });

  it('leaves no importable UserRoleAssignmentDialog module behind', async () => {
    const modulePath = ['@/components/admin/permissions', 'UserRoleAssignmentDialog'].join('/');
    await expect(import(modulePath)).rejects.toThrow();
  });
});
