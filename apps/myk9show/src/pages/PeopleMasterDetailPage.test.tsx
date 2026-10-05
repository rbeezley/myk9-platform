import React, { useEffect } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';

const listMounts = vi.fn();

vi.mock('./BrowsePeoplePage', () => {
  function BrowsePeoplePageStub({ detail = null }: { detail?: React.ReactNode }) {
    useEffect(() => {
      listMounts();
    }, []);
    return (
      <div>
        <p>people list {detail ? '(split)' : '(full)'}</p>
        <Link to="/people/p2">open p2</Link>
        {detail}
      </div>
    );
  }
  return { default: BrowsePeoplePageStub };
});
vi.mock('./PersonDetailPage', () => ({
  default: () => <p>person detail</p>,
}));

import PeopleMasterDetailPage from './PeopleMasterDetailPage';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/people/:id?" element={<PeopleMasterDetailPage />} />
      </Routes>
    </MemoryRouter>
  );

describe('PeopleMasterDetailPage', () => {
  it('is split from the start at /people on a wide screen, with a prompt in the right pane', () => {
    mockViewportWidth(1600);
    renderAt('/people');
    expect(screen.getByText('people list (split)')).toBeInTheDocument();
    expect(screen.getByText('Select a person to see their details')).toBeInTheDocument();
    expect(screen.queryByText('person detail')).not.toBeInTheDocument();
  });

  it('shows the full list at /people on a narrow screen', () => {
    mockViewportWidth(1000);
    renderAt('/people');
    expect(screen.getByText('people list (full)')).toBeInTheDocument();
    expect(screen.queryByText('Select a person to see their details')).not.toBeInTheDocument();
  });

  it('shows the list and the person together at /people/:id on a wide screen', () => {
    mockViewportWidth(1600);
    renderAt('/people/p1');
    expect(screen.getByText('people list (split)')).toBeInTheDocument();
    expect(screen.getByText('person detail')).toBeInTheDocument();
  });

  it('keeps the page hop on a narrow screen: the person replaces the list', () => {
    mockViewportWidth(1000);
    renderAt('/people/p1');
    expect(screen.getByText('person detail')).toBeInTheDocument();
    expect(screen.queryByText(/people list/)).not.toBeInTheDocument();
  });

  it('keeps the list mounted when a different person is opened (scroll and filters survive)', async () => {
    mockViewportWidth(1600);
    listMounts.mockClear();
    renderAt('/people/p1');
    await userEvent.click(screen.getByRole('link', { name: 'open p2' }));
    expect(screen.getByText('person detail')).toBeInTheDocument();
    expect(listMounts).toHaveBeenCalledTimes(1);
  });
});
