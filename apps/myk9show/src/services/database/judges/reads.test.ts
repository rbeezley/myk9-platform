import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyShowLevelJudgeChanges: vi.fn(async () => undefined),
  createAssignment: vi.fn(async () => ({ id: 'new-1' })),
  reassignClassAssignment: vi.fn(async () => undefined),
  setClassJudge: vi.fn(async () => 'mutation-1'),
  hasUnsentJudgePick: vi.fn(async () => false),
}));

vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: {
    applyShowLevelJudgeChanges: mocks.applyShowLevelJudgeChanges,
    createAssignment: mocks.createAssignment,
    reassignClassAssignment: mocks.reassignClassAssignment,
  },
  replicatedClassesTable: {
    setClassJudge: mocks.setClassJudge,
    hasUnsentJudgePick: mocks.hasUnsentJudgePick,
  },
}));

const untypedFromMocks = vi.hoisted(() => {
  const eqMock = vi.fn(async () => ({ error: null }));
  const updateMock = vi.fn(() => ({ eq: eqMock }));
  const untypedFromMock = vi.fn(() => ({ update: updateMock }));
  return { eqMock, updateMock, untypedFromMock };
});

vi.mock('../_shared/untyped-from', () => ({
  untypedFrom: untypedFromMocks.untypedFromMock,
}));

vi.mock('../supabaseClient', () => ({
  supabase: {},
  logQuery: vi.fn(),
  createDatabaseError,
}));

import {
  persistShowJudgeAssignments,
  saveShowJudgeChanges,
  upsertClassJudgeAssignment,
  reassignClassJudge,
} from './reads';

describe('persistShowJudgeAssignments (a new show)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyShowLevelJudgeChanges.mockResolvedValue(undefined);
  });

  it('only creates confirmed show-level rows, without reading first', async () => {
    await persistShowJudgeAssignments('show-1', [{ judgeId: 'judge-1' }, { judgeId: 'judge-2' }]);

    expect(mocks.applyShowLevelJudgeChanges).not.toHaveBeenCalled();
    expect(mocks.createAssignment).toHaveBeenCalledTimes(2);
    expect(mocks.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'judge-1',
        showId: 'show-1',
        classId: null,
        status: 'confirmed',
      })
    );
  });

  it('wraps a write failure in a judge_assignments database error', async () => {
    mocks.createAssignment.mockRejectedValueOnce(new Error('offline queue full'));

    // MYK9-181: assert the table/operation `createDatabaseError` records on
    // the error, the format production emits.
    await expect(
      persistShowJudgeAssignments('show-1', [{ judgeId: 'judge-1' }])
    ).rejects.toMatchObject({
      name: 'DatabaseError',
      table: 'judge_assignments',
      operation: 'persist_show_assignments',
      message: 'offline queue full',
    });
  });
});

// MYK9-772: an edit is saved as the difference from the list it loaded, never
// as "replace the list" — a list that loaded empty from a failed device read
// used to delete every real judge.
describe('saveShowJudgeChanges (an edit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyShowLevelJudgeChanges.mockResolvedValue(undefined);
  });

  it('writes nothing when the list is unchanged', async () => {
    await saveShowJudgeChanges(
      'show-1',
      [{ judgeId: 'a' }, { judgeId: 'b' }],
      [{ judgeId: 'b' }, { judgeId: 'a' }]
    );
    expect(mocks.applyShowLevelJudgeChanges).not.toHaveBeenCalled();
  });

  it('can only add when the loaded list was empty (unreadable)', async () => {
    await saveShowJudgeChanges('show-1', [], [{ judgeId: 'c' }]);
    expect(mocks.applyShowLevelJudgeChanges).toHaveBeenCalledWith('show-1', {
      add: ['c'],
      remove: [],
    });
  });

  it('removes only the judges taken off the list', async () => {
    await saveShowJudgeChanges(
      'show-1',
      [{ judgeId: 'a' }, { judgeId: 'b' }],
      [{ judgeId: 'b' }, { judgeId: 'c' }]
    );
    expect(mocks.applyShowLevelJudgeChanges).toHaveBeenCalledWith('show-1', {
      add: ['c'],
      remove: ['a'],
    });
  });

  it('wraps a write failure in a judge_assignments database error', async () => {
    mocks.applyShowLevelJudgeChanges.mockRejectedValueOnce(new Error('read timed out'));
    await expect(saveShowJudgeChanges('show-1', [], [{ judgeId: 'c' }])).rejects.toMatchObject({
      name: 'DatabaseError',
      table: 'judge_assignments',
      operation: 'save_show_judge_changes',
    });
  });
});

describe('upsertClassJudgeAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setClassJudge.mockResolvedValue('mutation-1');
  });

  // MYK9-1327: one pick is ONE queued set_class_judge mutation, written through the class table.
  it('queues the pick through the class table with the picked judge', async () => {
    await upsertClassJudgeAssignment('show-1', 'class-1', 'judge-1', {
      name: 'Jane Judge',
      firstName: 'Jane',
      lastName: 'Judge',
    });

    expect(mocks.setClassJudge).toHaveBeenCalledTimes(1);
    expect(mocks.setClassJudge).toHaveBeenCalledWith('class-1', {
      personId: 'judge-1',
      name: 'Jane Judge',
      firstName: 'Jane',
      lastName: 'Judge',
    });
  });

  it('treats TBD as a removal (null judge)', async () => {
    await upsertClassJudgeAssignment('show-1', 'class-1', 'TBD');

    expect(mocks.setClassJudge).toHaveBeenCalledWith('class-1', null);
  });

  it('treats an empty judge id as a removal', async () => {
    await upsertClassJudgeAssignment('show-1', 'class-1', '');

    expect(mocks.setClassJudge).toHaveBeenCalledWith('class-1', null);
  });

  it('writes no judge_assignments row and no plain class update', async () => {
    await upsertClassJudgeAssignment('show-1', 'class-1', 'judge-1');

    expect(mocks.createAssignment).not.toHaveBeenCalled();
    expect(untypedFromMocks.untypedFromMock).not.toHaveBeenCalled();
  });

  it('wraps a failure in a judge_assignments database error', async () => {
    mocks.setClassJudge.mockRejectedValueOnce(new Error('offline queue full'));

    // MYK9-181: assert the table/operation `createDatabaseError` records on the error.
    await expect(upsertClassJudgeAssignment('show-1', 'class-1', 'judge-1')).rejects.toMatchObject({
      name: 'DatabaseError',
      table: 'judge_assignments',
      operation: 'upsert_class_assignment',
      message: 'offline queue full',
    });
  });
});

describe('reassignClassJudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reassignClassAssignment.mockResolvedValue(undefined);
    mocks.hasUnsentJudgePick.mockResolvedValue(false);
  });

  it('reassigns in place through the replicated table when no pick is queued', async () => {
    await reassignClassJudge('show-1', 'class-1', 'judge-1', 'judge-2');

    expect(mocks.reassignClassAssignment).toHaveBeenCalledWith(
      'show-1',
      'class-1',
      'judge-1',
      'judge-2'
    );
    expect(mocks.setClassJudge).not.toHaveBeenCalled();
  });

  it('queues another set_class_judge, and no in-place update, while a pick is unsent', async () => {
    mocks.hasUnsentJudgePick.mockResolvedValue(true);

    await reassignClassJudge('show-1', 'class-1', 'judge-1', 'judge-2');

    expect(mocks.setClassJudge).toHaveBeenCalledWith('class-1', { personId: 'judge-2' });
    expect(mocks.reassignClassAssignment).not.toHaveBeenCalled();
  });

  it('wraps a reassign failure in a judge_assignments database error', async () => {
    mocks.reassignClassAssignment.mockRejectedValueOnce(new Error('no match'));

    await expect(
      reassignClassJudge('show-1', 'class-1', 'judge-1', 'judge-2')
    ).rejects.toMatchObject({
      name: 'DatabaseError',
      table: 'judge_assignments',
      operation: 'reassign_class_judge',
      message: 'no match',
    });
  });
});
