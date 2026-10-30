import { describe, it, expect } from 'vitest';
import type { StatsEntry } from '@/components/analytics/analytics-utils';
import { isShowStatsAvailable } from './showResultsViews';

const entry = (resultText: string) => ({ resultText }) as StatsEntry;

describe('isShowStatsAvailable', () => {
  it('is false with no entries or only pending ones', () => {
    expect(isShowStatsAvailable(undefined)).toBe(false);
    expect(isShowStatsAvailable([])).toBe(false);
    expect(isShowStatsAvailable([entry('pending')])).toBe(false);
  });

  it('is true once any entry has a result', () => {
    expect(isShowStatsAvailable([entry('pending'), entry('Q')])).toBe(true);
  });
});
