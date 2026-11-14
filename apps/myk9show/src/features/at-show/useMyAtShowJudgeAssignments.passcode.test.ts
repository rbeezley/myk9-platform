/**
 * MYK9-1951: a per-judge passcode session sees only that judge's classes. The judge is named by
 * the session claim's `ringside_person_id`; admin and steward codes name none and stay unfiltered.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { getActiveJudgeAssignmentsForShow } = vi.hoisted(() => ({
  getActiveJudgeAssignmentsForShow: vi.fn(),
}));

const SHOW_ID = 'show-1';
let appMetadata: Record<string, unknown> = {};

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: () => false,
    user: { is_anonymous: true, app_metadata: appMetadata },
    userWithRoles: undefined,
  }),
}));

vi.mock('@/services/database/judges', () => ({
  getActiveJudgeAssignmentsForShow,
  subscribeToJudgeAssignmentChanges: vi.fn(() => () => {}),
}));

vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({
    status: { tablesStatus: { judge_assignments: 'success' } },
    syncTable: vi.fn().mockResolvedValue({ success: true }),
  }),
}));

import { useMyAtShowJudgeAssignments } from './useMyAtShowJudgeAssignments';
import { isJudgeOnlyAtShow } from './isJudgeOnlyAtShow';
import { deriveRingsideJudgePersonIdFromClaim } from '@/store/ringsideGrantStore';

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client }, children);
}

function claim(role: string, personId?: string) {
  return {
    kind: 'ringside_passcode',
    show_id: SHOW_ID,
    ringside_role: role,
    ...(personId ? { ringside_person_id: personId } : {}),
  };
}

describe('per-judge passcode class scope', () => {
  beforeEach(() => {
    getActiveJudgeAssignmentsForShow.mockReset();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('navigator', { onLine: true });
  });

  it('reads the assignments of the judge named by the claim', async () => {
    appMetadata = claim('judge', 'judge-7');
    getActiveJudgeAssignmentsForShow.mockResolvedValue([{ id: 'a1', classId: 'class-9' }]);

    const { result } = renderHook(() => useMyAtShowJudgeAssignments(SHOW_ID), { wrapper });

    await waitFor(() => expect(result.current.assignedClassIds.has('class-9')).toBe(true));
    expect(getActiveJudgeAssignmentsForShow).toHaveBeenCalledWith(SHOW_ID, 'judge-7');
  });

  it('does not look up assignments for an admin code, which names no judge', async () => {
    appMetadata = claim('admin');

    const { result } = renderHook(() => useMyAtShowJudgeAssignments(SHOW_ID), { wrapper });

    expect(result.current.assignedClassIds.size).toBe(0);
    expect(getActiveJudgeAssignmentsForShow).not.toHaveBeenCalled();
  });

  it('names a judge only for a judge claim on this show', () => {
    const user = (app_metadata: Record<string, unknown>) => ({ is_anonymous: true, app_metadata });
    expect(deriveRingsideJudgePersonIdFromClaim(user(claim('judge', 'judge-7')), SHOW_ID)).toBe(
      'judge-7'
    );
    expect(
      deriveRingsideJudgePersonIdFromClaim(user(claim('judge', 'judge-7')), 'other')
    ).toBeNull();
    expect(deriveRingsideJudgePersonIdFromClaim(user(claim('steward')), SHOW_ID)).toBeNull();
    expect(deriveRingsideJudgePersonIdFromClaim(user(claim('admin')), SHOW_ID)).toBeNull();
    // The old show-wide judge shape carried no person id and names no one.
    expect(deriveRingsideJudgePersonIdFromClaim(user(claim('judge')), SHOW_ID)).toBeNull();
    expect(
      deriveRingsideJudgePersonIdFromClaim(
        { is_anonymous: false, app_metadata: claim('judge', 'judge-7') },
        SHOW_ID
      )
    ).toBeNull();
  });

  it('leaves the account-only judge rule alone for anonymous sessions', () => {
    expect(isJudgeOnlyAtShow({ isAnonymous: true, hasRole: () => true })).toBe(false);
  });
});
