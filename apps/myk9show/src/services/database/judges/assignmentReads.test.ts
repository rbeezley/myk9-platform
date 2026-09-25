import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getByShowId: vi.fn(),
  getAll: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: {
    getByShowId: mocks.getByShowId,
    getAll: mocks.getAll,
    subscribe: mocks.subscribe,
  },
}));

import {
  getActiveJudgeAssignmentShows,
  getActiveJudgeAssignmentsForShow,
  subscribeToJudgeAssignmentChanges,
} from './assignmentReads';
import {
  ACTIVE_JUDGE_ASSIGNMENT_STATUSES,
  isActiveJudgeAssignmentStatus,
} from './assignmentStatus';

describe('active judge assignment reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getByShowId.mockResolvedValue([]);
  });

  it('defines the shared assignment lifecycle contract once', () => {
    expect(ACTIVE_JUDGE_ASSIGNMENT_STATUSES).toEqual(['confirmed', 'invited']);
    expect(isActiveJudgeAssignmentStatus('confirmed')).toBe(true);
    expect(isActiveJudgeAssignmentStatus('invited')).toBe(true);
    expect(isActiveJudgeAssignmentStatus('declined')).toBe(false);
    expect(isActiveJudgeAssignmentStatus(null)).toBe(false);
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

  // MYK9-722: the Message Center composer's judge list. Every active row counts,
  // class-less show-level ones included, because the show_announcements INSERT
  // policy's judge arm asks only for a confirmed/invited row on the show.
  it('lists each show a judge holds an active assignment at, earliest trial first', async () => {
    mocks.getAll.mockResolvedValue([
      {
        id: 'a',
        personId: 'judge-1',
        showId: 'later',
        classId: 'c1',
        status: 'confirmed',
        trialDate: '2026-11-07',
      },
      {
        id: 'b',
        personId: 'judge-1',
        showId: 'sooner',
        classId: 'c2',
        status: 'invited',
        trialDate: '2026-10-11',
      },
      {
        id: 'c',
        personId: 'judge-1',
        showId: 'sooner',
        classId: 'c3',
        status: 'confirmed',
        trialDate: '2026-10-10',
      },
      {
        id: 'd',
        personId: 'judge-1',
        showId: 'show-level',
        classId: null,
        status: 'confirmed',
        trialDate: null,
      },
      {
        id: 'e',
        personId: 'judge-1',
        showId: 'declined',
        classId: 'c4',
        status: 'declined',
        trialDate: '2026-10-01',
      },
      {
        id: 'f',
        personId: 'judge-2',
        showId: 'someone-else',
        classId: 'c5',
        status: 'confirmed',
        trialDate: '2026-10-01',
      },
      {
        id: 'g',
        personId: 'judge-1',
        showId: null,
        classId: 'c6',
        status: 'confirmed',
        trialDate: '2026-10-01',
      },
    ]);

    await expect(getActiveJudgeAssignmentShows('judge-1')).resolves.toEqual([
      { showId: 'sooner', firstTrialDate: '2026-10-10' },
      { showId: 'later', firstTrialDate: '2026-11-07' },
      { showId: 'show-level', firstTrialDate: null },
    ]);
  });

  it('forwards replication subscriptions through the Judge data module', () => {
    const unsubscribe = vi.fn();
    const listener = vi.fn();
    mocks.subscribe.mockReturnValue(unsubscribe);

    expect(subscribeToJudgeAssignmentChanges(listener)).toBe(unsubscribe);
    expect(mocks.subscribe).toHaveBeenCalledWith(listener);
  });
});
