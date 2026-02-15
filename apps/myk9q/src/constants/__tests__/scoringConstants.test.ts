/**
 * Scoring Constants Tests
 *
 * These tests verify that scoring constants are:
 * 1. Defined with expected values
 * 2. Consistent with business rules
 * 3. Acting as documentation for the scoring formulas
 */

import { describe, it, expect } from 'vitest';
import { NATIONALS_SCORING, NATIONALS_VALIDATION } from '@myk9/core';
import { FASTCAT_COURSE, FASTCAT_HANDICAP, getHandicapMultiplier, getHeightCategory, calculateFastCatMph, calculateFastCatPoints } from '../fastcatConstants';

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
  });

  describe('FASTCAT_HANDICAP', () => {
    it('should define three height categories with correct multipliers', () => {
      expect(FASTCAT_HANDICAP.tall.multiplier).toBe(1.0);
      expect(FASTCAT_HANDICAP.medium.multiplier).toBe(1.5);
      expect(FASTCAT_HANDICAP.small.multiplier).toBe(2.0);
    });

    it('should have correct height thresholds', () => {
      expect(FASTCAT_HANDICAP.tall.minHeight).toBe(18);
      expect(FASTCAT_HANDICAP.medium.minHeight).toBe(12);
      expect(FASTCAT_HANDICAP.medium.maxHeight).toBe(18);
      expect(FASTCAT_HANDICAP.small.minHeight).toBe(0);
      expect(FASTCAT_HANDICAP.small.maxHeight).toBe(12);
    });
  });

  describe('getHandicapMultiplier', () => {
    it('should return 2.0 for dogs under 12 inches', () => {
      expect(getHandicapMultiplier(8)).toBe(2.0);
      expect(getHandicapMultiplier(11.9)).toBe(2.0);
    });

    it('should return 1.5 for dogs 12 to under 18 inches', () => {
      expect(getHandicapMultiplier(12)).toBe(1.5);
      expect(getHandicapMultiplier(15)).toBe(1.5);
      expect(getHandicapMultiplier(17.9)).toBe(1.5);
    });

    it('should return 1.0 for dogs 18 inches and over', () => {
      expect(getHandicapMultiplier(18)).toBe(1.0);
      expect(getHandicapMultiplier(24)).toBe(1.0);
    });

    it('should return 1.0 when height is not provided', () => {
      expect(getHandicapMultiplier(null)).toBe(1.0);
      expect(getHandicapMultiplier(undefined)).toBe(1.0);
    });
  });

  describe('getHeightCategory', () => {
    it('should categorize heights correctly', () => {
      expect(getHeightCategory(8)).toBe('small');
      expect(getHeightCategory(12)).toBe('medium');
      expect(getHeightCategory(18)).toBe('tall');
    });
  });

  describe('calculateFastCatMph', () => {
    it('should calculate expected MPH for a 10-second run', () => {
      // 100 * 3600 / (10 * 1760) = 360000 / 17600 = 20.45 MPH
      expect(calculateFastCatMph(10)).toBeCloseTo(20.45, 2);
    });

    it('should return 0 for zero or negative time', () => {
      expect(calculateFastCatMph(0)).toBe(0);
      expect(calculateFastCatMph(-5)).toBe(0);
    });
  });

  describe('calculateFastCatPoints', () => {
    it('should apply handicap multiplier based on height', () => {
      const timeInSeconds = 10; // ~20.45 MPH

      // Tall dog (1.0x): round(20.45 * 1.0) = 20
      expect(calculateFastCatPoints(timeInSeconds, 20)).toBe(20);

      // Medium dog (1.5x): round(20.45 * 1.5) = 31
      expect(calculateFastCatPoints(timeInSeconds, 15)).toBe(31);

      // Small dog (2.0x): round(20.45 * 2.0) = 41
      expect(calculateFastCatPoints(timeInSeconds, 8)).toBe(41);
    });

    it('should default to 1.0 multiplier when height not provided', () => {
      // ~20.45 MPH * 1.0 = 20 points
      expect(calculateFastCatPoints(10)).toBe(20);
    });
  });
});
