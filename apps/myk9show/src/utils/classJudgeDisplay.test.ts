import { describe, expect, it } from 'vitest';
import {
  isUnsetJudgeName,
  judgeLine,
  realJudgeNameOrUndefined,
  judgeNameOrUnsetLabel,
  resolveClassJudgeName,
  resolveTrialJudgeName,
} from './classJudgeDisplay';

describe('unset judge (MYK9-1846)', () => {
  it('treats missing, blank and an old local TBD as unset', () => {
    for (const name of [undefined, null, '', '  ', 'TBD', 'Judge to be announced', 'No judge yet'])
      expect(isUnsetJudgeName(name)).toBe(true);
    expect(isUnsetJudgeName('Jane Smith')).toBe(false);
  });

  it('gives official forms a blank for any unset form, and a name otherwise', () => {
    expect(realJudgeNameOrUndefined('Judge to be announced')).toBeUndefined();
    expect(realJudgeNameOrUndefined('TBD')).toBeUndefined();
    expect(realJudgeNameOrUndefined(' Jane Smith ')).toBe('Jane Smith');
  });

  it('builds the Judge line without doubling the word', () => {
    expect(judgeLine('Jane Smith')).toBe('Judge Jane Smith');
    expect(judgeLine('Judge to be announced')).toBe('Judge to be announced');
  });

  it('labels an unset judge, with a short form for tight cells', () => {
    expect(judgeNameOrUnsetLabel('TBD')).toBe('Judge to be announced');
    expect(judgeNameOrUnsetLabel('', { compact: true })).toBe('No judge yet');
    expect(judgeNameOrUnsetLabel(' Jane Smith ')).toBe('Jane Smith');
  });

  it('resolves an old TBD class row, and a class with no judge, to the label', () => {
    expect(resolveClassJudgeName({ id: 'c1', judge: 'TBD' })).toBe('Judge to be announced');
    expect(resolveClassJudgeName({ id: 'c1', judgeName: 'TBD' })).toBe('Judge to be announced');
    expect(resolveClassJudgeName({ id: 'c1' })).toBe('Judge to be announced');
    expect(resolveTrialJudgeName([{ id: 'c1', judge: 'TBD' }])).toBe('Judge to be announced');
  });
});

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

  it('falls back to the mapped judge fields and then the unset label', () => {
    expect(resolveClassJudgeName({ judgeName: 'Mapped Judge' })).toBe('Mapped Judge');
    expect(resolveClassJudgeName({ id: 'class-1' })).toBe('Judge to be announced');
  });

  it('ignores a stray judge_name key: the dropped column is not a judge source (MYK9-479)', () => {
    // A row shape that still carries the retired column (an old fixture, a stale
    // cache) must not resurrect it as the judge. The assignment graph is the
    // only source; without one the class is TBD.
    const stale = { id: 'class-1', judge_name: 'Stale Snapshot' } as Parameters<
      typeof resolveClassJudgeName
    >[0];
    expect(resolveClassJudgeName(stale)).toBe('Judge to be announced');
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
