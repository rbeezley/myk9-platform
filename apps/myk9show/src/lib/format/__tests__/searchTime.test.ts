import { describe, it, expect } from 'vitest';
import { splitSecondsToCentis } from '../searchTime';

describe('splitSecondsToCentis (MYK9-1225)', () => {
  it('keeps 61.23 as 1 minute, 1 second, 23 centiseconds', () => {
    expect(splitSecondsToCentis(61.23)).toEqual({ minutes: 1, seconds: 1, centis: 23 });
  });

  it('carries a rounded-up hundredth into the second and minute', () => {
    expect(splitSecondsToCentis(59.995)).toEqual({ minutes: 1, seconds: 0, centis: 0 });
    expect(splitSecondsToCentis(119.999)).toEqual({ minutes: 2, seconds: 0, centis: 0 });
  });

  it('handles zero and whole minutes', () => {
    expect(splitSecondsToCentis(0)).toEqual({ minutes: 0, seconds: 0, centis: 0 });
    expect(splitSecondsToCentis(600)).toEqual({ minutes: 10, seconds: 0, centis: 0 });
  });
});
