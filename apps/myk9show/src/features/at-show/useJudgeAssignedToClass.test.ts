/**
 * Tests for useJudgeAssignedToClass — MYK9-82's client pre-flight that blocks
 * scoring before it can dead-letter at sync for a judge who isn't assigned.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { UserRole as ShowRole } from '@/types/auth-types';

const { getAll } = vi.hoisted(() => ({ getAll: vi.fn() }));
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ userWithRoles: { databaseUserId: 'judge-1' } }),
}));
vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: { getAll },
}));

import { useJudgeAssignedToClass } from './useJudgeAssignedToClass';

describe('useJudgeAssignedToClass', () => {
  beforeEach(() => {
    getAll.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is not-applicable for a passcode grant, regardless of assignment data', () => {
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({ showRole: ShowRole.JUDGE, grantRole: 'judge', classId: 'class-1' })
    );
    expect(result.current).toEqual({ status: 'not-applicable' });
    expect(getAll).not.toHaveBeenCalled();
  });

  it('is not-applicable for a non-judge RBAC role', () => {
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({
        showRole: ShowRole.SITE_ADMIN,
        grantRole: null,
        classId: 'class-1',
      })
    );
    expect(result.current).toEqual({ status: 'not-applicable' });
    expect(getAll).not.toHaveBeenCalled();
  });

  it('resolves assigned for a matching confirmed/invited row', async () => {
    getAll.mockResolvedValue([
      { id: 'a1', personId: 'judge-1', classId: 'class-1', status: 'confirmed' },
    ]);
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({ showRole: ShowRole.JUDGE, grantRole: null, classId: 'class-1' })
    );

    expect(result.current).toEqual({ status: 'checking' });
    await waitFor(() => expect(result.current).toEqual({ status: 'assigned' }));
  });

  it('resolves unassigned when the store has rows but none match this judge/class', async () => {
    getAll.mockResolvedValue([
      { id: 'a1', personId: 'judge-1', classId: 'different-class', status: 'confirmed' },
      { id: 'a2', personId: 'someone-else', classId: 'class-1', status: 'confirmed' },
    ]);
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({ showRole: ShowRole.JUDGE, grantRole: null, classId: 'class-1' })
    );

    await waitFor(() => expect(result.current).toEqual({ status: 'unassigned' }));
  });

  it('ignores a non-active status (declined) for the matching row', async () => {
    getAll.mockResolvedValue([
      { id: 'a1', personId: 'judge-1', classId: 'class-1', status: 'declined' },
    ]);
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({ showRole: ShowRole.JUDGE, grantRole: null, classId: 'class-1' })
    );

    await waitFor(() => expect(result.current).toEqual({ status: 'unassigned' }));
  });

  it('fails open (assigned) when the local store is a cold, empty cache', async () => {
    getAll.mockResolvedValue([]);
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({ showRole: ShowRole.JUDGE, grantRole: null, classId: 'class-1' })
    );

    await waitFor(() => expect(result.current).toEqual({ status: 'assigned' }));
  });

  it('fails open (assigned) when the replicated read rejects', async () => {
    getAll.mockRejectedValue(new Error('IDB unavailable'));
    const { result } = renderHook(() =>
      useJudgeAssignedToClass({ showRole: ShowRole.JUDGE, grantRole: null, classId: 'class-1' })
    );

    await waitFor(() => expect(result.current).toEqual({ status: 'assigned' }));
  });
});
