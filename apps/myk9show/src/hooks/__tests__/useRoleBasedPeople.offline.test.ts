import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fromPartial } from '@total-typescript/shoehorn';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';
import { useUserStore } from '@/store/userStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
import { useRoleBasedPeople } from '../useRoleBasedData';

vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: vi.fn() }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: vi.fn() }));
vi.mock('@/hooks/useEntriesPersonId', () => ({ useEntriesPersonId: vi.fn() }));
vi.mock('@/hooks/queries/useUsersQuery', () => ({ useUsersQuery: vi.fn() }));

const SAVED: User = {
  id: 'person-1',
  firstName: 'Molly',
  lastName: 'Mailbox',
  email: 'molly@example.com',
  phone: '555-1000',
};

function asRole(role: UserRole) {
  vi.mocked(useAuthContext).mockReturnValue(
    fromPartial({
      userWithRoles: { id: 'auth-1', roles: [role], permissions: [], scopes: [] },
      hasRole: (r: UserRole) => r === role,
    })
  );
}

function offlineQuery() {
  vi.mocked(useUsersQuery).mockReturnValue(
    fromPartial({
      data: undefined,
      isLoading: false,
      error: null,
      fetchStatus: 'paused',
      refetch: vi.fn(),
    })
  );
}

describe('useRoleBasedPeople with no signal (MYK9-2265)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ users: [SAVED], people: [SAVED] });
    offlineQuery();
  });

  it('gives a secretary the saved directory, phone and email included', () => {
    asRole(UserRole.SECRETARY);
    const { result } = renderHook(() => useRoleBasedPeople());
    expect(result.current.people).toHaveLength(1);
    expect(result.current.people[0]).toMatchObject({
      phone: '555-1000',
      email: 'molly@example.com',
    });
  });

  it('shows a judge no phone or email: the directory is not theirs to read', () => {
    asRole(UserRole.JUDGE);
    const { result } = renderHook(() => useRoleBasedPeople());
    expect(result.current.people).toEqual([]);
  });

  it('keeps the error state when the read failed while online', () => {
    asRole(UserRole.SECRETARY);
    vi.mocked(useUsersQuery).mockReturnValue(
      fromPartial({
        data: undefined,
        isLoading: false,
        error: new Error('boom'),
        fetchStatus: 'idle',
        refetch: vi.fn(),
      })
    );
    const { result } = renderHook(() => useRoleBasedPeople());
    expect(result.current.people).toEqual([]);
    expect(result.current.error?.message).toBe('boom');
  });

  it('prefers the server answer when it has one', () => {
    asRole(UserRole.SECRETARY);
    vi.mocked(useUsersQuery).mockReturnValue(
      fromPartial({
        data: [{ ...SAVED, phone: '555-2000' }],
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      })
    );
    const { result } = renderHook(() => useRoleBasedPeople());
    expect(result.current.people[0]?.phone).toBe('555-2000');
  });
});
