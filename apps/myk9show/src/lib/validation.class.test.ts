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
// keeps unreadable text so the form can refuse it instead of clearing the limit.
describe('classSchemas.full durations', () => {
  const durations = classSchemas.full.pick({
    estimatedJudgingTime: true,
    timeLimit1: true,
    timeLimit2: true,
    timeLimit3: true,
  });

  it.each(['', '4:30', '05:00', '15:00'])('accepts %j', value => {
    expect(durations.safeParse({ timeLimit1: value, estimatedJudgingTime: value }).success).toBe(
      true
    );
  });

  it.each(['abc', '4:3x', '4:75', '4:30.5'])('refuses unreadable %j', value => {
    const result = durations.safeParse({ timeLimit2: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Please enter time limit 2 as minutes and seconds, like 4:30'
    );
  });
});
