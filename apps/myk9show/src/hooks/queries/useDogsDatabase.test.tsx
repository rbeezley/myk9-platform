import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { UserRole } from '@/types/auth-types';
import { useDogsQuery, useDeleteDogMutation } from './useDogsDatabase';

const {
  mockGetAllDogs,
  mockGetUserRoles,
  mockHasRole,
  mockDeleteDog,
  mockReplicaDelete,
  mockUseCurrentPersonId,
} = vi.hoisted(() => ({
  mockGetAllDogs: vi.fn(),
  mockGetUserRoles: vi.fn(),
  mockHasRole: vi.fn(),
  mockDeleteDog: vi.fn(),
  mockReplicaDelete: vi.fn(),
  mockUseCurrentPersonId: vi.fn(),
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
  useCurrentPersonId: mockUseCurrentPersonId,
}));

// Identity/RBAC resolution signal shared with `AuthContext.userWithRoles`. A
// truthy object stands in for "resolved"; `null` is the unresolved case under
// test below. A plain module-scope `let`, not `vi.hoisted`, matching the
// existing pattern in BrowseDogsPage.test.tsx for the same field.
let mockUserWithRoles: unknown = { id: 'user-1' };

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    getUserRoles: mockGetUserRoles,
    hasRole: mockHasRole,
    userWithRoles: mockUserWithRoles,
  }),
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
    mockUseCurrentPersonId.mockReturnValue('person-1');
    mockUserWithRoles = { id: 'user-1' };
  });

  it.each([
    ['judge + club admin', [UserRole.JUDGE, UserRole.CLUB_ADMIN], true],
    ['steward + exhibitor', [UserRole.STEWARD, UserRole.EXHIBITOR], false],
    ['chairman + exhibitor', [UserRole.CHAIRMAN, UserRole.EXHIBITOR], false],
    ['site admin + exhibitor', [UserRole.SITE_ADMIN, UserRole.EXHIBITOR], true],
  ] as const)(
    'passes the canonical showAll value for %s',
    async (_label, roles, expectedShowAll) => {
      mockGetUserRoles.mockReturnValue(roles);
      mockHasRole.mockImplementation((role: UserRole) =>
        (roles as readonly UserRole[]).includes(role)
      );

      renderHook(() => useDogsQuery(), { wrapper: createWrapper() });

      await waitFor(() => expect(mockGetAllDogs).toHaveBeenCalledWith('person-1', expectedShowAll));
    }
  );
});

/**
 * `personId` comes from `exhibitor_profiles`, which a secretary or site admin
 * may never have a row in. MYK9-854: a site admin on production saw a
 * permanent, false "0 dogs" because the query stayed disabled (and, on
 * refetch, threw) whenever that id was missing — even though a full-roster
 * read does not filter by owner and never needed it.
 */
describe('useDogsQuery personId resolution (MYK9-854)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllDogs.mockResolvedValue({ data: [], error: null });
    mockUseCurrentPersonId.mockReturnValue(undefined);
    mockUserWithRoles = { id: 'user-1' };
  });

  it.each([
    ['site admin', [UserRole.SITE_ADMIN]],
    ['secretary', [UserRole.SECRETARY]],
    ['club admin', [UserRole.CLUB_ADMIN]],
  ] as const)(
    'runs the full-roster read for a %s with no exhibitor profile',
    async (_label, roles) => {
      mockGetUserRoles.mockReturnValue(roles);
      mockHasRole.mockImplementation((role: UserRole) =>
        (roles as readonly UserRole[]).includes(role)
      );

      renderHook(() => useDogsQuery(), { wrapper: createWrapper() });

      await waitFor(() => expect(mockGetAllDogs).toHaveBeenCalledWith('', true));
    }
  );

  it('never runs the own-dogs read for an exhibitor before their person id resolves', async () => {
    mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);
    mockHasRole.mockImplementation((role: UserRole) => role === UserRole.EXHIBITOR);

    renderHook(() => useDogsQuery(), { wrapper: createWrapper() });

    // No id ever resolves in this test, so there is nothing to await — the
    // query must stay disabled for the whole tick rather than throw.
    await Promise.resolve();
    await Promise.resolve();
    expect(mockGetAllDogs).not.toHaveBeenCalled();
  });
});

/**
 * Codex follow-up on MYK9-854 (P2): while auth/RBAC is still resolving,
 * `hasRole` reports no roles for every role — a fact indistinguishable, on
 * its own, from "confirmed exhibitor with no full-roster role". Left
 * unguarded, that could fire a full-roster request before identity is known,
 * or let an empty result cache under the same key a subsequently-resolved
 * secretary reuses. The roster scope must be its own 'unresolved' state
 * (LESSONS `offline-identity-pairing`) until `userWithRoles` resolves.
 */
describe('useDogsQuery identity resolution (MYK9-854 Codex follow-up)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllDogs.mockResolvedValue({ data: [], error: null });
    mockUseCurrentPersonId.mockReturnValue('person-1');
  });

  it('runs no query and reports loading, not an empty roster, while identity is unresolved', async () => {
    mockUserWithRoles = null;
    mockGetUserRoles.mockReturnValue([]);
    mockHasRole.mockReturnValue(false);

    const { result } = renderHook(() => useDogsQuery(), { wrapper: createWrapper() });

    // Nothing ever resolves in this test, so there is nothing to await — the
    // query must stay disabled for the whole tick rather than throw or fetch.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockGetAllDogs).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('fetches the full roster once identity resolves to a secretary', async () => {
    mockUserWithRoles = { id: 'user-1' };
    mockGetUserRoles.mockReturnValue([UserRole.SECRETARY]);
    mockHasRole.mockImplementation((role: UserRole) => role === UserRole.SECRETARY);

    const { result } = renderHook(() => useDogsQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(mockGetAllDogs).toHaveBeenCalledWith('person-1', true));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it("fetches only the exhibitor's own dogs once identity resolves to an exhibitor", async () => {
    mockUserWithRoles = { id: 'user-1' };
    mockGetUserRoles.mockReturnValue([UserRole.EXHIBITOR]);
    mockHasRole.mockImplementation((role: UserRole) => role === UserRole.EXHIBITOR);

    const { result } = renderHook(() => useDogsQuery(), { wrapper: createWrapper() });

    await waitFor(() => expect(mockGetAllDogs).toHaveBeenCalledWith('person-1', false));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
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
    mockUserWithRoles = { id: 'user-1' };
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
