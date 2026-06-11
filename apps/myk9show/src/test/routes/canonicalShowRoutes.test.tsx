import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { LegacySecretaryShowRedirect } from '@/routes/showRouteRedirects';

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderRedirect(initialPath: string, subPath?: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/secretary/shows/:showId/*"
          element={<LegacySecretaryShowRedirect subPath={subPath} />}
        />
        <Route path="/shows/:id/*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('canonical show route redirects', () => {
  it('redirects the legacy secretary show base route to canonical setup', async () => {
    renderRedirect('/secretary/shows/show-1');
    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1/setup');
  });

  it('redirects a legacy secretary show subroute to the matching canonical subroute', async () => {
    renderRedirect('/secretary/shows/show-1/show-desk', 'show-desk');
    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1/show-desk');
  });

  it('preserves query strings on legacy secretary show redirects', async () => {
    renderRedirect('/secretary/shows/show-1/reports?report=result-catalog&trialId=trial-7', 'reports');
    expect(await screen.findByTestId('location')).toHaveTextContent(
      '/shows/show-1/reports?report=result-catalog&trialId=trial-7'
    );
  });
});
