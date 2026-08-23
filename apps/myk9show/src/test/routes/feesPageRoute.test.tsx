/**
 * MYK9-229 — /fees exists so a club admin can forward ONE URL that answers
 * "why is there a service fee?" to a treasurer, a board, or an exhibitor who
 * has never signed up. Behind an auth wall it stops being shareable and the
 * club is back to paraphrasing, which is how "part of it is card processing"
 * becomes a claim we never made.
 *
 * Asserted by rendering the production route tree with `ProtectedRoute`
 * replaced by a visible auth wall, rather than by grepping the JSX: a source
 * check passes just as happily on a route that renders nothing.
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

vi.mock('@/hooks/queries/usePlatformFeeRates', () => ({
  usePlatformFeeRates: () => ({ percent: 7, flatCents: 0, minCents: 0 }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>{PublicRoutes()}</Routes>
    </MemoryRouter>
  );
}

describe('/fees route', () => {
  it('renders the fee explanation to a signed-out visitor', async () => {
    renderAt('/fees');

    expect(await screen.findByRole('heading', { name: /how our fees work/i })).toBeInTheDocument();
    expect(screen.queryByTestId('auth-wall')).not.toBeInTheDocument();
  });

  it('control: the harness DOES flag a route that sits behind the auth gate', async () => {
    // Without this the first assertion is vacuous — it would also pass if the
    // mocked ProtectedRoute never rendered its marker anywhere.
    renderAt('/cart');

    expect(await screen.findByTestId('auth-wall')).toBeInTheDocument();
  });
});
