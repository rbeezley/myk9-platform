import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedClass } from './ReplicatedClassesTable';
import type { ReplicatedJudgeAssignment } from './ReplicatedJudgeAssignmentsTable.mapper';
import type { ClassJudgeClear } from './ReplicatedClassJudgeClearsTable';
import type { UnsentClassJudgeWork } from './judgeAssignmentClassWork';
import {
  ClassJudgeOverlaySource,
  type ClassJudgeAssignmentsPort,
  type ClassJudgeClearsPort,
} from './classJudgeOverlaySource';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const T = 1_800_000_000_000;
const classRow = (extra: Partial<ReplicatedClass> = {}): ReplicatedClass => ({
  id: 'c1',
  name: 'Novice',
  judgeId: 'judge-a',
  judgeName: 'Ann Judge',
  serverUpdatedAt: T,
  ...extra,
});
const row = (extra: Partial<ReplicatedJudgeAssignment> = {}): ReplicatedJudgeAssignment =>
  ({
    id: 'ja-b',
    personId: 'judge-b',
    classId: 'c1',
    status: 'confirmed',
    localJudge: { name: 'Bob Judge' },
    ...extra,
  }) as ReplicatedJudgeAssignment;

const noWork = (): UnsentClassJudgeWork => ({
  unsentRowIds: new Set(),
  deletedRowIds: new Set(),
  classIds: new Set(),
});

function setup(
  assignments: ReplicatedJudgeAssignment[] = [],
  work: UnsentClassJudgeWork = noWork(),
  clears: ClassJudgeClear[] = []
) {
  const deleted: string[] = [];
  const port: ClassJudgeAssignmentsPort = {
    getUnsentClassWork: async () => work,
    getAllWithStatus: async () => ({ ok: true as const, rows: assignments, error: null }),
    getByClassWithStatus: async classId => ({
      ok: true as const,
      rows: assignments.filter(a => a.classId === classId),
      error: null,
    }),
    subscribe: () => () => undefined,
  };
  const clearsPort: ClassJudgeClearsPort = {
    getAll: async () => clears,
    getByClassWithStatus: async classId => ({
      ok: true as const,
      rows: clears.filter(c => c.classId === classId),
      error: null,
    }),
    delete: async id => void deleted.push(id),
    subscribe: () => () => undefined,
  };
  return {
    source: new ClassJudgeOverlaySource(
      () => port,
      () => clearsPort,
      () => undefined
    ),
    deleted,
  };
}

describe('ClassJudgeOverlaySource', () => {
  beforeEach(() => vi.useRealTimers());

  it('returns the stored rows untouched when the local state cannot be read', async () => {
    const port = {
      getUnsentClassWork: async () => {
        throw new Error('queue unreadable');
      },
      subscribe: () => () => undefined,
    } as unknown as ClassJudgeAssignmentsPort;
    const rows = [classRow()];
    const source = new ClassJudgeOverlaySource(
      () => port,
      () => ({
        getAll: async () => [],
        getByClassWithStatus: async () => ({ ok: true as const, rows: [], error: null }),
        delete: async () => undefined,
        subscribe: () => () => undefined,
      }),
      () => undefined
    );

    expect(await source.present(rows)).toBe(rows);
  });

  it('leaves a class alone when nothing is waiting and no delivered row is newer than it', async () => {
    const rows = [classRow()];
    const { source } = setup([row({ serverUpdatedAt: T })]);

    expect(await source.present(rows)).toBe(rows);
  });

  it('speaks for a delivered row whose server time is newer than the class row', async () => {
    const { source } = setup([row({ serverUpdatedAt: T + 1 })]);

    const [shown] = await source.present([classRow()]);

    expect(shown).toMatchObject({ judgeId: 'judge-b', judgeName: 'Bob Judge' });
  });

  it('speaks for a delivered row this device created until a pull stamps it', async () => {
    const { source } = setup([row({ _lastModified: new Date() })]);

    expect((await source.present([classRow()]))[0]?.judgeId).toBe('judge-b');
  });

  it('ignores a delivered row with no server time and no local write (a legacy cached row)', async () => {
    const rows = [classRow()];
    const { source } = setup([row()]);

    expect(await source.present(rows)).toBe(rows);
  });

  it('ignores an unstamped local row once a stamped row of the same class exists', async () => {
    const rows = [classRow()];
    const { source } = setup([
      row({ _lastModified: new Date() }),
      row({ id: 'ja-d', personId: 'judge-d', serverUpdatedAt: T - 5 }),
    ]);

    expect(await source.present(rows)).toBe(rows);
  });

  it('prefers the newer server time among delivered rows that are not caught up', async () => {
    const { source } = setup([
      row({ id: 'ja-b', personId: 'judge-b', serverUpdatedAt: T + 1 }),
      row({ id: 'ja-c', personId: 'judge-c', serverUpdatedAt: T + 2, localJudge: undefined }),
    ]);

    expect((await source.present([classRow()]))[0]?.judgeId).toBe('judge-c');
  });

  it('shows no judge for a delivered clear until the class row is pulled past it, then drops it', async () => {
    const clear: ClassJudgeClear = {
      id: 'ja-a',
      classId: 'c1',
      createdAt: T,
      ackedAt: T + 10,
      classTimeAtAck: T,
    };
    const live = setup([], noWork(), [clear]);
    expect((await live.source.present([classRow()]))[0]?.judgeId).toBeUndefined();
    expect(live.deleted).toEqual([]);

    const caughtUp = setup([], noWork(), [clear]);
    const rows = [classRow({ serverUpdatedAt: T + 1 })];
    expect(await caughtUp.source.present(rows)).toBe(rows);
    await vi.waitFor(() => expect(caughtUp.deleted).toEqual(['ja-a']));
  });

  it('ignores a clear that was never acknowledged, and drops it once it is old and not queued', async () => {
    const rows = [classRow()];
    const fresh = setup([], noWork(), [{ id: 'ja-a', classId: 'c1', createdAt: Date.now() }]);
    expect(await fresh.source.present(rows)).toBe(rows);
    expect(fresh.deleted).toEqual([]);

    const old = setup([], noWork(), [
      { id: 'ja-a', classId: 'c1', createdAt: Date.now() - 3_600_000 },
    ]);
    await old.source.present(rows);
    await vi.waitFor(() => expect(old.deleted).toEqual(['ja-a']));
  });

  it('ignores an assignment that is not confirmed', async () => {
    const rows = [classRow()];
    const { source } = setup([
      row({ id: 'ja-i', personId: 'judge-i', status: 'invited', serverUpdatedAt: T + 5 }),
      row({ id: 'ja-d', personId: 'judge-x', status: 'declined', _lastModified: new Date() }),
    ]);

    expect(await source.present(rows)).toBe(rows);
  });

  it('puts the unsent assignment first, excluding a row whose delete is waiting', async () => {
    const work: UnsentClassJudgeWork = {
      unsentRowIds: new Set(['ja-c']),
      deletedRowIds: new Set(['ja-a']),
      classIds: new Set(['c1']),
    };
    const { source } = setup(
      [
        row({ id: 'ja-a', personId: 'judge-a', serverUpdatedAt: T + 50 }),
        row({ id: 'ja-c', personId: 'judge-c', localJudge: { name: 'Cy Judge' } }),
      ],
      work
    );

    expect((await source.present([classRow()]))[0]).toMatchObject({
      judgeId: 'judge-c',
      judgeName: 'Cy Judge',
    });
  });

  it('gives a caught-up class the pick name when the pull brought the id without a name', async () => {
    const { source } = setup([row({ serverUpdatedAt: T })]);

    const [shown] = await source.present([classRow({ judgeId: 'judge-b', judgeName: undefined })]);

    expect(shown).toMatchObject({ judgeId: 'judge-b', judgeName: 'Bob Judge' });
  });
});
