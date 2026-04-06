import { describe, it, expect } from 'vitest';
import nationalsScoring from './nationalsScoring';
import type { NationalsScore } from './nationalsScoring';

describe('nationalsScoring default implementation', () => {
  const mockScore: NationalsScore = {
    entry_id: 1,
    armband: '101',
    element_type: 'CONTAINER',
    day: 1,
    points: 10,
    time_seconds: 45,
    alerts_correct: 1,
    alerts_incorrect: 0,
    faults: 0,
    finish_call_errors: 0,
    excused: false,
    disqualified: false,
    no_time: false,
    mobile_app_lic_key: 'test-key',
  };

  it('calculatePoints always returns 0', () => {
    expect(nationalsScoring.calculatePoints(mockScore)).toBe(0);
    expect(nationalsScoring.calculatePoints({})).toBe(0);
  });

  it('submitScore resolves without error', async () => {
    await expect(nationalsScoring.submitScore(mockScore)).resolves.toBeUndefined();
  });

  it('getRankings resolves to an empty array', async () => {
    await expect(nationalsScoring.getRankings()).resolves.toEqual([]);
  });
});
