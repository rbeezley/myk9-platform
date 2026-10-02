/**
 * MYK9-934: the /dogs bulk Delete is offered to a site admin only.
 *
 * soft_delete_dog admits the dog's owner, a co-owner or a site admin. Across a whole roster
 * selection only the site admin passes for every dog, and secretaries and club admins never
 * delete a dog. The old gate, `hasPermission('dog:delete')`, leaked to every secretary or club
 * admin who also holds the exhibitor role, because exhibitor grants `dog:delete`. The RBAC mock
 * below grants every permission to model exactly that viewer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Dog } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';

const dog: Dog = {
  id: '0b6f4f8e-3a2d-4c1b-9e8f-7a6b5c4d3e2f',
  name: 'Champion Goldenworth Max',
  callName: 'Max',
  breed: 'Golden Retriever',
  sex: 'male',
  ownerId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
  ownerName: 'Jane Doe',
  registrations: [],
};

vi.mock('@/hooks/useBrowseDogsData', () => ({
  useBrowseDogsData: () => ({
    dogs: [dog],
    filteredDogs: [dog],
    isLoading: false,
    hasError: false,
    handleRetry: vi.fn(),
    filters: { search: '', status: 'all' },
    setFilters: vi.fn(),
    hasActiveFilters: false,
    clearAllFilters: vi.fn(),
  }),
}));

let mockRoles: UserRole[] = [];
vi.mock('@/hooks/useAuthContext', async importOriginal => ({
  ...(await importOriginal<object>()),
  useAuthContext: () => ({
    getUserRoles: () => mockRoles,
    hasRole: (role: UserRole) => mockRoles.includes(role),
    // The viewer's auth uid; their people.id is a different uuid.
    userWithRoles: {
      id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      databaseUserId: '6f1c2a3b-0d4e-4f5a-8b6c-7d8e9f0a1b2c',
      roles: [],
    },
  }),
}));

vi.mock('@/hooks/useRoleBasedData', async importOriginal => ({
  ...(await importOriginal<object>()),
  useCurrentUserPersonId: () => '6f1c2a3b-0d4e-4f5a-8b6c-7d8e9f0a1b2c',
}));

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({ hasPermission: () => true, isLoading: false, refresh: vi.fn() }),
}));

vi.mock('@/components/panels/edit', () => ({ AddDogPanel: () => null }));

import BrowseDogsPage from '../BrowseDogsPage';

async function selectOneDog() {
  const user = userEvent.setup();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/dogs']}>
        <BrowseDogsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  await user.click(await screen.findByRole('checkbox', { name: 'Select Max' }));
  // Positive control: the bulk bar is up with its named buttons (MYK9-929 list kit).
  expect(await screen.findByRole('button', { name: 'Change status' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
}

describe('BrowseDogsPage bulk Delete gate (MYK9-934)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    ['a secretary who is also an exhibitor', [UserRole.SECRETARY, UserRole.EXHIBITOR]],
    ['a club admin who is also an exhibitor', [UserRole.CLUB_ADMIN, UserRole.EXHIBITOR]],
    ['a secretary', [UserRole.SECRETARY]],
    ['a club admin', [UserRole.CLUB_ADMIN]],
  ])('%s is not offered Delete', async (_label, roles) => {
    mockRoles = roles;
    await selectOneDog();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('a site admin is offered Delete', async () => {
    mockRoles = [UserRole.SITE_ADMIN];
    await selectOneDog();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
