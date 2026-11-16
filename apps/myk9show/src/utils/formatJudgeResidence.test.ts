import { describe, expect, it } from 'vitest';
import { formatJudgeResidence } from './formatJudgeResidence';

describe('formatJudgeResidence', () => {
  it('joins city and state as "City, ST"', () => {
    expect(formatJudgeResidence('Springfield', 'IL')).toBe('Springfield, IL');
  });

  it('trims both parts', () => {
    expect(formatJudgeResidence('  Springfield ', ' IL ')).toBe('Springfield, IL');
  });

  it('prints the city alone when there is no state, with no stray comma', () => {
    expect(formatJudgeResidence('Springfield', null)).toBe('Springfield');
    expect(formatJudgeResidence('Springfield', '  ')).toBe('Springfield');
  });

  it('prints nothing when there is no city, even with a state', () => {
    expect(formatJudgeResidence(null, 'IL')).toBeNull();
    expect(formatJudgeResidence('', 'IL')).toBeNull();
    expect(formatJudgeResidence(undefined, undefined)).toBeNull();
  });
});
