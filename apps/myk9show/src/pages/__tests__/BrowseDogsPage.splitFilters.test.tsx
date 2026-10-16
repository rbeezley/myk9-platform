import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Dog } from '@/types/dog-types';
import { mockViewportWidth } from '@/test/utils/mockViewportWidth';
import { DEFAULT_DOG_FILTERS } from '@/components/dogs/browse/dogBrowseFilters';
import { parseUrlFilters } from '@/hooks/urlFilters';

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

const dogs = [makeDog('d1', 'Rex'), makeDog('d2', 'Rexy')];
const data = { dogs, filteredDogs: dogs, isLoading: false, hasError: false };
const detailMounts = { count: 0 };

// Filters live in the URL, as in the real hook (useUrlFilters).
vi.mock('@/hooks/useBrowseDogsData', () => ({
  useBrowseDogsData: () => ({
    ...data,
    handleRetry: vi.fn(),
    filters: parseUrlFilters(useSearchParams()[0], DEFAULT_DOG_FILTERS),
    setFilters: vi.fn(),
    hasActiveFilters: false,
    clearAllFilters: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAuthContext', async importOriginal => ({
  ...((await importOriginal()) as object),
  useAuthContext: () => ({
    getUserRoles: () => ['secretary'],
    hasRole: (role: string) => role === 'secretary',
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

// Counts mounts, so a test can tell "still showing" from "unmounted and shown again".
function OpenDog() {
  useEffect(() => {
    detailMounts.count += 1;
  }, []);
  return <p>the open dog</p>;
}

function Probe() {
  const location = useLocation();
  return <p data-testid="loc">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(route: string) {
  const client = new QueryClient();
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/dogs/:id?" element={<BrowseDogsPage detail={<OpenDog />} />} />
        </Routes>
        <Probe />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = render(tree());
  return { ...result, refresh: () => result.rerender(tree()) };
}

const FILTERED = '/dogs/d1?search=rex&status=active&returnTo=%2Fshows&create=true';

describe('Dogs list beside an open dog', () => {
  beforeEach(() => {
    localStorage.clear();
    data.dogs = dogs;
    data.filteredDogs = dogs;
    data.isLoading = false;
    data.hasError = false;
    detailMounts.count = 0;
    mockViewportWidth(1600);
  });

  it('keeps the filters, and only the filters, on a row opened with the mouse', async () => {
    renderAt(FILTERED);
    const row = screen.getByRole('link', { name: /Rexy/ });
    expect(row).toHaveAttribute('href', '/dogs/d2?search=rex&status=active');

    await userEvent.click(row);
    expect(screen.getByTestId('loc')).toHaveTextContent('/dogs/d2?search=rex&status=active');
  });

  it('keeps the filters, and only the filters, on Up/Down', async () => {
    renderAt(FILTERED);
    screen.getAllByRole('link', { name: /Rex/ })[0]?.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByTestId('loc')).toHaveTextContent('/dogs/d2?search=rex&status=active');
  });

  it('carries no query string when no filter is set', () => {
    renderAt('/dogs/d1?create=true');
    expect(screen.getByRole('link', { name: /Rexy/ })).toHaveAttribute('href', '/dogs/d2');
  });

  it('keeps the open dog mounted while an empty list loads, fails and retries', () => {
    data.dogs = [];
    data.filteredDogs = [];
    data.isLoading = true;
    const { refresh } = renderAt('/dogs/d1');
    expect(screen.getByText('the open dog')).toBeInTheDocument();

    data.isLoading = false;
    data.hasError = true;
    refresh();
    expect(screen.getByText("We couldn't load your dogs.")).toBeInTheDocument();
    expect(screen.getByText('the open dog')).toBeInTheDocument();

    data.hasError = false;
    data.isLoading = true;
    refresh();
    expect(screen.getByText('the open dog')).toBeInTheDocument();
    expect(detailMounts.count).toBe(1);
  });
});
