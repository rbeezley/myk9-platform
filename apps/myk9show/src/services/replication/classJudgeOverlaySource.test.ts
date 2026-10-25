import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedClass } from './ReplicatedClassesTable';
import type { ReplicatedJudgeAssignment } from './ReplicatedJudgeAssignmentsTable.mapper';
import {
  CLASS_JUDGE_SETTLE_TTL_MS,
  ClassJudgeOverlaySource,
  type ClassJudgeAssignmentsPort,
} from './classJudgeOverlaySource';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const classRow = {
  id: 'c1',
  name: 'Novice',
  judgeId: 'judge-a',
  judgeName: 'Ann',
} as ReplicatedClass;
const pickB = {
  id: 'ja-b',
  personId: 'judge-b',
  classId: 'c1',
  localJudge: { name: 'Bob' },
} as ReplicatedJudgeAssignment;

function makePort(overrides: Partial<ClassJudgeAssignmentsPort> = {}) {
  let settled: ((ids: string[]) => void) | undefined;
  const port: ClassJudgeAssignmentsPort = {
    getUnsentClassWork: async () => ({
      unsentRowIds: new Set(['ja-b']),
      classIds: new Set(['c1']),
    }),
    getByClassWithStatus: async () => ({ ok: true, rows: [pickB] }),
    subscribe: () => () => undefined,
    onClassJudgesSettled: listener => {
      settled = listener;
      return () => undefined;
    },
    ...overrides,
  } as ClassJudgeAssignmentsPort;
  return { port, settle: (ids: string[]) => settled?.(ids) };
}

describe('ClassJudgeOverlaySource', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the stored rows untouched when the judge writes cannot be read', async () => {
    const { port } = makePort({
      getUnsentClassWork: async () => {
        throw new Error('queue unreadable');
      },
    });
    const rows = [classRow];

    const shown = await new ClassJudgeOverlaySource(
      () => port,
      async () => new Set<string>(),
      () => undefined
    ).present(rows);

    expect(shown).toBe(rows);
  });

  it('shows a class as stored when its assignments cannot be read', async () => {
    const { port } = makePort({
      getByClassWithStatus: async () => ({ ok: false, error: new Error('idb') }),
    } as unknown as Partial<ClassJudgeAssignmentsPort>);
    const rows = [classRow];

    const shown = await new ClassJudgeOverlaySource(
      () => port,
      async () => new Set<string>(),
      () => undefined
    ).present(rows);

    expect(shown[0]?.judgeId).toBe('judge-a');
  });

  it('reads nothing but the queue when no judge work is pending', async () => {
    const getByClassWithStatus = vi.fn();
    const { port } = makePort({
      getUnsentClassWork: async () => ({
        unsentRowIds: new Set(),
        deletedRowIds: new Set(),
        classIds: new Set(),
      }),
      getByClassWithStatus,
    });

    const shown = await new ClassJudgeOverlaySource(
      () => port,
      async () => new Set<string>(),
      () => undefined
    ).present([classRow]);

    expect(shown[0]?.judgeId).toBe('judge-a');
    expect(getByClassWithStatus).not.toHaveBeenCalled();
  });

  it('holds the local judge from the acknowledgement until the refresh lands, then lets go', async () => {
    let finishRefresh!: () => void;
    const refresh = vi.fn(
      () =>
        new Promise<ReadonlySet<string>>(
          resolve => (finishRefresh = () => resolve(new Set(['c1'])))
        )
    );
    const changed = vi.fn();
    const { port, settle } = makePort({
      getUnsentClassWork: async () => ({
        unsentRowIds: new Set(),
        deletedRowIds: new Set(),
        classIds: new Set(),
      }),
    });
    const source = new ClassJudgeOverlaySource(() => port, refresh, changed);
    await source.present([classRow]); // starts the source

    settle(['c1']);
    expect(refresh).toHaveBeenCalledWith(['c1']);
    expect((await source.present([classRow]))[0]?.judgeId).toBe('judge-b');

    finishRefresh();
    await vi.waitFor(() => expect(changed).toHaveBeenCalled());
    expect((await source.present([classRow]))[0]?.judgeId).toBe('judge-a');
  });

  it('keeps the local judge when the refresh fails, until the wait runs out', async () => {
    const { port, settle } = makePort({
      getUnsentClassWork: async () => ({
        unsentRowIds: new Set(),
        deletedRowIds: new Set(),
        classIds: new Set(),
      }),
    });
    const source = new ClassJudgeOverlaySource(
      () => port,
      async () => {
        throw new Error('offline');
      },
      () => undefined
    );
    await source.present([classRow]);

    settle(['c1']);
    await vi.advanceTimersByTimeAsync(10);
    expect((await source.present([classRow]))[0]?.judgeId).toBe('judge-b');

    await vi.advanceTimersByTimeAsync(CLASS_JUDGE_SETTLE_TTL_MS + 1);
    expect((await source.present([classRow]))[0]?.judgeId).toBe('judge-a');
  });
});
