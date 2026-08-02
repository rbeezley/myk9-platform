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
});
