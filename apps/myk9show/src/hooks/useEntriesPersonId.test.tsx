/**
 * MYK9-629 restructure 4 — ONE person id for the four `getUserEntries`
 * consumers.
 *
 * A CORRECTION TO THE ISSUE'S PREMISE, recorded here because the next reader
 * will otherwise re-derive it. MYK9-629 says the four consumers "resolve two
 * different ids", so the shared query key was two keys. They do not. My Shows
 * and My Payments took `useCurrentUserPersonId() ?? userWithRoles.databaseUserId`
 * while the ringside pair took `useCurrentUserPersonId()` alone — but
 * `useCurrentUserPersonId` ALREADY returns `userWithRoles.databaseUserId` first
 * (`useRoleBasedData.ts:187`) and only falls to the people store when it is
 * falsy. The `??` arm was therefore unreachable, and the two expressions are
 * extensionally equal: there was never a second key.
 *
 * What this hook fixes is duplication, not a defect — one named resolver the
 * next consumer copies instead of a two-term expression re-typed per call site.
 * These tests pin its resolution ORDER, which is the part a future edit could
 * get wrong.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEntriesPersonId } from './useEntriesPersonId';
import { useAuthContext } from '@/hooks/useAuthContext';

vi.mock('@/hooks/useAuthContext');

function mockIdentity(
  personId: string | null,
  databaseUserId: string | null = null,
  personIdentityState: 'unresolved' | 'resolved' | 'missing' = personId ? 'resolved' : 'unresolved'
) {
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 'user-1' },
    userWithRoles: databaseUserId ? { databaseUserId } : undefined,
    personId,
    personIdentityState,
    isAuthenticated: true,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('useEntriesPersonId', () => {
  it('uses the resolved person id', () => {
    mockIdentity('person-1');
    expect(renderHook(() => useEntriesPersonId()).result.current).toBe('person-1');
  });

  it('ignores stale role data when confirmed identity is missing', () => {
    mockIdentity(null, 'person-stale-role', 'missing');
    expect(renderHook(() => useEntriesPersonId()).result.current).toBeNull();
  });

  it('ignores stale role data while identity is unresolved', () => {
    mockIdentity(null, 'person-stale-role', 'unresolved');
    expect(renderHook(() => useEntriesPersonId()).result.current).toBeNull();
  });

  it('answers null — never undefined — when neither source knows', () => {
    mockIdentity(null);
    expect(renderHook(() => useEntriesPersonId()).result.current).toBeNull();
  });

  it('uses the durable identity before RBAC hydrates', () => {
    mockIdentity('person-cached', null, 'unresolved');
    expect(renderHook(() => useEntriesPersonId()).result.current).toBe('person-cached');
  });
});
