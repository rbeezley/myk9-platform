import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Dog } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';

const makeDog = (id: string, callName: string): Dog => ({
  id,
  name: `Champion ${callName}`,
  callName,
  breed: 'Golden Retriever',
  sex: 'male',
  ownerId: 'owner-1',
  ownerName: 'Jane Doe',
  registrations: [],
});

const dogs = [makeDog('d1', 'Max'), makeDog('d2', 'Maple')];

vi.mock('@/hooks/useBrowseDogsData', () => ({
  useBrowseDogsData: () => ({
    dogs,
    filteredDogs: dogs,
    isLoading: false,
    hasError: false,
    handleRetry: vi.fn(),
    filters: { search: '', status: 'all' },
    setFilters: vi.fn(),
    hasActiveFilters: false,
    clearAllFilters: vi.fn(),
  }),
}));

const mockGetUserRoles = vi.fn().mockReturnValue(['secretary']);
const mockHasRole = vi.fn((role: UserRole) => (mockGetUserRoles() as string[]).includes(role));

vi.mock('@/hooks/useAuthContext', async importOriginal => ({
  ...((await importOriginal()) as object),
  useAuthContext: () => ({
    getUserRoles: mockGetUserRoles,
    hasRole: mockHasRole,
    userWithRoles: { id: 'user-1', databaseUserId: 'person-1', roles: [] },
  }),
}));

vi.mock('@/hooks/useRoleBasedData', async importOriginal => ({
  ...((await importOriginal()) as object),
  useCurrentUserPersonId: () => 'person-1',
}));

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ hasPermission: () => true, isLoading: false, refresh: vi.fn() }),
}));

vi.mock('@/components/panels/edit', () => ({ AddDogPanel: () => null }));

import BrowseDogsPage from '../BrowseDogsPage';

function Probe() {
  return <p data-testid="loc">{useLocation().pathname}</p>;
}

function renderSplit(path = '/dogs/d1') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/dogs/:id" element={<BrowseDogsPage detail={<p>the open dog</p>} />} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('BrowseDogsPage beside an open dog', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetUserRoles.mockReturnValue(['secretary']);
    mockViewportWidth(1600);
  });

  it('shows one compact link per dog beside the dog, not the table', () => {
    renderSplit();
    expect(screen.getByText('the open dog')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Maple/ })).toHaveAttribute('href', '/dogs/d2');
    expect(screen.queryByRole('columnheader', { name: 'Name' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Max/ })).toHaveAttribute('aria-current', 'page');
  });

  it('swaps to the full-width table in select mode and back on Done', async () => {
    renderSplit();
    await userEvent.click(screen.getByRole('button', { name: 'Select dogs' }));
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.queryByText('the open dog')).not.toBeInTheDocument();
    expect(screen.getByText(/Selecting dogs\. Tick rows/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('the open dog')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Name' })).not.toBeInTheDocument();
  });

  it('never carries ticks out of select mode', async () => {
    renderSplit();
    await userEvent.click(screen.getByRole('button', { name: 'Select dogs' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Max' }));
    expect(screen.getByText(/1 dog selected/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.click(screen.getByRole('button', { name: 'Select dogs' }));
    expect(screen.queryByText(/dog selected/i)).not.toBeInTheDocument();
  });

  it('opening a dog from the select-mode table ends select mode and shows the dog', async () => {
    renderSplit();
    await userEvent.click(screen.getByRole('button', { name: 'Select dogs' }));
    await userEvent.click(screen.getByText('Maple'));
    expect(screen.getByTestId('loc')).toHaveTextContent('/dogs/d2');
    expect(screen.getByRole('button', { name: 'Select dogs' })).toHaveFocus();
    expect(screen.queryByRole('columnheader', { name: 'Name' })).not.toBeInTheDocument();
  });

  it('offers no select mode to an exhibitor, whose roster has no bulk actions', () => {
    mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);
    renderSplit();
    expect(screen.queryByRole('button', { name: 'Select dogs' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Maple/ })).toBeInTheDocument();
  });
});
