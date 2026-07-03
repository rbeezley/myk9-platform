import { describe, expect, it } from 'vitest';
import { resolveClassJudgeName, resolveTrialJudgeName } from './classJudgeDisplay';

describe('classJudgeDisplay', () => {
  it('prefers assignment-shaped class data over legacy judge fields', () => {
    const judgeName = resolveClassJudgeName({
      id: 'class-1',
      judge_name: 'Legacy Judge',
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
    const judgeName = resolveClassJudgeName(
      { id: 'class-1', judge: 'TBD' },
      [
        {
          judgeId: 'judge-1',
          judgeName: 'Roster Judge',
          assignedDate: '2026-05-01',
          assignedClasses: ['class-1'],
        },
      ]
    );

    expect(judgeName).toBe('Roster Judge');
  });

  it('falls back to legacy judge_name and then TBD', () => {
    expect(resolveClassJudgeName({ judge_name: 'Legacy Judge' })).toBe('Legacy Judge');
    expect(resolveClassJudgeName({ id: 'class-1' })).toBe('TBD');
  });

  it('does not collapse mixed class judges into the first trial judge', () => {
    expect(
      resolveTrialJudgeName([{ id: 'class-1', judge_name: 'One' }, { id: 'class-2', judge: 'Two' }])
    ).toBe('Multiple judges');
  });
});
