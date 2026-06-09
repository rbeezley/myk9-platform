import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShowContextNav } from './ShowContextNav';

function renderNav(path = '/secretary/shows/show-42') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/secretary/shows/:showId/*" element={<ShowContextNav />} />
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

  it('Setup link points to the show base path', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute(
      'href',
      '/secretary/shows/show-42'
    );
  });

  it('Show Desk link points to the show-desk sub-route', () => {
    renderNav();
    expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute(
      'href',
      '/secretary/shows/show-42/show-desk'
    );
  });

  it('marks Setup as active on the base path', () => {
    renderNav('/secretary/shows/show-42');
    expect(screen.getByRole('link', { name: 'Setup' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Show Desk as active on the show-desk path', () => {
    renderNav('/secretary/shows/show-42/show-desk');
    expect(screen.getByRole('link', { name: 'Show Desk' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Setup' })).not.toHaveAttribute('aria-current', 'page');
  });

  it('renders nothing when showId is absent', () => {
    render(
      <MemoryRouter initialEntries={['/secretary/shows']}>
        <Routes>
          <Route path="/secretary/shows" element={<ShowContextNav />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('show-context-nav')).not.toBeInTheDocument();
  });
});
