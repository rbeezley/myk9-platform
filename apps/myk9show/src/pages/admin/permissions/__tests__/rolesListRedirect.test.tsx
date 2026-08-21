import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe('/admin/permissions/roles redirect', () => {
  it('redirects to the overview console rather than a second roles list', () => {
    render(
      <MemoryRouter initialEntries={['/admin/permissions/roles']}>
        <Routes>
          <Route
            path="/admin/permissions/roles"
            element={<Navigate to="/admin/permissions" replace />}
          />
          <Route path="/admin/permissions" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/permissions');
  });
});
