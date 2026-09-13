import { describe, expect, it } from 'vitest';
import { resolveClassJudgeName, resolveTrialJudgeName } from './classJudgeDisplay';

describe('classJudgeDisplay', () => {
  it('prefers assignment-shaped class data over legacy judge fields', () => {
    const judgeName = resolveClassJudgeName({
      id: 'class-1',
      judge: 'Legacy Judge',
      judge_assignments: [
        {
          person_id: 'judge-1',
          people: { first_name: 'Assigned', last_name: 'Judge' },
        },
      ],
    });

    expect(judgeName).toBe('Assigned Judge');
  });

  it('uses show assignedJudges by class id before stale class text', () => {
    const judgeName = resolveClassJudgeName({ id: 'class-1', judge: 'TBD' }, [
      {
        judgeId: 'judge-1',
        judgeName: 'Roster Judge',
        assignedDate: '2026-05-01',
        assignedClasses: ['class-1'],
      },
    ]);

    expect(judgeName).toBe('Roster Judge');
  });

  it('falls back to the mapped judge fields and then TBD', () => {
    expect(resolveClassJudgeName({ judgeName: 'Mapped Judge' })).toBe('Mapped Judge');
    expect(resolveClassJudgeName({ id: 'class-1' })).toBe('TBD');
  });

  it('ignores a stray judge_name key: the dropped column is not a judge source (MYK9-479)', () => {
    // A row shape that still carries the retired column (an old fixture, a stale
    // cache) must not resurrect it as the judge. The assignment graph is the
    // only source; without one the class is TBD.
    const stale = { id: 'class-1', judge_name: 'Stale Snapshot' } as Parameters<
      typeof resolveClassJudgeName
    >[0];
    expect(resolveClassJudgeName(stale)).toBe('TBD');
  });

  it('does not collapse mixed class judges into the first trial judge', () => {
    expect(
      resolveTrialJudgeName([
        { id: 'class-1', judgeName: 'One' },
        { id: 'class-2', judge: 'Two' },
      ])
    ).toBe('Multiple judges');
  });
});
