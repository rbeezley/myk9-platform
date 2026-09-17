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
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';

vi.mock('@/hooks/useAuthContext');
vi.mock('@/hooks/useRoleBasedData', () => ({
  useCurrentUserPersonId: vi.fn(),
}));

function mockIdentity(resolved: string | null, databaseUserId: string | null) {
  (useCurrentUserPersonId as ReturnType<typeof vi.fn>).mockReturnValue(resolved);
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: 'user-1' },
    userWithRoles: databaseUserId ? { databaseUserId } : undefined,
    isAuthenticated: true,
  });
}

beforeEach(() => vi.clearAllMocks());

describe('useEntriesPersonId', () => {
  it('uses the resolved person id', () => {
    mockIdentity('person-1', 'person-1');
    expect(renderHook(() => useEntriesPersonId()).result.current).toBe('person-1');
  });

  // The `?? userWithRoles.databaseUserId` arm the two original expressions
  // carried is deliberately NOT here, and this pins its absence: with the
  // resolver answering null, a `databaseUserId` on the auth record must NOT
  // resurrect an id. Carrying that arm forward would have preserved, in the one
  // place meant to end the duplication, a fallback that could never fire —
  // `useCurrentUserPersonId` returns `databaseUserId` first (round-1 review
  // confirmed this independently).
  it('does not re-derive an id from the auth record behind the resolver', () => {
    mockIdentity(null, 'person-db');
    expect(renderHook(() => useEntriesPersonId()).result.current).toBeNull();
  });

  it('answers null — never undefined — when neither source knows', () => {
    mockIdentity(null, null);
    expect(renderHook(() => useEntriesPersonId()).result.current).toBeNull();
  });
});
