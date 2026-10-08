import { describe, expect, it } from 'vitest';

import {
  formatJudgeDayDate,
  groupClassesByJudgeDay,
  judgeDayKey,
  openJudgeDayKeys,
} from '../judgeDay';

describe("judge's day grouping (MYK9-1030)", () => {
  it('keys on the judge and the date, never the trial', () => {
    expect(judgeDayKey({ id: 'c1', judgeId: 'jane', trialDate: '2026-10-10' })).toBe(
      judgeDayKey({ id: 'c2', judgeId: 'jane', trialDate: '2026-10-10' })
    );
    expect(judgeDayKey({ id: 'c1', judgeId: 'jane', trialDate: '2026-10-10' })).not.toBe(
      judgeDayKey({ id: 'c3', judgeId: 'jane', trialDate: '2026-10-11' })
    );
  });

  it('falls back to the name, and gives a judgeless class a day of its own', () => {
    expect(judgeDayKey({ id: 'a', judgeName: 'Jane Smith ', trialDate: '2026-10-10' })).toBe(
      judgeDayKey({ id: 'b', judgeName: 'jane smith', trialDate: '2026-10-10' })
    );
    expect(judgeDayKey({ id: 'a', trialDate: '2026-10-10' })).toBe('class:a');
    expect(judgeDayKey({ id: 'a', judgeId: 'jane' })).toBe('class:a');
  });

  it('groups classes in input order with the judge and date', () => {
    const days = groupClassesByJudgeDay([
      { id: 'c1', judgeId: 'jane', judgeName: 'Jane Smith', trialDate: '2026-10-10' },
      { id: 'c2', judgeId: 'raj', judgeName: 'Raj Patel', trialDate: '2026-10-10' },
      { id: 'c3', judgeId: 'jane', judgeName: 'Jane Smith', trialDate: '2026-10-10' },
    ]);
    expect([...days.values()]).toEqual([
      {
        key: 'judge:jane|2026-10-10',
        judgeId: 'jane',
        judgeName: 'Jane Smith',
        date: '2026-10-10',
        classIds: ['c1', 'c3'],
      },
      {
        key: 'judge:raj|2026-10-10',
        judgeId: 'raj',
        judgeName: 'Raj Patel',
        date: '2026-10-10',
        classIds: ['c2'],
      },
    ]);
  });

  it('marks a day open while any of its classes is unfinished', () => {
    const open = openJudgeDayKeys([
      { id: 'c1', judgeId: 'jane', trialDate: '2026-10-10', finished: true },
      { id: 'c2', judgeId: 'jane', trialDate: '2026-10-10', finished: false },
      { id: 'c3', judgeId: 'raj', trialDate: '2026-10-10', finished: true },
    ]);
    expect([...open]).toEqual(['judge:jane|2026-10-10']);
  });

  it('names the day without the year', () => {
    expect(formatJudgeDayDate('2026-10-10')).toBe('Sat, Oct 10');
    expect(formatJudgeDayDate(undefined)).toBe('');
  });
});
