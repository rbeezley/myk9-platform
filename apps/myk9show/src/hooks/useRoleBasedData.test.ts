import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { UserRole } from '@/types/auth-types';
import type { Dog } from '@/types/dog-types';
import type { User } from '@/types/user-types';
import { useCurrentUserPersonId, useRoleBasedDogs } from './useRoleBasedData';

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
  vi.mocked(useAuthContext).mockReturnValue({
    userWithRoles: {
      id: 'auth-user',
      databaseUserId: 'person-1',
      roles: [UserRole.EXHIBITOR],
      permissions: [],
      scopes: [],
    },
    hasRole: (role: UserRole) => role === UserRole.EXHIBITOR,
  } as ReturnType<typeof useAuthContext>);

  vi.mocked(useDogStoreCompat).mockReturnValue({
    dogs: [
      makeDog('legacy-dog', 'legacy-person'),
      makeDog('current-dog-1', 'person-1'),
      makeDog('current-dog-2', 'person-1'),
    ],
    isLoading: false,
    error: null,
  } as ReturnType<typeof useDogStoreCompat>);

  vi.mocked(useUserStore).mockImplementation((selector: (state: { people: User[] }) => unknown) =>
    selector({ people })
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
