import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LegacySecretaryShowRedirect } from '@/routes/showRouteRedirects';
import { PublicRoutes } from '@/routes/publicRoutes';

const mockCanManage = vi.hoisted(() => ({ value: false }));

vi.mock('@/context/AuthContext', () => ({
  ProtectedRoute: ({
    children,
    fallback,
    requiredRole,
  }: {
    children: ReactNode;
    fallback?: ReactNode;
    requiredRole?: unknown;
  }) => <>{requiredRole && !mockCanManage.value ? fallback : children}</>,
}));

vi.mock('@/components/common/PageTransition', () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/routes/utils/SuspenseWrapper', () => ({
  SuspenseWrapper: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/pages/ShowDetailsPage', async () => {
  const router = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    default: function MockShowDetailsPage() {
      const location = router.useLocation();
      return (
        <div data-testid="production-show-details">
          <div data-testid="production-show-details-location">{location.pathname}</div>
          <router.Outlet />
        </div>
      );
    },
  };
});

vi.mock('@/pages/secretary/ShowWorkbenchShowDeskPage', () => ({
  ShowWorkbenchShowDeskPage: () => <div data-testid="production-show-desk">Show Desk</div>,
}));

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

function CanonicalShowRouteHarness() {
  return (
    <Routes>
      <Route
        path="/shows/:id"
        element={
          <div data-testid="show-shell">
            <LocationProbe />
            <Outlet />
          </div>
        }
      >
        <Route path="setup" element={<div data-testid="setup-section">Setup</div>} />
        <Route path="show-desk" element={<div data-testid="show-desk-section">Show Desk</div>} />
        <Route path="entry-management" element={<div data-testid="entries-section">Entries</div>} />
        <Route path="reports" element={<div data-testid="reports-section">Reports</div>} />
        <Route
          path="results-control"
          element={<div data-testid="results-control-section">Results Control</div>}
        />
        <Route
          path="submit-results"
          element={<div data-testid="submit-results-section">Submit Results</div>}
        />
      </Route>
    </Routes>
  );
}

function CanonicalAccessProbe({ canManage }: { canManage: boolean }) {
  const location = useLocation();

  if (!canManage) {
    return <Navigate to="/shows/show-1" replace />;
  }

  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
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

describe('canonical show management routes', () => {
  it.each([
    ['/shows/show-1/setup', 'setup-section'],
    ['/shows/show-1/show-desk', 'show-desk-section'],
    ['/shows/show-1/entry-management', 'entries-section'],
    ['/shows/show-1/reports', 'reports-section'],
    ['/shows/show-1/results-control', 'results-control-section'],
    ['/shows/show-1/submit-results', 'submit-results-section'],
  ])('renders %s at the canonical section path', async (path, sectionTestId) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <CanonicalShowRouteHarness />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('show-shell')).toBeInTheDocument();
    expect(screen.getByTestId(sectionTestId)).toBeInTheDocument();
  });

  it('redirects a non-manager direct management URL back to the canonical overview', async () => {
    render(
      <MemoryRouter initialEntries={['/shows/show-1/show-desk?from=dashboard']}>
        <Routes>
          <Route
            path="/shows/:id/show-desk"
            element={<CanonicalAccessProbe canManage={false} />}
          />
          <Route path="/shows/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('location')).toHaveTextContent('/shows/show-1');
  });

  it('redirects non-manager direct management URLs through the production PublicRoutes tree', async () => {
    mockCanManage.value = false;

    render(
      <MemoryRouter initialEntries={['/shows/show-1/show-desk']}>
        <Routes>
          {PublicRoutes()}
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByTestId('production-show-details-location')).toHaveTextContent(
      '/shows/show-1'
    );
    expect(screen.queryByTestId('production-show-desk')).not.toBeInTheDocument();
  });
});
