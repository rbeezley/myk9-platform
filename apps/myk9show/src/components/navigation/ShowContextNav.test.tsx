import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShowContextNav } from './ShowContextNav';

function renderNav(path = '/shows/show-42/setup') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/shows/:showId/*" element={<ShowContextNav />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ShowContextNav', () => {
  it('renders all visible management section links without Setup', () => {
    renderNav();
    const labels = [
      'Show Desk',
      'Entry Management',
      'Reports',
      'Results & Check-In',
      'Submit Results',
    ];
    for (const label of labels) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole('link', { name: 'Setup' })).not.toBeInTheDocument();
  });

  it('Show Desk link points to the canonical show-desk sub-route', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute(
      'href',
      '/shows/show-42/show-desk'
    );
  });

  it('does not expose a Setup active state on the compatibility path', () => {
    renderNav('/shows/show-42/setup');
    expect(screen.queryByRole('link', { name: 'Setup' })).not.toBeInTheDocument();
  });

  it('marks Show Desk as active on the show-desk path', () => {
    renderNav('/shows/show-42/show-desk');
    expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Setup' })).not.toBeInTheDocument();
  });

  it('supports canonical routes that use an id param name', () => {
    render(
      <MemoryRouter initialEntries={['/shows/show-42/reports']}>
        <Routes>
          <Route path="/shows/:id/*" element={<ShowContextNav />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Setup' })).not.toBeInTheDocument();
  });

  it('renders nothing when showId is absent', () => {
    render(
      <MemoryRouter initialEntries={['/shows']}>
        <Routes>
          <Route path="/shows" element={<ShowContextNav />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('show-context-nav')).not.toBeInTheDocument();
  });

  it('uses a mobile-safe horizontal rail', () => {
    renderNav();

    const nav = screen.getByTestId('show-context-nav');
    expect(nav.firstElementChild?.className).toContain('max-w-full');
    expect(screen.getByRole('link', { name: 'Entry Management' }).className).toContain('min-h-11');
  });
});
