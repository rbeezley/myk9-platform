import React, { useEffect } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';

const listMounts = vi.fn();
const ownDogsOnly = vi.hoisted(() => ({ value: false }));

vi.mock('@/hooks/useRoleBasedData', () => ({
  useRosterIsOwnDogsOnly: () => ownDogsOnly.value,
}));

vi.mock('./BrowseDogsPage', () => {
  function BrowseDogsPageStub({ detail = null }: { detail?: React.ReactNode }) {
    useEffect(() => {
      listMounts();
    }, []);
    return (
      <div>
        <p>dogs list {detail ? '(split)' : '(full)'}</p>
        <Link to="/dogs/d2">open d2</Link>
        {detail}
      </div>
    );
  }
  return { default: BrowseDogsPageStub };
});
vi.mock('./DogDetailPage', () => ({
  default: () => <p>dog detail</p>,
}));

import DogsMasterDetailPage from './DogsMasterDetailPage';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dogs" element={<DogsMasterDetailPage />} />
        <Route path="/dogs/:id" element={<DogsMasterDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('DogsMasterDetailPage', () => {
  it('is split from the start at /dogs on a wide screen, with a prompt in the right pane', () => {
    mockViewportWidth(1600);
    renderAt('/dogs');
    expect(screen.getByText('dogs list (split)')).toBeInTheDocument();
    expect(screen.getByText('Select a dog to see its details')).toBeInTheDocument();
    expect(screen.queryByText('dog detail')).not.toBeInTheDocument();
    // With nothing open, the right pane carries the trail (Home > Dogs) and the page's one h1.
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(trail).getByText('Dogs')).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Dogs' })).toHaveClass('sr-only');
  });

  it('names the trail My Dogs when the roster is only the viewer’s own dogs', () => {
    mockViewportWidth(1600);
    ownDogsOnly.value = true;
    try {
      renderAt('/dogs');
      expect(screen.getByRole('heading', { level: 1, name: 'My Dogs' })).toBeInTheDocument();
    } finally {
      ownDogsOnly.value = false;
    }
  });

  it('shows the full list at /dogs on a narrow screen', () => {
    mockViewportWidth(1000);
    renderAt('/dogs');
    expect(screen.getByText('dogs list (full)')).toBeInTheDocument();
    expect(screen.queryByText('Select a dog to see its details')).not.toBeInTheDocument();
    // A phone's list view has no trail: the Browse tabs say where you are.
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).not.toBeInTheDocument();
  });

  it('shows the list and the dog together at /dogs/:id on a wide screen', () => {
    mockViewportWidth(1600);
    renderAt('/dogs/d1');
    expect(screen.getByText('dogs list (split)')).toBeInTheDocument();
    expect(screen.getByText('dog detail')).toBeInTheDocument();
  });

  it('keeps the page hop on a narrow screen: the dog replaces the list', () => {
    mockViewportWidth(1000);
    renderAt('/dogs/d1');
    expect(screen.getByText('dog detail')).toBeInTheDocument();
    expect(screen.queryByText(/dogs list/)).not.toBeInTheDocument();
  });

  it('keeps the list mounted when a different dog is opened (scroll and filters survive)', async () => {
    mockViewportWidth(1600);
    listMounts.mockClear();
    renderAt('/dogs/d1');
    await userEvent.click(screen.getByRole('link', { name: 'open d2' }));
    expect(screen.getByText('dog detail')).toBeInTheDocument();
    expect(listMounts).toHaveBeenCalledTimes(1);
  });
});
