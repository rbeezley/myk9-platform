/** MYK9-1280: /signup and /login redirect to the real auth pages. */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthAliasRoutes } from './authAliasRoutes';

function Landed() {
  return <div data-testid="landed">{useLocation().pathname}</div>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {AuthAliasRoutes()}
        <Route path="/sign-in" element={<Landed />} />
        <Route path="/sign-up" element={<Landed />} />
      </Routes>
    </MemoryRouter>
  );
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
});
