/**
 * Tests for useJudgeAssignedToClass — MYK9-82's client pre-flight that blocks
 * scoring before it can dead-letter at sync for a judge who isn't assigned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { UserRole as ShowRole } from '@/types/auth-types';

const { getAll, sync } = vi.hoisted(() => ({ getAll: vi.fn(), sync: vi.fn() }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: { databaseUserId: 'judge-1' } }),
}));
vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: { getAll, sync },
}));

import { useJudgeAssignedToClass } from './useJudgeAssignedToClass';

const CONFIRMED = { id: 'a1', personId: 'judge-1', classId: 'class-1', status: 'confirmed' };

describe('useJudgeAssignedToClass', () => {
  beforeEach(() => {
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
        ringsideRole: 'judge',
        showRole: ShowRole.JUDGE,
        isAnonymous: true,
        classId: 'class-1',
      })
    );
    expect(result.current).toEqual({ status: 'not-applicable' });
    expect(getAll).not.toHaveBeenCalled();
  });

  it('is not-applicable for a non-judge effective role (e.g. admin/manager)', () => {
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        ringsideRole: 'admin',
        showRole: ShowRole.SITE_ADMIN,
        isAnonymous: false,
        classId: 'class-1',
      })
    );
    expect(result.current).toEqual({ status: 'not-applicable' });
    expect(getAll).not.toHaveBeenCalled();
  });

  it('is not-applicable for a manager ACCOUNT even when a grant overrode the role to judge', () => {
    // A secretary/site-admin/club-admin who entered a JUDGE passcode has an
    // effective role of `judge`, but the server authorizes them via its manager
    // tier regardless of assignment — so the gate must not block them.
    for (const showRole of [ShowRole.SITE_ADMIN, ShowRole.SECRETARY, ShowRole.CLUB_ADMIN]) {
      const { result, unmount } = renderHook(() =>
        useJudgeAssignedToClass({
          ringsideRole: 'judge',
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
        ringsideRole: 'judge',
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
        ringsideRole: 'judge',
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
        ringsideRole: 'judge',
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
        ringsideRole: 'judge',
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
        ringsideRole: 'judge',
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
        ringsideRole: 'judge',
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
        ringsideRole: 'judge',
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
        ringsideRole: 'judge',
        showRole: ShowRole.JUDGE,
        isAnonymous: false,
        classId: 'class-1',
      })
    );
    await waitFor(() => expect(result.current).toEqual({ status: 'assigned' }));
  });
});
