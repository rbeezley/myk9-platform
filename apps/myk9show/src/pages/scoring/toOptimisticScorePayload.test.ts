import { describe, it, expect } from 'vitest';
import type { ScoreData } from '@myk9/scoring-ui';
import { toOptimisticScorePayload } from './types';

function scoreData(overrides: Partial<ScoreData> = {}): ScoreData {
  return {
    resultText: 'Qualified',
    searchTime: '1:00.00',
    areas: {},
    areaTimes: [],
    correctCount: 0,
    incorrectCount: 0,
    faultCount: 0,
    finishCallErrors: 0,
    points: 0,
    ...overrides,
  };
}

describe('toOptimisticScorePayload — zero detail preservation', () => {
  // Stripping zeros made a rescore N→0 omit the field, leaving the cached value
  // to re-upload stale. The count/point fields must carry their actual value.
  it('preserves explicit 0 counts/points instead of stripping them', () => {
    const payload = toOptimisticScorePayload(
      scoreData({ correctCount: 0, incorrectCount: 0, finishCallErrors: 0, points: 0 })
    );

    expect(payload.correctCount).toBe(0);
    expect(payload.incorrectCount).toBe(0);
    expect(payload.finishCallErrors).toBe(0);
    expect(payload.points).toBe(0);
  });

  it('still carries nonzero counts/points', () => {
    const payload = toOptimisticScorePayload(
      scoreData({ correctCount: 3, incorrectCount: 1, finishCallErrors: 2, points: 95 })
    );

    expect(payload.correctCount).toBe(3);
    expect(payload.incorrectCount).toBe(1);
    expect(payload.finishCallErrors).toBe(2);
    expect(payload.points).toBe(95);
  });
});
