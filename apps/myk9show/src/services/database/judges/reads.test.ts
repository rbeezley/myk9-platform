import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  replaceShowLevelAssignments: vi.fn(async () => undefined),
  createAssignment: vi.fn(async () => ({ id: 'new-1' })),
  replaceClassAssignment: vi.fn(async () => undefined),
  reassignClassAssignment: vi.fn(async () => undefined),
  updateClass: vi.fn(async () => 'mutation-1'),
}));

vi.mock('@/services/replication', () => ({
  replicatedJudgeAssignmentsTable: {
    replaceShowLevelAssignments: mocks.replaceShowLevelAssignments,
    createAssignment: mocks.createAssignment,
    replaceClassAssignment: mocks.replaceClassAssignment,
    reassignClassAssignment: mocks.reassignClassAssignment,
  },
  replicatedClassesTable: {
    updateClass: mocks.updateClass,
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
  upsertClassJudgeAssignment,
  reassignClassJudge,
} from './reads';

describe('persistShowJudgeAssignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.replaceShowLevelAssignments.mockResolvedValue(undefined);
    mocks.createAssignment.mockResolvedValue({ id: 'new-1' });
  });

  it('replaces show-level assignments through the replicated table', async () => {
    await persistShowJudgeAssignments('show-1', [{ judgeId: 'judge-1' }, { judgeId: 'judge-2' }]);

    expect(mocks.replaceShowLevelAssignments).toHaveBeenCalledWith('show-1', [
      'judge-1',
      'judge-2',
    ]);
    expect(mocks.createAssignment).not.toHaveBeenCalled();
  });

  it('skips the delete step and only creates when skipDelete is set', async () => {
    await persistShowJudgeAssignments('show-1', [{ judgeId: 'judge-1' }], { skipDelete: true });

    expect(mocks.replaceShowLevelAssignments).not.toHaveBeenCalled();
    expect(mocks.createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: 'judge-1',
        showId: 'show-1',
        classId: null,
        status: 'confirmed',
      })
    );
  });

  it('wraps a replace failure in a judge_assignments database error', async () => {
    mocks.replaceShowLevelAssignments.mockRejectedValueOnce(new Error('offline queue full'));

    // MYK9-181: assert the table/operation `createDatabaseError` records on
    // the error. The old file-local mock folded them into the message as
    // `table:operation:msg`, a format production never emits — so the old
    // assertion could only ever pass against that mock.
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

describe('upsertClassJudgeAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.replaceClassAssignment.mockResolvedValue(undefined);
  });

  it('replaces the class assignment through the replicated table', async () => {
    await upsertClassJudgeAssignment('show-1', 'class-1', 'judge-1');

    expect(mocks.replaceClassAssignment).toHaveBeenCalledWith('show-1', 'class-1', 'judge-1');
  });

  it('treats TBD as a removal (null judgeId)', async () => {
    await upsertClassJudgeAssignment('show-1', 'class-1', 'TBD');

    expect(mocks.replaceClassAssignment).toHaveBeenCalledWith('show-1', 'class-1', null);
  });

  it('touches the class through the replicated table (offline-safe) after the assignment write', async () => {
    await upsertClassJudgeAssignment('show-1', 'class-1', 'judge-1');

    expect(mocks.updateClass).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({ _lastModified: expect.any(Date) })
    );
    // Must not fall back to a direct, offline-unsafe Supabase write.
    expect(untypedFromMocks.untypedFromMock).not.toHaveBeenCalledWith('classes');
  });

  it('wraps a replace failure in a judge_assignments database error', async () => {
    mocks.replaceClassAssignment.mockRejectedValueOnce(new Error('offline queue full'));

    // MYK9-181: assert the table/operation `createDatabaseError` records on
    // the error. The old file-local mock folded them into the message as
    // `table:operation:msg`, a format production never emits — so the old
    // assertion could only ever pass against that mock.
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
  });

  it('reassigns through the replicated table', async () => {
    await reassignClassJudge('show-1', 'class-1', 'judge-1', 'judge-2');

    expect(mocks.reassignClassAssignment).toHaveBeenCalledWith(
      'show-1',
      'class-1',
      'judge-1',
      'judge-2'
    );
  });

  it('touches the class through the replicated table after reassigning', async () => {
    await reassignClassJudge('show-1', 'class-1', 'judge-1', 'judge-2');

    expect(mocks.updateClass).toHaveBeenCalledWith(
      'class-1',
      expect.objectContaining({ _lastModified: expect.any(Date) })
    );
  });

  it('wraps a reassign failure in a judge_assignments database error', async () => {
    mocks.reassignClassAssignment.mockRejectedValueOnce(new Error('no match'));

    // MYK9-181: assert the table/operation `createDatabaseError` records on
    // the error. The old file-local mock folded them into the message as
    // `table:operation:msg`, a format production never emits — so the old
    // assertion could only ever pass against that mock.
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
