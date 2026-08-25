import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { UserRole } from '@/types/auth-types';
import { useDogsQuery } from './useDogsDatabase';

const { mockGetAllDogs, mockGetUserRoles, mockHasRole } = vi.hoisted(() => ({
  mockGetAllDogs: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockHasRole: vi.fn(),
}));

vi.mock('@/services/database/dogs', () => ({
  getAllDogs: mockGetAllDogs,
  getDogById: vi.fn(),
  getDogsByOwner: vi.fn(),
  createDog: vi.fn(),
  updateDog: vi.fn(),
  deleteDog: vi.fn(),
  searchDogs: vi.fn(),
  getDogStatistics: vi.fn(),
  getOwnedLiveDogsByPerson: vi.fn(),
}));

vi.mock('@/hooks/useCurrentPersonId', () => ({
  useCurrentPersonId: () => 'person-1',
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ getUserRoles: mockGetUserRoles, hasRole: mockHasRole }),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useDogsQuery roster scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllDogs.mockResolvedValue({ data: [], error: null });
  });

  it.each([
    ['judge + club admin', [UserRole.JUDGE, UserRole.CLUB_ADMIN], true],
    ['steward + exhibitor', [UserRole.STEWARD, UserRole.EXHIBITOR], false],
    ['chairman + exhibitor', [UserRole.CHAIRMAN, UserRole.EXHIBITOR], false],
    ['site admin + exhibitor', [UserRole.SITE_ADMIN, UserRole.EXHIBITOR], true],
  ] as const)('passes the canonical showAll value for %s', async (_label, roles, expectedShowAll) => {
    mockGetUserRoles.mockReturnValue(roles);
    mockHasRole.mockImplementation((role: UserRole) =>
      (roles as readonly UserRole[]).includes(role)
    );

    renderHook(() => useDogsQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(mockGetAllDogs).toHaveBeenCalledWith('person-1', expectedShowAll));
  });
});
