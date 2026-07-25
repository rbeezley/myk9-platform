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
