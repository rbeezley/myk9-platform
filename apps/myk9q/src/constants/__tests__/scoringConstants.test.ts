/**
 * Scoring Constants Tests
 *
 * These tests verify that scoring constants are:
 * 1. Defined with expected values
 * 2. Consistent with business rules
 * 3. Acting as documentation for the scoring formulas
 */

import { describe, it, expect } from 'vitest';
import { NATIONALS_SCORING, NATIONALS_VALIDATION } from '../nationalsConstants';
import { FASTCAT_COURSE } from '../fastcatConstants';

describe('Nationals Scoring Constants', () => {
  describe('NATIONALS_SCORING', () => {
    it('should have correct point values for alerts', () => {
      expect(NATIONALS_SCORING.CORRECT_ALERT_POINTS).toBe(10);
      expect(NATIONALS_SCORING.INCORRECT_ALERT_PENALTY).toBe(5);
    });

    it('should have correct penalty values', () => {
      expect(NATIONALS_SCORING.FAULT_PENALTY).toBe(2);
      expect(NATIONALS_SCORING.FINISH_CALL_ERROR_PENALTY).toBe(5);
    });

    it('should have correct excused dog values', () => {
      expect(NATIONALS_SCORING.EXCUSED_DOG_POINTS).toBe(0);
      expect(NATIONALS_SCORING.MAX_TIME_SECONDS).toBe(120);
    });

    it('should have correct qualification threshold', () => {
      expect(NATIONALS_SCORING.TOP_QUALIFIERS_COUNT).toBe(100);
    });

    it('should calculate expected points for a perfect run', () => {
      // 10 correct alerts, no penalties
      const perfectPoints =
        10 * NATIONALS_SCORING.CORRECT_ALERT_POINTS -
        0 * NATIONALS_SCORING.INCORRECT_ALERT_PENALTY -
        0 * NATIONALS_SCORING.FAULT_PENALTY -
        0 * NATIONALS_SCORING.FINISH_CALL_ERROR_PENALTY;

      expect(perfectPoints).toBe(100);
    });

    it('should calculate expected points with penalties', () => {
      // 8 correct, 1 incorrect, 2 faults, 1 finish error
      const pointsWithPenalties =
        8 * NATIONALS_SCORING.CORRECT_ALERT_POINTS -
        1 * NATIONALS_SCORING.INCORRECT_ALERT_PENALTY -
        2 * NATIONALS_SCORING.FAULT_PENALTY -
        1 * NATIONALS_SCORING.FINISH_CALL_ERROR_PENALTY;

      // 80 - 5 - 4 - 5 = 66
      expect(pointsWithPenalties).toBe(66);
    });
  });

  describe('NATIONALS_VALIDATION', () => {
    it('should have correct alert ranges', () => {
      expect(NATIONALS_VALIDATION.ALERTS_CORRECT_MIN).toBe(0);
      expect(NATIONALS_VALIDATION.ALERTS_CORRECT_MAX).toBe(10);
      expect(NATIONALS_VALIDATION.ALERTS_INCORRECT_MIN).toBe(0);
      expect(NATIONALS_VALIDATION.ALERTS_INCORRECT_MAX).toBe(10);
    });

    it('should have correct fault range', () => {
      expect(NATIONALS_VALIDATION.FAULTS_MIN).toBe(0);
      expect(NATIONALS_VALIDATION.FAULTS_MAX).toBe(20);
    });

    it('should have correct finish call error range', () => {
      expect(NATIONALS_VALIDATION.FINISH_CALL_ERRORS_MIN).toBe(0);
      expect(NATIONALS_VALIDATION.FINISH_CALL_ERRORS_MAX).toBe(10);
    });

    it('should have correct time range', () => {
      expect(NATIONALS_VALIDATION.TIME_MIN).toBe(0);
      expect(NATIONALS_VALIDATION.TIME_MAX).toBe(120);
    });
  });
});

describe('FastCAT Course Constants', () => {
  describe('FASTCAT_COURSE', () => {
    it('should have correct course length', () => {
      expect(FASTCAT_COURSE.LENGTH_YARDS).toBe(100);
    });

    it('should have correct conversion constants', () => {
      expect(FASTCAT_COURSE.YARDS_PER_MILE).toBe(1760);
      expect(FASTCAT_COURSE.SECONDS_PER_HOUR).toBe(3600);
    });

    it('should have a points multiplier', () => {
      expect(FASTCAT_COURSE.POINTS_MULTIPLIER).toBe(2);
    });

    it('should calculate expected MPH for a 10-second run', () => {
      const timeInSeconds = 10;
      const mph =
        (FASTCAT_COURSE.LENGTH_YARDS * FASTCAT_COURSE.SECONDS_PER_HOUR) /
        (timeInSeconds * FASTCAT_COURSE.YARDS_PER_MILE);

      // 100 * 3600 / (10 * 1760) = 360000 / 17600 = 20.45 MPH
      expect(mph).toBeCloseTo(20.45, 2);
    });

    it('should calculate expected points for a 20 MPH run', () => {
      const mph = 20;
      const points = Math.round(mph * FASTCAT_COURSE.POINTS_MULTIPLIER);

      expect(points).toBe(40);
    });
  });
});
