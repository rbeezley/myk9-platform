import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { UserRole } from '@/types/auth-types';
import type { Dog } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import { useCanDeleteDog, useCurrentUserPersonId, useRoleBasedDogs } from './useRoleBasedData';
import { fromAny, fromPartial } from '@total-typescript/shoehorn';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: vi.fn(),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(),
}));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUsersQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
}));

import { useAuthContext } from '@/hooks/useAuthContext';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useUserStore } from '@/store/userStore';

const makeDog = (id: string, ownerId: string): Dog => ({
  id,
  ownerId,
  name: id,
  callName: id,
  breed: 'Border Collie',
  sex: 'female',
});

const people: User[] = [
  { id: 'legacy-person', firstName: 'Legacy', lastName: 'Owner', user_id: 'auth-user' },
  { id: 'person-1', firstName: 'Current', lastName: 'Owner', user_id: 'auth-user' },
];

function setMocks() {
  vi.mocked(useAuthContext).mockReturnValue(
    fromPartial({
      userWithRoles: {
        id: 'auth-user',
        databaseUserId: 'person-1',
        roles: [UserRole.EXHIBITOR],
        permissions: [],
        scopes: [],
      },
      hasRole: (role: UserRole) => role === UserRole.EXHIBITOR,
    })
  );

  vi.mocked(useDogStoreCompat).mockReturnValue({
    dogs: [
      makeDog('legacy-dog', 'legacy-person'),
      makeDog('current-dog-1', 'person-1'),
      makeDog('current-dog-2', 'person-1'),
    ],
    isLoading: false,
    error: null,
  } as ReturnType<typeof useDogStoreCompat>);

  vi.mocked(useUserStore).mockImplementation(
    fromAny((selector: (state: { people: User[] }) => unknown) => selector({ people }))
  );
}

describe('useRoleBasedData owner scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMocks();
  });

  it('filters exhibitor dogs by databaseUserId so /dogs matches dashboard dog counts', () => {
    const { result } = renderHook(() => useRoleBasedDogs());

    expect(result.current.map(dog => dog.id)).toEqual(['current-dog-1', 'current-dog-2']);
  });

  it('returns databaseUserId as the current person id before falling back to auth user lookup', () => {
    const { result } = renderHook(() => useCurrentUserPersonId());

    expect(result.current).toBe('person-1');
  });
});

describe('useCanDeleteDog (mirrors the soft_delete_dog RPC gate)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMocks();
  });

  // Helper: re-mock the auth context with a specific role predicate.
  const withRole = (predicate: (role: UserRole) => boolean) => {
    vi.mocked(useAuthContext).mockReturnValue(
      fromPartial({
        userWithRoles: {
          id: 'auth-user',
          databaseUserId: 'person-1',
          roles: [],
          permissions: [],
          scopes: [],
        },
        hasRole: predicate,
      })
    );
  };

  it('lets an owner delete their own dog', () => {
    const { result } = renderHook(() => useCanDeleteDog('current-dog-1'));
    expect(result.current).toBe(true);
  });

  it('does not let a non-owner exhibitor delete someone else’s dog', () => {
    const { result } = renderHook(() => useCanDeleteDog('legacy-dog'));
    expect(result.current).toBe(false);
  });

  it('does not let a secretary delete a dog they do not own (button must hide, not fail)', () => {
    withRole(role => role === UserRole.SECRETARY);
    const { result } = renderHook(() => useCanDeleteDog('legacy-dog'));
    expect(result.current).toBe(false);
  });

  it('lets a site admin delete any dog', () => {
    withRole(role => role === UserRole.SITE_ADMIN);
    const { result } = renderHook(() => useCanDeleteDog('legacy-dog'));
    expect(result.current).toBe(true);
  });
});
