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
  it('renders all 6 section links', () => {
    renderNav();
    const labels = ['Setup', 'Show Desk', 'Entry Management', 'Reports', 'Results Control', 'Submit Results'];
    for (const label of labels) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('Setup link points to the canonical setup sub-route', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute(
      'href',
      '/shows/show-42/setup'
    );
  });

  it('Show Desk link points to the show-desk sub-route', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute(
      'href',
      '/shows/show-42/show-desk'
    );
  });

  it('marks Setup as active on the setup path', () => {
    renderNav('/shows/show-42/setup');
    expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Show Desk as active on the show-desk path', () => {
    renderNav('/shows/show-42/show-desk');
    expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Setup' })).not.toHaveAttribute('aria-current', 'page');
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
    expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute(
      'href',
      '/shows/show-42/setup'
    );
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
});
