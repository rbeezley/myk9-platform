import { describe, expect, it } from 'vitest';
import { describeScoreFields } from './unsentScoreDetails';

describe('describeScoreFields (MYK9-2068)', () => {
  it('lists the fifth area and the element time', () => {
    const { scoreRows } = describeScoreFields({
      result_status: 'qualified',
      search_time_seconds: 150,
      area1_time_seconds: 10,
      area2_time_seconds: 20,
      area3_time_seconds: 30,
      area4_time_seconds: 40,
      area5_time_seconds: 50,
      element_time_seconds: 185.5,
    });
    expect(scoreRows.map(r => r.label)).toEqual(expect.arrayContaining(['Area 5', 'Element time']));
    expect(scoreRows.find(r => r.label === 'Element time')?.value).toBe('3:05.50');
  });
});
