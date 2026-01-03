/**
 * Unit Tests for Transformation Utility Functions
 */

import { convertResultTextToStatus } from './transformationUtils';

describe('convertResultTextToStatus', () => {
  describe('Qualified conversions', () => {
    test('should convert "Qualified" to "qualified"', () => {
      expect(convertResultTextToStatus('Qualified')).toBe('qualified');
    });

    test('should convert "Q" to "qualified"', () => {
      expect(convertResultTextToStatus('Q')).toBe('qualified');
    });
  });

  describe('Not Qualified conversions', () => {
    test('should convert "Not Qualified" to "nq"', () => {
      expect(convertResultTextToStatus('Not Qualified')).toBe('nq');
    });

    test('should convert "NQ" to "nq"', () => {
      expect(convertResultTextToStatus('NQ')).toBe('nq');
    });
  });

  describe('Absent conversions', () => {
    test('should convert "Absent" to "absent"', () => {
      expect(convertResultTextToStatus('Absent')).toBe('absent');
    });

    test('should convert "ABS" to "absent"', () => {
      expect(convertResultTextToStatus('ABS')).toBe('absent');
    });
  });

  describe('Excused conversions', () => {
    test('should convert "Excused" to "excused"', () => {
      expect(convertResultTextToStatus('Excused')).toBe('excused');
    });

    test('should convert "EX" to "excused"', () => {
      expect(convertResultTextToStatus('EX')).toBe('excused');
    });
  });

  describe('Withdrawn conversions', () => {
    test('should convert "Withdrawn" to "withdrawn"', () => {
      expect(convertResultTextToStatus('Withdrawn')).toBe('withdrawn');
    });

    test('should convert "WD" to "withdrawn"', () => {
      expect(convertResultTextToStatus('WD')).toBe('withdrawn');
    });
  });

  describe('Edge cases and invalid inputs', () => {
    test('should return "pending" for empty string', () => {
      expect(convertResultTextToStatus('')).toBe('pending');
    });

    test('should return "pending" for invalid text', () => {
      expect(convertResultTextToStatus('Invalid')).toBe('pending');
      expect(convertResultTextToStatus('Unknown')).toBe('pending');
      expect(convertResultTextToStatus('random text')).toBe('pending');
    });

    test('should handle whitespace properly', () => {
      expect(convertResultTextToStatus('  Qualified  ')).toBe('qualified');
      expect(convertResultTextToStatus('  Q  ')).toBe('qualified');
      expect(convertResultTextToStatus(' NQ ')).toBe('nq');
    });

    test('should return "pending" for null/undefined-like strings', () => {
      // If the function receives these as strings (edge case)
      expect(convertResultTextToStatus('null')).toBe('pending');
      expect(convertResultTextToStatus('undefined')).toBe('pending');
    });
  });

  describe('Case sensitivity', () => {
    test('should be case-sensitive (exact match required)', () => {
      // These should not match because function expects exact casing
      expect(convertResultTextToStatus('qualified')).toBe('pending');
      expect(convertResultTextToStatus('QUALIFIED')).toBe('pending');
      expect(convertResultTextToStatus('q')).toBe('pending');
      expect(convertResultTextToStatus('nq')).toBe('pending');
    });

    test('should only match exact case as defined', () => {
      // Confirm the exact cases that work
      expect(convertResultTextToStatus('Qualified')).toBe('qualified');
      expect(convertResultTextToStatus('Q')).toBe('qualified');
      expect(convertResultTextToStatus('NQ')).toBe('nq');
    });
  });
});
