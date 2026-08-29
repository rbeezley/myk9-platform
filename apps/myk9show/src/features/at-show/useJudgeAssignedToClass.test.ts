/**
 * Tests for useJudgeAssignedToClass — MYK9-82's client pre-flight that blocks
 * scoring before it can dead-letter at sync for a judge who isn't assigned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { UserRole as ShowRole } from '@/types/auth-types';

const { getAll, sync, authIdentity } = vi.hoisted(() => ({
  getAll: vi.fn(),
  sync: vi.fn(),
  // Mutable so the unresolved-identity case is reachable. It previously was a
  // fixed 'judge-1', which is exactly why the offline cold-boot hang below went
  // unnoticed: the one input that breaks this hook could not be varied.
  authIdentity: { databaseUserId: 'judge-1' as string | undefined },
}));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: { databaseUserId: authIdentity.databaseUserId } }),
}));
vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: { getAll, sync },
}));

import { useJudgeAssignedToClass } from './useJudgeAssignedToClass';

const CONFIRMED = { id: 'a1', personId: 'judge-1', classId: 'class-1', status: 'confirmed' };

describe('useJudgeAssignedToClass', () => {
  beforeEach(() => {
    authIdentity.databaseUserId = 'judge-1';
    getAll.mockReset();
    sync.mockReset();
    sync.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is not-applicable for an anonymous (passcode guest) session', () => {
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: true,
        classId: 'class-1',
      })
    );
    expect(result.current).toEqual({ status: 'not-applicable' });
    expect(getAll).not.toHaveBeenCalled();
  });

  it('is not-applicable for a non-judge account role (e.g. site admin)', () => {
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.SITE_ADMIN,
        isAnonymous: false,
        classId: 'class-1',
      })
    );
    expect(result.current).toEqual({ status: 'not-applicable' });
    expect(getAll).not.toHaveBeenCalled();
  });

  it('is not-applicable for any manager account role (server authorizes them by role)', () => {
    // Managers reach scoring via their own role or a grant, but the gate keys on
    // the ACCOUNT role, so a non-judge account is never gated — the server's
    // (club-scoped) manager tier is left to authorize or reject them.
    for (const showRole of [ShowRole.SITE_ADMIN, ShowRole.SECRETARY, ShowRole.CLUB_ADMIN]) {
      const { result, unmount } = renderHook(() =>
        useJudgeAssignedToClass({
          showRole,
          isAnonymous: false,
          classId: 'class-1',
        })
      );
      expect(result.current).toEqual({ status: 'not-applicable' });
      unmount();
    }
    expect(getAll).not.toHaveBeenCalled();
  });

  it('resolves assigned from the local cache without forcing a sync', async () => {
    getAll.mockResolvedValue([CONFIRMED]);
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );

    expect(result.current).toEqual({ status: 'checking' });
    await waitFor(() => expect(result.current).toEqual({ status: 'assigned' }));
    expect(sync).not.toHaveBeenCalled();
  });

  it('accepts an "invited" (not yet confirmed) assignment', async () => {
    getAll.mockResolvedValue([{ ...CONFIRMED, status: 'invited' }]);
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'assigned' }));
  });

  it('forces a fresh sync before denying, then resolves unassigned when still no match', async () => {
    // Local cache has unrelated rows (not empty) but not this judge's assignment;
    // the forced sync also returns no match → genuinely unassigned.
    getAll.mockResolvedValue([
      { id: 'a2', personId: 'someone-else', classId: 'class-1', status: 'confirmed' },
    ]);
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );

    await waitFor(() => expect(result.current).toEqual({ status: 'unassigned' }));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('resolves assigned when the forced sync pulls a just-added assignment', async () => {
    // First read (stale cache) misses; after the sync the assignment is present.
    getAll
      .mockResolvedValueOnce([
        { id: 'a2', personId: 'someone-else', classId: 'class-1', status: 'confirmed' },
      ])
      .mockResolvedValueOnce([CONFIRMED]);
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );

    await waitFor(() => expect(result.current).toEqual({ status: 'assigned' }));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('ignores a non-active status (declined) for the matching row', async () => {
    getAll.mockResolvedValue([{ ...CONFIRMED, status: 'declined' }]);
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'unassigned' }));
  });

  it('fails open (assigned) when the store is empty even after a successful sync', async () => {
    getAll.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'assigned' }));
  });

  it('fails open (assigned) when the forced sync fails (offline)', async () => {
    getAll.mockResolvedValue([
      { id: 'a2', personId: 'someone-else', classId: 'class-1', status: 'confirmed' },
    ]);
    sync.mockResolvedValue({ success: false, error: 'offline' });
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'assigned' }));
  });

  it('fails open (assigned) when the local read rejects', async () => {
    getAll.mockRejectedValue(new Error('IDB unavailable'));
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'assigned' }));
  });

  /**
   * The offline cold-boot trap. `databaseUserId` comes from a `people` lookup in
   * AuthContext whose query declares no networkMode, so it inherits 'online' and
   * PAUSES offline -- a judge relaunching at a ringside with no signal has no
   * identity indefinitely.
   *
   * This hook is documented fail-open: a cold cache, a sync failure and a read
   * error all resolve `assigned`, with the server RPC as the real enforcement
   * boundary. Unknown identity is the same kind of ignorance and must not be the
   * one that blocks -- it used to report 'checking' forever, which the scoresheet
   * renders as a skeleton with no error, no retry and no way out.
   */
  it('fails open when identity has not resolved, instead of checking forever', async () => {
    authIdentity.databaseUserId = undefined;
    getAll.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );

    await waitFor(() => {
      expect(result.current.status).not.toBe('checking');
    });
    expect(result.current.status).toBe('not-applicable');
  });

  it('resumes the normal fail-open path once identity resolves', async () => {
    // With an identity present the hook runs its real flow again and still fails
    // open on an empty cache -- confirming the unresolved-identity branch above
    // short-circuits ONLY the no-identity case, and does not disturb the
    // documented posture for everything else.
    getAll.mockResolvedValue([]);
    sync.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );

    await waitFor(() => expect(result.current.status).toBe('assigned'));
  });
});
