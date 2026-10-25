import { describe, expect, it } from 'vitest';
import type { ReplicatedClass } from './ReplicatedClassesTable';
import type { ReplicatedJudgeAssignment } from './ReplicatedJudgeAssignmentsTable.mapper';
import {
  overlayClassJudges,
  restoreMissingJudgeNames,
  type JudgeNameLookup,
} from './classJudgeOverlay';

const cls = (id: string, extra: Partial<ReplicatedClass> = {}): ReplicatedClass => ({
  id,
  name: `Class ${id}`,
  judgeId: 'judge-a',
  judgeName: 'Ann Judge',
  judgeFirstName: 'Ann',
  judgeLastName: 'Judge',
  judgeResolved: true,
  ...extra,
});

const assignment = (
  id: string,
  personId: string,
  classId: string | null,
  extra: Partial<ReplicatedJudgeAssignment> = {}
): ReplicatedJudgeAssignment =>
  ({
    id,
    personId,
    classId,
    showId: 'show-1',
    trialId: null,
    status: 'confirmed',
    ...extra,
  }) as ReplicatedJudgeAssignment;

const scope = (active: string[], unsent: string[] = []) => ({
  activeClassIds: new Set(active),
  unsentRowIds: new Set(unsent),
});

describe('overlayClassJudges', () => {
  it('puts the unsent assignment judge on its class, ahead of the server judge', () => {
    const [shown] = overlayClassJudges(
      [cls('c1')],
      [
        assignment('ja-b', 'judge-b', 'c1', {
          localJudge: { name: 'Bob Judge', firstName: 'Bob' },
        }),
      ],
      scope(['c1'], ['ja-b'])
    );

    expect(shown).toMatchObject({
      judgeId: 'judge-b',
      judgeName: 'Bob Judge',
      judgeFirstName: 'Bob',
      judgeLastName: undefined,
      judgeResolved: true,
    });
  });

  it('ignores a delivered local assignment for a class with no pending work', () => {
    const classes = [cls('c1')];
    const result = overlayClassJudges(
      classes,
      [assignment('ja-stale', 'judge-z', 'c1', { _syncStatus: 'synced' })],
      scope([])
    );

    expect(result).toBe(classes); // nothing changed: the very same rows
    expect(result[0]?.judgeId).toBe('judge-a');
  });

  it('leaves other classes alone', () => {
    const result = overlayClassJudges(
      [cls('c1'), cls('c2')],
      [assignment('ja-b', 'judge-b', 'c1')],
      scope(['c1'], ['ja-b']),
      () => undefined
    );

    expect(result[0]?.judgeId).toBe('judge-b');
    expect(result[1]?.judgeId).toBe('judge-a');
  });

  it('takes the newest write, then the lowest id, when several claim the class', () => {
    const older = new Date('2026-10-01T10:00:00Z');
    const newer = new Date('2026-10-01T10:05:00Z');
    const rows = [
      assignment('ja-2', 'judge-b', 'c1', { _lastModified: older }),
      assignment('ja-1', 'judge-c', 'c1', { _lastModified: newer }),
      assignment('ja-0', 'judge-d', 'c1', { _lastModified: newer }),
    ];
    const shown = overlayClassJudges([cls('c1')], rows, scope(['c1'], ['ja-0', 'ja-1', 'ja-2']));
    expect(shown[0]?.judgeId).toBe('judge-d'); // newest, lowest id among the tie

    const reversed = overlayClassJudges(
      [cls('c1')],
      [...rows].reverse(),
      scope(['c1'], ['ja-0', 'ja-1', 'ja-2'])
    );
    expect(reversed[0]?.judgeId).toBe('judge-d'); // never depends on read order
  });

  it('ranks an undelivered row above a delivered one, however new the delivered one looks', () => {
    const rows = [
      assignment('ja-sent', 'judge-b', 'c1', { _lastModified: new Date('2026-12-01T00:00:00Z') }),
      assignment('ja-unsent', 'judge-c', 'c1', { _lastModified: new Date('2026-10-01T00:00:00Z') }),
    ];

    const [shown] = overlayClassJudges([cls('c1')], rows, scope(['c1'], ['ja-unsent']));

    expect(shown?.judgeId).toBe('judge-c');
  });

  it('falls back to a delivered local row when nothing is undelivered but the class is settling', () => {
    const [shown] = overlayClassJudges(
      [cls('c1')],
      [assignment('ja-b', 'judge-b', 'c1', { localJudge: { name: 'Bob Judge' } })],
      scope(['c1'])
    );

    expect(shown?.judgeId).toBe('judge-b');
  });

  it('shows no judge for an active class whose assignments are all removed', () => {
    const [shown] = overlayClassJudges([cls('c1')], [], scope(['c1']));

    expect(shown).toMatchObject({ judgeResolved: true });
    expect(shown?.judgeId).toBeUndefined();
    expect(shown?.judgeName).toBeUndefined();
    expect(shown?.judgeFirstName).toBeUndefined();
    expect(shown?.judgeLastName).toBeUndefined();
  });

  it('drops an assignment row whose removal is waiting, even when a sync downloaded it again', () => {
    const [shown] = overlayClassJudges(
      [cls('c1')],
      [assignment('ja-a', 'judge-a', 'c1', { _syncStatus: 'synced' })],
      { activeClassIds: new Set(['c1']), unsentRowIds: new Set(), deletedRowIds: new Set(['ja-a']) }
    );

    expect(shown?.judgeId).toBeUndefined();
    expect(shown?.judgeResolved).toBe(true);
  });

  it('never lets a show-level assignment name a class', () => {
    const [shown] = overlayClassJudges(
      [cls('c1')],
      [assignment('ja-show', 'judge-z', null)],
      scope(['c1'], ['ja-show'])
    );

    expect(shown?.judgeId).toBeUndefined();
  });

  describe('naming the picked judge', () => {
    const lookup: JudgeNameLookup = id =>
      id === 'judge-b' ? { name: 'Bob People', firstName: 'Bob', lastName: 'People' } : undefined;

    it("prefers the pick's own name", () => {
      const [shown] = overlayClassJudges(
        [cls('c1')],
        [assignment('ja-b', 'judge-b', 'c1', { localJudge: { name: 'Bob Picked' } })],
        scope(['c1'], ['ja-b']),
        lookup
      );
      expect(shown?.judgeName).toBe('Bob Picked');
    });

    it('then a server-joined name on any class naming the same judge', () => {
      const [, shown] = overlayClassJudges(
        [
          cls('other', { judgeId: 'judge-b', judgeName: 'Bob Joined', judgeFirstName: 'Bob' }),
          cls('c1'),
        ],
        [assignment('ja-b', 'judge-b', 'c1')],
        scope(['c1'], ['ja-b']),
        lookup
      );
      expect(shown).toMatchObject({
        judgeId: 'judge-b',
        judgeName: 'Bob Joined',
        judgeFirstName: 'Bob',
      });
    });

    it('then the registered people source', () => {
      const [shown] = overlayClassJudges(
        [cls('c1')],
        [assignment('ja-b', 'judge-b', 'c1')],
        scope(['c1'], ['ja-b']),
        lookup
      );
      expect(shown).toMatchObject({ judgeName: 'Bob People', judgeLastName: 'People' });
    });

    it('then the id alone, never the previous judge name', () => {
      const [shown] = overlayClassJudges(
        [cls('c1')],
        [assignment('ja-q', 'judge-q', 'c1')],
        scope(['c1'], ['ja-q']),
        lookup
      );
      expect(shown?.judgeId).toBe('judge-q');
      expect(shown?.judgeName).toBeUndefined();
      expect(shown?.judgeFirstName).toBeUndefined();
    });
  });
});

describe('restoreMissingJudgeNames', () => {
  const pick = assignment('ja-b', 'judge-b', 'c1', { localJudge: { name: 'Bob Judge' } });

  it("names a judge the class row has only an id for, from this device's own pick", () => {
    const [shown] = restoreMissingJudgeNames(
      [cls('c1', { judgeId: 'judge-b', judgeName: undefined })],
      new Map([['c1', [pick]]])
    );
    expect(shown?.judgeName).toBe('Bob Judge');
  });

  it('never puts a name beside a different judge id, nor over an existing name', () => {
    const classes = [cls('c1', { judgeId: 'judge-z', judgeName: undefined }), cls('c2')];
    const result = restoreMissingJudgeNames(
      classes,
      new Map([
        ['c1', [pick]],
        ['c2', [pick]],
      ])
    );
    expect(result).toBe(classes);
  });
});
