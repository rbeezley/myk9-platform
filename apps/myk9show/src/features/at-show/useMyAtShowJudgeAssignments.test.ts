/**
 * Tests for useMyAtShowJudgeAssignments — specifically the sync-status
 * TRANSITION: the query resolves empty while the first sync is in flight, and
 * nothing in the query key changes when that sync completes, so without an
 * explicit invalidation an assigned judge sits on "no ring" until a reload.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { UserRole } from '@/types/auth-types';

const { getActiveJudgeAssignmentsForShow, subscribeToJudgeAssignmentChanges, syncTable } =
  vi.hoisted(() => ({
    getActiveJudgeAssignmentsForShow: vi.fn(),
    subscribeToJudgeAssignmentChanges: vi.fn(() => () => {}),
    syncTable: vi.fn(),
  }));

let judgeTableStatus: 'idle' | 'syncing' | 'success' | 'error' = 'syncing';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: (role: UserRole) => role === UserRole.JUDGE,
    user: { is_anonymous: false },
    userWithRoles: { databaseUserId: 'judge-1' },
  }),
}));

vi.mock('@/services/database/judges', () => ({
  getActiveJudgeAssignmentsForShow,
  subscribeToJudgeAssignmentChanges,
}));

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({
    status: { tablesStatus: { judge_assignments: judgeTableStatus } },
    syncTable,
  }),
}));

import { useMyAtShowJudgeAssignments } from './useMyAtShowJudgeAssignments';

// The client MUST outlive rerenders — building it inside the wrapper body
// resets the cache on every rerender and hides exactly what we're asserting.
let client: QueryClient;

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useMyAtShowJudgeAssignments', () => {
  beforeEach(() => {
    getActiveJudgeAssignmentsForShow.mockReset();
    syncTable.mockReset();
    syncTable.mockResolvedValue({ success: true });
    judgeTableStatus = 'syncing';
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('navigator', { onLine: true });
  });

  it('refetches when the first judge_assignments sync completes', async () => {
    // In flight: the local store has nothing yet.
    getActiveJudgeAssignmentsForShow.mockResolvedValue([]);

    const { result, rerender } = renderHook(() => useMyAtShowJudgeAssignments('show-1'), {
      wrapper,
    });

    await waitFor(() => expect(getActiveJudgeAssignmentsForShow).toHaveBeenCalled());
    expect(result.current.assignedClassIds.size).toBe(0);

    // Sync lands the assignment and flips the table to success.
    getActiveJudgeAssignmentsForShow.mockResolvedValue([{ id: 'a1', classId: 'class-1' }]);
    judgeTableStatus = 'success';
    rerender();

    await waitFor(() => expect(result.current.assignedClassIds.has('class-1')).toBe(true));
  });

  it('refetches when a FAILED first sync later recovers', async () => {
    // syncing -> error -> success. Gating the invalidation on an idle/syncing
    // predecessor would leave the judge stuck on the empty result one retry
    // later — the exact symptom, just deferred.
    getActiveJudgeAssignmentsForShow.mockResolvedValue([]);

    const { result, rerender } = renderHook(() => useMyAtShowJudgeAssignments('show-1'), {
      wrapper,
    });

    await waitFor(() => expect(getActiveJudgeAssignmentsForShow).toHaveBeenCalled());

    judgeTableStatus = 'error';
    rerender();
    await waitFor(() => expect(result.current.error).not.toBeNull());

    getActiveJudgeAssignmentsForShow.mockResolvedValue([{ id: 'a1', classId: 'class-1' }]);
    judgeTableStatus = 'success';
    rerender();

    await waitFor(() => expect(result.current.assignedClassIds.has('class-1')).toBe(true));
  });

  it('does not invalidate while the table stays in the same status', async () => {
    getActiveJudgeAssignmentsForShow.mockResolvedValue([{ id: 'a1', classId: 'class-1' }]);
    judgeTableStatus = 'success';

    const { result, rerender } = renderHook(() => useMyAtShowJudgeAssignments('show-1'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.assignedClassIds.has('class-1')).toBe(true));
    const callsAfterFirstLoad = getActiveJudgeAssignmentsForShow.mock.calls.length;

    rerender();
    rerender();

    expect(getActiveJudgeAssignmentsForShow.mock.calls.length).toBe(callsAfterFirstLoad);
  });
});
