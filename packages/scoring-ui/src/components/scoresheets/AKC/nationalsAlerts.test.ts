import { describe, expect, it } from 'vitest';
import { NATIONALS_SCORING } from '@myk9/core';
import { calculatePoints, nationalsAreaLimitSeconds, seedAlerts } from './nationalsAlerts';

describe('calculatePoints', () => {
  it('scores +10 per correct and -5 per incorrect alert from NATIONALS_SCORING', () => {
    expect(calculatePoints([2, 1], [1, 0])).toBe(
      3 * NATIONALS_SCORING.CORRECT_ALERT_POINTS - NATIONALS_SCORING.INCORRECT_ALERT_PENALTY
    );
  });

  it('costs each finish call error NATIONALS_SCORING.FINISH_CALL_ERROR_PENALTY', () => {
    expect(NATIONALS_SCORING.FINISH_CALL_ERROR_PENALTY).toBe(5);
    expect(calculatePoints([3], [0], 2)).toBe(20);
    expect(calculatePoints([3], [1], 1)).toBe(20);
  });

  it('never goes below zero', () => {
    expect(calculatePoints([0], [0], 3)).toBe(0);
    expect(calculatePoints(seedAlerts(5, 1), seedAlerts(5, 4), 1)).toBe(0);
  });
});

describe('nationalsAreaLimitSeconds', () => {
  it('splits the class time across the areas', () => {
    expect(nationalsAreaLimitSeconds(300, 5)).toBe(60);
    expect(nationalsAreaLimitSeconds(250, 5)).toBe(50);
  });

  it('is 0 (no limit) when the class has no time', () => {
    expect(nationalsAreaLimitSeconds(0, 5)).toBe(0);
  });
});
