/** MYK9-1280: /signup and /login redirect to the real auth pages, keeping search and hash. */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Outlet,
  RouterProvider,
  Route,
  createMemoryRouter,
  createRoutesFromElements,
  useLocation,
} from 'react-router-dom';
import { AuthAliasRoutes } from './authAliasRoutes';

function Landed() {
  const { pathname, search, hash } = useLocation();
  return <div data-testid="landed">{`${pathname}${search}${hash}`}</div>;
}

// Same construction as router.tsx: the aliases are children of a pathless-parent route.
function renderAt(path: string) {
  const router = createMemoryRouter(
    createRoutesFromElements(
      <Route path="/" element={<Outlet />}>
        {AuthAliasRoutes()}
        <Route path="sign-in" element={<Landed />} />
        <Route path="sign-up" element={<Landed />} />
      </Route>
    ),
    { initialEntries: [path] }
  );
  return render(<RouterProvider router={router} />);
}

describe('auth alias redirects', () => {
  it('redirects /signup to /sign-up', () => {
    renderAt('/signup');
    expect(screen.getByTestId('landed')).toHaveTextContent('/sign-up');
  });

  it('redirects /login to /sign-in', () => {
    renderAt('/login');
    expect(screen.getByTestId('landed')).toHaveTextContent('/sign-in');
  });

  it('keeps returnTo and hash across the alias', () => {
    renderAt('/signup?returnTo=/shows/x#top');
    expect(screen.getByTestId('landed')).toHaveTextContent('/sign-up?returnTo=/shows/x#top');
  });

  it('keeps redirectTo across /login', () => {
    renderAt('/login?redirectTo=%2Fshows%2Fx');
    expect(screen.getByTestId('landed')).toHaveTextContent('/sign-in?redirectTo=%2Fshows%2Fx');
  });
});
