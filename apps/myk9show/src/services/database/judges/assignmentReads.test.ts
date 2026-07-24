import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getByShowId: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: {
    getByShowId: mocks.getByShowId,
    subscribe: mocks.subscribe,
  },
}));

import {
  getActiveJudgeAssignmentsForShow,
  subscribeToJudgeAssignmentChanges,
} from './assignmentReads';

describe('active judge assignment reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getByShowId.mockResolvedValue([]);
  });

  it('returns only active class assignments for the requested judge and show', async () => {
    mocks.getByShowId.mockResolvedValue([
      { id: 'confirmed', personId: 'judge-1', classId: 'class-1', status: 'confirmed' },
      { id: 'invited', personId: 'judge-1', classId: 'class-2', status: 'invited' },
      { id: 'declined', personId: 'judge-1', classId: 'class-3', status: 'declined' },
      { id: 'other', personId: 'judge-2', classId: 'class-4', status: 'confirmed' },
      { id: 'show-level', personId: 'judge-1', classId: null, status: 'confirmed' },
    ]);

    const result = await getActiveJudgeAssignmentsForShow('show-1', 'judge-1');

    expect(mocks.getByShowId).toHaveBeenCalledWith('show-1');
    expect(result.map(assignment => assignment.id)).toEqual(['confirmed', 'invited']);
  });

  it('forwards replication subscriptions through the Judge data module', () => {
    const unsubscribe = vi.fn();
    const listener = vi.fn();
    mocks.subscribe.mockReturnValue(unsubscribe);

    expect(subscribeToJudgeAssignmentChanges(listener)).toBe(unsubscribe);
    expect(mocks.subscribe).toHaveBeenCalledWith(listener);
  });
});
