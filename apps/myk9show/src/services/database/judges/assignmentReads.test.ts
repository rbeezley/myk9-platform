import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTrialsByShow: vi.fn(),
  getClassesByTrial: vi.fn(),
  classSubscribe: vi.fn(),
  getByShowId: vi.fn(),
  getAllWithStatus: vi.fn(),
  subscribe: vi.fn(),
}));

function okRows(rows: unknown[]) {
  return { ok: true, rows, error: null };
}

vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: {
    getByShowId: mocks.getByShowId,
    getAllWithStatus: mocks.getAllWithStatus,
    subscribe: mocks.subscribe,
  },
  replicatedTrialsTable: { getTrialsByShow: mocks.getTrialsByShow },
  replicatedClassesTable: {
    getClassesByTrial: mocks.getClassesByTrial,
    subscribe: mocks.classSubscribe,
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
    mocks.getTrialsByShow.mockResolvedValue([]);
    mocks.getClassesByTrial.mockResolvedValue([]);
  });

  it('defines the shared assignment lifecycle contract once', () => {
    expect(ACTIVE_JUDGE_ASSIGNMENT_STATUSES).toEqual(['confirmed', 'invited']);
    expect(isActiveJudgeAssignmentStatus('confirmed')).toBe(true);
    expect(isActiveJudgeAssignmentStatus('invited')).toBe(true);
    expect(isActiveJudgeAssignmentStatus('declined')).toBe(false);
    expect(isActiveJudgeAssignmentStatus(null)).toBe(false);
  });

  it('returns only active class assignments for the requested judge and show', async () => {
    const row = (id: string, overrides: Record<string, unknown>) => ({
      id,
      showId: 'show-1',
      personId: 'judge-1',
      classId: `class-${id}`,
      status: 'confirmed',
      ...overrides,
    });
    mocks.getAllWithStatus.mockResolvedValue(
      okRows([
        row('confirmed', {}),
        row('invited', { status: 'invited' }),
        row('declined', { status: 'declined' }),
        row('other', { personId: 'judge-2' }),
        row('show-level', { classId: null }),
        row('other-show', { showId: 'show-2' }),
      ])
    );

    const result = await getActiveJudgeAssignmentsForShow('show-1', 'judge-1');

    expect(result.map(assignment => assignment.id)).toEqual(['confirmed', 'invited']);
  });

  // MYK9-769: getByShowId() -> getAll() turned a failed IndexedDB read into [],
  // which the at-show class list then showed a judge as "No classes assigned
  // yet". A failed read must throw so the hook reaches its error state.
  it('throws when the device read fails instead of reporting no assignments', async () => {
    mocks.getAllWithStatus.mockResolvedValue({
      ok: false,
      rows: [],
      error: new Error('IndexedDB read timed out'),
    });

    await expect(getActiveJudgeAssignmentsForShow('show-1', 'judge-1')).rejects.toThrow(
      /Could not read judge assignments on this device/
    );
  });

  // MYK9-722: the Message Center composer's judge list. Every active row counts,
  // class-less show-level ones included, because the show_announcements INSERT
  // policy's judge arm asks only for a confirmed/invited row on the show.
  it('lists each show a judge holds an active assignment at, earliest trial first', async () => {
    mocks.getAllWithStatus.mockResolvedValue(
      okRows([
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
      ])
    );

    await expect(getActiveJudgeAssignmentShows('judge-1')).resolves.toEqual([
      { showId: 'sooner', firstTrialDate: '2026-10-10' },
      { showId: 'later', firstTrialDate: '2026-11-07' },
      { showId: 'show-level', firstTrialDate: null },
    ]);
  });

  it('subscribes to both the assignment replica and the class replica, and stops both', () => {
    const stopAssignments = vi.fn();
    const stopClasses = vi.fn();
    const listener = vi.fn();
    mocks.subscribe.mockReturnValue(stopAssignments);
    mocks.classSubscribe.mockReturnValue(stopClasses);

    const stop = subscribeToJudgeAssignmentChanges(listener);
    (mocks.subscribe.mock.calls[0]?.[0] as () => void)();
    (mocks.classSubscribe.mock.calls[0]?.[0] as () => void)();
    expect(listener).toHaveBeenCalledTimes(2);

    stop();
    expect(stopAssignments).toHaveBeenCalled();
    expect(stopClasses).toHaveBeenCalled();
  });

  // MYK9-1327: a pending pick changes only the class row. The ringside list must follow it.
  describe('class-level judges come from the class row', () => {
    const assignment = (id: string, personId: string, classId: string | null) => ({
      id,
      showId: 'show-1',
      personId,
      classId,
      status: 'confirmed',
    });
    const classRow = (id: string, judgeId: string | undefined, judgeResolved = true) => ({
      id,
      trialId: 'trial-1',
      judgeId,
      judgeResolved,
    });

    beforeEach(() => {
      mocks.getTrialsByShow.mockResolvedValue([{ id: 'trial-1' }]);
    });

    it('reports the NEW judge for a class with a pending pick, and drops the old one', async () => {
      // The assignment replica still names judge-old; the class row says judge-new.
      mocks.getAllWithStatus.mockResolvedValue(okRows([assignment('a1', 'judge-old', 'class-X')]));
      mocks.getClassesByTrial.mockResolvedValue([classRow('class-X', 'judge-new')]);

      const forNew = await getActiveJudgeAssignmentsForShow('show-1', 'judge-new');
      const forOld = await getActiveJudgeAssignmentsForShow('show-1', 'judge-old');

      expect(forNew.map(a => a.classId)).toEqual(['class-X']);
      expect(forOld).toEqual([]);
    });

    it('keeps the replica row (and its fields) when it names the class row judge', async () => {
      mocks.getAllWithStatus.mockResolvedValue(okRows([assignment('a1', 'judge-1', 'class-X')]));
      mocks.getClassesByTrial.mockResolvedValue([classRow('class-X', 'judge-1')]);

      const result = await getActiveJudgeAssignmentsForShow('show-1', 'judge-1');

      expect(result.map(a => a.id)).toEqual(['a1']);
    });

    it('removes a class judge when the class row names none', async () => {
      mocks.getAllWithStatus.mockResolvedValue(okRows([assignment('a1', 'judge-1', 'class-X')]));
      mocks.getClassesByTrial.mockResolvedValue([classRow('class-X', undefined)]);

      expect(await getActiveJudgeAssignmentsForShow('show-1', 'judge-1')).toEqual([]);
    });

    it('falls back to the replica for a class whose judge lookup never ran', async () => {
      mocks.getAllWithStatus.mockResolvedValue(okRows([assignment('a1', 'judge-1', 'class-X')]));
      mocks.getClassesByTrial.mockResolvedValue([classRow('class-X', undefined, false)]);

      const result = await getActiveJudgeAssignmentsForShow('show-1', 'judge-1');

      expect(result.map(a => a.id)).toEqual(['a1']);
    });

    it('leaves show-level rows to the assignment replica', async () => {
      mocks.getAllWithStatus.mockResolvedValue(okRows([assignment('s1', 'judge-1', null)]));
      mocks.getClassesByTrial.mockResolvedValue([classRow('class-X', 'judge-2')]);

      // Show-level rows are never class assignments; only the class row's judge is reported.
      expect(await getActiveJudgeAssignmentsForShow('show-1', 'judge-1')).toEqual([]);
      const other = await getActiveJudgeAssignmentsForShow('show-1', 'judge-2');
      expect(other.map(a => a.classId)).toEqual(['class-X']);
    });
  });
});

describe('getActiveJudgeAssignmentShows read failures', () => {
  it('throws when the device read fails instead of reporting no shows', async () => {
    mocks.getAllWithStatus.mockResolvedValue({ ok: false, rows: [], error: new Error('idb') });

    await expect(getActiveJudgeAssignmentShows('judge-1')).rejects.toThrow(
      /could not read judge assignments/i
    );
  });
});
