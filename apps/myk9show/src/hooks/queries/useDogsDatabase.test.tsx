import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { UserRole } from '@/types/auth-types';
import { useDogsQuery, useDeleteDogMutation } from './useDogsDatabase';

const { mockGetAllDogs, mockGetUserRoles, mockHasRole, mockDeleteDog, mockReplicaDelete } =
  vi.hoisted(() => ({
    mockGetAllDogs: vi.fn(),
    mockGetUserRoles: vi.fn(),
    mockHasRole: vi.fn(),
    mockDeleteDog: vi.fn(),
    mockReplicaDelete: vi.fn(),
  }));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { delete: mockReplicaDelete },
}));

vi.mock('@/services/database/dogs', () => ({
  getAllDogs: mockGetAllDogs,
  getDogById: vi.fn(),
  getDogsByOwner: vi.fn(),
  createDog: vi.fn(),
  updateDog: vi.fn(),
  deleteDog: mockDeleteDog,
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

/**
 * A soft delete removes the row from RLS visibility, so replication polling
 * never learns about it — while the dogs list reads IndexedDB FIRST. Leave the
 * local row in place and `onSuccess`'s invalidate refetches the dog straight
 * back into the list, which is what the bulk-delete path did: it calls this
 * mutation directly and never went through `useDogStoreCompat`'s cleanup.
 */
describe('useDeleteDogMutation local-replica cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllDogs.mockResolvedValue({ data: [], error: null });
    mockGetUserRoles.mockReturnValue([]);
    mockHasRole.mockReturnValue(false);
    mockDeleteDog.mockResolvedValue({ data: null, error: null });
    mockReplicaDelete.mockResolvedValue(undefined);
  });

  it('removes the dog from the local replica as part of the mutation', async () => {
    const { result } = renderHook(() => useDeleteDogMutation(), { wrapper: createWrapper() });

    await result.current.mutateAsync({ id: 'dog-1', deletedBy: 'staff-1' });

    expect(mockDeleteDog).toHaveBeenCalledWith('dog-1', 'staff-1');
    // Inside mutationFn, so it has already run by the time onSuccess (and its
    // invalidate/refetch) fires — the refetch cannot race it.
    expect(mockReplicaDelete).toHaveBeenCalledWith('dog-1');
  });

  it('does not touch the local replica when the server delete fails', async () => {
    mockDeleteDog.mockResolvedValue({ data: null, error: new Error('nope') });
    const { result } = renderHook(() => useDeleteDogMutation(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync({ id: 'dog-1' })).rejects.toThrow('nope');
    expect(mockReplicaDelete).not.toHaveBeenCalled();
  });

  it('still resolves when the local replica delete throws', async () => {
    mockReplicaDelete.mockRejectedValue(new Error('idb closed'));
    const { result } = renderHook(() => useDeleteDogMutation(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync({ id: 'dog-1' })).resolves.toBeNull();
  });
});
