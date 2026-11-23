/**
 * /about is linked from the landing and app footers, so it must render for a signed-out visitor.
 * Rendered through the production route tree with `ProtectedRoute` replaced by a visible auth wall.
 */

import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { PublicRoutes } from '@/routes/publicRoutes';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: null,
    loading: false,
    rbacLoading: false,
    hasRole: () => false,
    userWithRoles: null,
  }),
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/context/AuthContext', () => ({
  ProtectedRoute: ({ children }: { children?: ReactNode; fallback?: ReactNode }) => (
    <div data-testid="auth-wall">{children}</div>
  ),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>{PublicRoutes()}</Routes>
    </MemoryRouter>
  );
}

describe('/about route', () => {
  it('renders the About page to a signed-out visitor', async () => {
    renderAt('/about');

    expect(await screen.findByRole('heading', { name: /about myk9show/i })).toBeInTheDocument();
    expect(
      screen.getByText(/named after our founder.s two kids, Ryan and Kristin/i)
    ).toBeInTheDocument();
    expect(screen.queryByTestId('auth-wall')).not.toBeInTheDocument();
  });
});
