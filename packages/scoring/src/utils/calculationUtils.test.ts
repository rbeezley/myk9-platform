import { describe, it, expect } from 'vitest';
import {
  calculateTotalAreaTime,
  formatTimeDisplay,
  formatSecondsDisplay,
  calculateRemainingTime,
  calculateFastCatMph,
  calculateNationalsPoints,
} from './calculationUtils';

describe('calculationUtils', () => {
  describe('calculateTotalAreaTime', () => {
    it('should sum all three areas', () => {
      expect(calculateTotalAreaTime(45, 52, 38)).toBe(135);
    });

    it('should sum two areas when third is undefined', () => {
      expect(calculateTotalAreaTime(45, 52, undefined)).toBe(97);
    });

    it('should return single area time when others are undefined', () => {
      expect(calculateTotalAreaTime(45, undefined, undefined)).toBe(45);
    });

    it('should handle null values', () => {
      expect(calculateTotalAreaTime(45, null, null)).toBe(45);
    });

    it('should return 0 when all areas are undefined', () => {
      expect(calculateTotalAreaTime(undefined, undefined, undefined)).toBe(0);
    });

    it('should return 0 when all areas are null', () => {
      expect(calculateTotalAreaTime(null, null, null)).toBe(0);
    });

    it('should return 0 when called with no arguments', () => {
      expect(calculateTotalAreaTime()).toBe(0);
    });
  });

  describe('formatTimeDisplay', () => {
    it('should format zero milliseconds', () => {
      expect(formatTimeDisplay(0)).toBe('00:00.00');
    });

    it('should format 5 seconds', () => {
      expect(formatTimeDisplay(5000)).toBe('00:05.00');
    });

    it('should format minutes and seconds with hundredths', () => {
      expect(formatTimeDisplay(83450)).toBe('01:23.45');
    });

    it('should format large values correctly', () => {
      expect(formatTimeDisplay(600000)).toBe('10:00.00');
    });

    it('should handle fractional milliseconds by flooring', () => {
      // 1234ms = 1.234s => 00:01.23
      expect(formatTimeDisplay(1234)).toBe('00:01.23');
    });
  });

  describe('formatSecondsDisplay', () => {
    it('should format 0 seconds', () => {
      expect(formatSecondsDisplay(0)).toBe('0:00');
    });

    it('should format 5 seconds', () => {
      expect(formatSecondsDisplay(5)).toBe('0:05');
    });

    it('should format 83 seconds as 1:23', () => {
      expect(formatSecondsDisplay(83)).toBe('1:23');
    });

    it('should format 125 seconds as 2:05', () => {
      expect(formatSecondsDisplay(125)).toBe('2:05');
    });

    it('should format 60 seconds as 1:00', () => {
      expect(formatSecondsDisplay(60)).toBe('1:00');
    });
  });

  describe('calculateRemainingTime', () => {
    it('should return remaining time when not expired', () => {
      expect(calculateRemainingTime(30000, 180000)).toBe(150000);
    });

    it('should return 0 when exactly at max time', () => {
      expect(calculateRemainingTime(180000, 180000)).toBe(0);
    });

    it('should return 0 when past max time', () => {
      expect(calculateRemainingTime(200000, 180000)).toBe(0);
    });

    it('should return full time when elapsed is 0', () => {
      expect(calculateRemainingTime(0, 180000)).toBe(180000);
    });
  });

  describe('calculateFastCatMph', () => {
    it('should calculate speed for standard 100-yard course', () => {
      const mph = calculateFastCatMph(10, 100);
      // 100 yards / 10 seconds = 100 * 3600 / (10 * 1760) = 360000 / 17600 ≈ 20.4545
      expect(mph).toBeCloseTo(20.4545, 2);
    });

    it('should calculate faster speed', () => {
      const mph = calculateFastCatMph(6.5, 100);
      // 100 * 3600 / (6.5 * 1760) = 360000 / 11440 ≈ 31.4685
      expect(mph).toBeCloseTo(31.4685, 2);
    });

    it('should return 0 for zero time', () => {
      expect(calculateFastCatMph(0, 100)).toBe(0);
    });

    it('should return 0 for negative time', () => {
      expect(calculateFastCatMph(-5, 100)).toBe(0);
    });

    it('should use default course length of 100', () => {
      const mph = calculateFastCatMph(10);
      expect(mph).toBeCloseTo(20.4545, 2);
    });
  });

  describe('calculateNationalsPoints', () => {
    it('should calculate points with only correct alerts', () => {
      expect(calculateNationalsPoints(5, 0, 0, 0)).toBe(50);
    });

    it('should deduct for incorrect alerts', () => {
      // (5 * 10) - (1 * 5) = 45
      expect(calculateNationalsPoints(5, 1, 0, 0)).toBe(45);
    });

    it('should deduct for faults and no-finish', () => {
      // (3 * 10) - (0 * 5) - (1 * 5) - (1 * 5) = 20
      expect(calculateNationalsPoints(3, 0, 1, 1)).toBe(20);
    });

    it('should handle all deductions combined', () => {
      // (5 * 10) - (2 * 5) - (1 * 5) - (1 * 5) = 50 - 10 - 5 - 5 = 30
      expect(calculateNationalsPoints(5, 2, 1, 1)).toBe(30);
    });

    it('should allow negative points', () => {
      // (0 * 10) - (3 * 5) = -15
      expect(calculateNationalsPoints(0, 3, 0, 0)).toBe(-15);
    });

    it('should return 0 for zero everything', () => {
      expect(calculateNationalsPoints(0, 0, 0, 0)).toBe(0);
    });
  });
});
