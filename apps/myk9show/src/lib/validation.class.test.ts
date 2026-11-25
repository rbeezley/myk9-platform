import { describe, expect, it } from 'vitest';
import { classSchemas } from './validation';

describe('classSchemas.simple', () => {
  it('allows post-create classes to be saved before a judge is assigned', () => {
    const result = classSchemas.simple.safeParse({
      element: 'Containers',
      level: 'Novice',
      section: 'A',
      judgeId: '',
      judgeName: '',
      status: 'Upcoming',
      entries: 0,
    });

    expect(result.success).toBe(true);
  });
});

// MYK9-1503: class durations are typed through the shared time field, which
// keeps unreadable text, and warns about a readable time outside the editor's
// range; the schema refuses both so neither clears or oversets a limit.
describe('classSchemas.full durations', () => {
  const base = { element: 'Interior', level: 'Novice', section: 'A', status: 'Scheduled' };
  const check = (extra: Record<string, string>) =>
    classSchemas.full.safeParse({ ...base, ...extra });
  const messages = (extra: Record<string, string>) =>
    check(extra).error?.issues.map(issue => issue.message) ?? [];

  it.each(['', '4:30', '05:00', '9:59'])('accepts %j', value => {
    expect(check({ timeLimit1: value, estimatedJudgingTime: value }).success).toBe(true);
  });

  it.each(['abc', '4:3x', '4:75', '4:30.5'])('refuses unreadable %j', value => {
    expect(messages({ timeLimit2: value })).toEqual([
      'Please enter time limit 2 as minutes and seconds, like 4:30',
    ]);
  });

  it('refuses a readable time outside the range, per field', () => {
    expect(messages({ timeLimit3: '12:00' })).toEqual([
      'Time limit 3 must be between 0:01 and 9:59',
    ]);
    expect(messages({ estimatedJudgingTime: '10:00' })).toEqual([
      'The estimated judging time must be between 0:01 and 9:59',
    ]);
  });

  it('lets Detective run to 15:00 and no further', () => {
    expect(check({ element: 'Detective', timeLimit1: '15:00' }).success).toBe(true);
    expect(messages({ element: 'Detective', timeLimit1: '15:01' })).toEqual([
      'Time limit 1 must be between 0:01 and 15:00',
    ]);
  });
});
