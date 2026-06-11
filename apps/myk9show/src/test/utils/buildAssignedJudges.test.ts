import { describe, it, expect } from 'vitest';
import { buildAssignedJudges, getJudgeNameById } from '@/utils/buildAssignedJudges';
import type { ReplicatedJudgeAssignment } from '@/services/replication/ReplicatedJudgeAssignmentsTable';

const makePerson = (id: string, first: string, last: string) => ({
  id,
  firstName: first,
  lastName: last,
});

const makeAssignment = (
  overrides: Partial<ReplicatedJudgeAssignment> & { id: string; personId: string }
): ReplicatedJudgeAssignment => ({
  showId: null,
  trialId: null,
  classId: null,
  status: 'confirmed',
  invitedAt: null,
  confirmedAt: null,
  fee: null,
  notes: null,
  className: null,
  classElement: null,
  classLevel: null,
  classStatus: null,
  classStartTime: null,
  classScoredCount: null,
  classTotalEntries: null,
  trialDate: null,
  trialTimezone: null,
  ...overrides,
});

describe('buildAssignedJudges', () => {
  const people = [makePerson('p-1', 'Richard', 'Beezley'), makePerson('p-2', 'Jane', 'Smith')];

  it('groups multiple assignments by personId into one ShowJudgeAssignment', () => {
    const assignments = [
      makeAssignment({ id: 'ja-1', personId: 'p-1', showId: 'show-1', classId: 'cls-1' }),
      makeAssignment({ id: 'ja-2', personId: 'p-1', showId: 'show-1', classId: 'cls-2' }),
    ];

    const result = buildAssignedJudges(assignments, 'show-1', people);

    expect(result).toHaveLength(1);
    expect(result[0].judgeId).toBe('p-1');
    expect(result[0].assignedClasses).toEqual(['cls-1', 'cls-2']);
  });

  it('resolves judge name from people array', () => {
    const assignments = [makeAssignment({ id: 'ja-1', personId: 'p-1', showId: 'show-1' })];

    const result = buildAssignedJudges(assignments, 'show-1', people);

    expect(result[0].judgeName).toBe('Richard Beezley');
  });

  it('falls back to "Unknown Judge" when person not found', () => {
    const assignments = [makeAssignment({ id: 'ja-1', personId: 'p-unknown', showId: 'show-1' })];

    const result = buildAssignedJudges(assignments, 'show-1', people);

    expect(result[0].judgeName).toBe('Unknown Judge');
  });

  it('collects non-null classId values into assignedClasses', () => {
    const assignments = [
      makeAssignment({ id: 'ja-1', personId: 'p-1', showId: 'show-1', classId: 'cls-1' }),
      makeAssignment({ id: 'ja-2', personId: 'p-1', showId: 'show-1', classId: 'cls-2' }),
    ];

    const result = buildAssignedJudges(assignments, 'show-1', people);

    expect(result[0].assignedClasses).toEqual(['cls-1', 'cls-2']);
  });

  it('filters null classId values from assignedClasses', () => {
    const assignments = [
      makeAssignment({ id: 'ja-1', personId: 'p-1', showId: 'show-1', classId: null }),
      makeAssignment({ id: 'ja-2', personId: 'p-1', showId: 'show-1', classId: 'cls-1' }),
    ];

    const result = buildAssignedJudges(assignments, 'show-1', people);

    expect(result[0].assignedClasses).toEqual(['cls-1']);
  });

  it('uses confirmedAt for assignedDate, falls back to invitedAt', () => {
    const assignments = [
      makeAssignment({
        id: 'ja-1',
        personId: 'p-1',
        showId: 'show-1',
        confirmedAt: '2026-03-10T00:00:00Z',
        invitedAt: '2026-03-01T00:00:00Z',
      }),
    ];

    const result = buildAssignedJudges(assignments, 'show-1', people);

    expect(result[0].assignedDate).toBe('2026-03-10T00:00:00Z');
  });

  it('uses invitedAt when confirmedAt is null', () => {
    const assignments = [
      makeAssignment({
        id: 'ja-1',
        personId: 'p-1',
        showId: 'show-1',
        confirmedAt: null,
        invitedAt: '2026-03-01T00:00:00Z',
      }),
    ];

    const result = buildAssignedJudges(assignments, 'show-1', people);

    expect(result[0].assignedDate).toBe('2026-03-01T00:00:00Z');
  });

  it('falls back to today when both confirmedAt and invitedAt are null', () => {
    const assignments = [
      makeAssignment({
        id: 'ja-1',
        personId: 'p-1',
        showId: 'show-1',
        confirmedAt: null,
        invitedAt: null,
      }),
    ];

    const result = buildAssignedJudges(assignments, 'show-1', people);

    const today = new Date().toISOString().split('T')[0];
    expect(result[0].assignedDate).toBe(today);
  });

  it('returns empty array when no assignments match the showId', () => {
    const assignments = [makeAssignment({ id: 'ja-1', personId: 'p-1', showId: 'show-2' })];

    const result = buildAssignedJudges(assignments, 'show-1', people);

    expect(result).toEqual([]);
  });

  it('handles empty people array gracefully', () => {
    const assignments = [
      makeAssignment({ id: 'ja-1', personId: 'p-1', showId: 'show-1' }),
      makeAssignment({ id: 'ja-2', personId: 'p-2', showId: 'show-1' }),
    ];

    const result = buildAssignedJudges(assignments, 'show-1', []);

    expect(result).toHaveLength(2);
    expect(result.every(r => r.judgeName === 'Unknown Judge')).toBe(true);
  });

  it('handles multiple judges for the same show', () => {
    const assignments = [
      makeAssignment({ id: 'ja-1', personId: 'p-1', showId: 'show-1', classId: 'cls-1' }),
      makeAssignment({ id: 'ja-2', personId: 'p-2', showId: 'show-1', classId: 'cls-2' }),
    ];

    const result = buildAssignedJudges(assignments, 'show-1', people);

    expect(result).toHaveLength(2);
    expect(result.map(r => r.judgeId).sort()).toEqual(['p-1', 'p-2']);
  });
});

describe('getJudgeNameById', () => {
  const judges = [
    { judgeId: 'p-1', judgeName: 'Jane Smith' },
    { judgeId: 'p-2', judgeName: 'John Doe' },
  ];

  it('returns the judge name when id matches', () => {
    expect(getJudgeNameById(judges, 'p-1')).toBe('Jane Smith');
    expect(getJudgeNameById(judges, 'p-2')).toBe('John Doe');
  });

  it("returns undefined when id doesn't match the roster", () => {
    expect(getJudgeNameById(judges, 'p-99')).toBeUndefined();
  });

  it('returns undefined when id is undefined or empty', () => {
    expect(getJudgeNameById(judges, undefined)).toBeUndefined();
    expect(getJudgeNameById(judges, '')).toBeUndefined();
  });

  it('returns undefined for an empty judges array', () => {
    expect(getJudgeNameById([], 'p-1')).toBeUndefined();
  });

  it('works with extended judge shapes (e.g. ShowJudgeAssignment with extra fields)', () => {
    const extended = [{ judgeId: 'p-1', judgeName: 'Jane Smith', assignedClasses: ['cls-1'] }];
    expect(getJudgeNameById(extended, 'p-1')).toBe('Jane Smith');
  });

  it('lets callers attach their own fallback via ?? or ||', () => {
    // Form-state writes use 'TBD'; SelectValue children pass through undefined
    // so Radix can render the placeholder.
    expect(getJudgeNameById(judges, 'p-99') ?? 'TBD').toBe('TBD');
    expect(getJudgeNameById(judges, undefined) ?? 'TBD').toBe('TBD');
    expect(getJudgeNameById(judges, 'p-1') ?? 'TBD').toBe('Jane Smith');
  });
});
