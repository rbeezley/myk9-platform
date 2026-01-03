/**
 * Unit Tests for Class Utility Functions
 */

import { determineAreasForClass, getAreaCountForClass } from './classUtils';

describe('determineAreasForClass', () => {
  describe('Interior Master (all 3 areas)', () => {
    test('should return all areas for Interior Master', () => {
      const result = determineAreasForClass('Interior', 'Master');
      expect(result).toEqual({
        useArea1: true,
        useArea2: true,
        useArea3: true,
      });
    });

    test('should be case-insensitive', () => {
      expect(determineAreasForClass('INTERIOR', 'MASTER')).toEqual({
        useArea1: true,
        useArea2: true,
        useArea3: true,
      });

      expect(determineAreasForClass('interior', 'master')).toEqual({
        useArea1: true,
        useArea2: true,
        useArea3: true,
      });
    });
  });

  describe('Interior Excellent (areas 1 and 2)', () => {
    test('should return areas 1 and 2 for Interior Excellent', () => {
      const result = determineAreasForClass('Interior', 'Excellent');
      expect(result).toEqual({
        useArea1: true,
        useArea2: true,
        useArea3: false,
      });
    });

    test('should be case-insensitive', () => {
      expect(determineAreasForClass('INTERIOR', 'EXCELLENT')).toEqual({
        useArea1: true,
        useArea2: true,
        useArea3: false,
      });
    });
  });

  describe('Interior Novice (area 1 only)', () => {
    test('should return only area 1 for Interior Novice', () => {
      const result = determineAreasForClass('Interior', 'Novice');
      expect(result).toEqual({
        useArea1: true,
        useArea2: false,
        useArea3: false,
      });
    });
  });

  describe('Handler Discrimination Master (areas 1 and 2)', () => {
    test('should return areas 1 and 2 for Handler Discrimination Master', () => {
      const result = determineAreasForClass('Handler Discrimination', 'Master');
      expect(result).toEqual({
        useArea1: true,
        useArea2: true,
        useArea3: false,
      });
    });

    test('should be case-insensitive', () => {
      expect(determineAreasForClass('handler discrimination', 'master')).toEqual({
        useArea1: true,
        useArea2: true,
        useArea3: false,
      });
    });
  });

  describe('Handler Discrimination Excellent (area 1 only)', () => {
    test('should return only area 1 for Handler Discrimination Excellent', () => {
      const result = determineAreasForClass('Handler Discrimination', 'Excellent');
      expect(result).toEqual({
        useArea1: true,
        useArea2: false,
        useArea3: false,
      });
    });
  });

  describe('Other elements (area 1 only)', () => {
    test('should return only area 1 for Containers Novice', () => {
      expect(determineAreasForClass('Containers', 'Novice')).toEqual({
        useArea1: true,
        useArea2: false,
        useArea3: false,
      });
    });

    test('should return only area 1 for Containers Master', () => {
      expect(determineAreasForClass('Containers', 'Master')).toEqual({
        useArea1: true,
        useArea2: false,
        useArea3: false,
      });
    });

    test('should return only area 1 for Exterior Excellent', () => {
      expect(determineAreasForClass('Exterior', 'Excellent')).toEqual({
        useArea1: true,
        useArea2: false,
        useArea3: false,
      });
    });

    test('should return only area 1 for Buried Master', () => {
      expect(determineAreasForClass('Buried', 'Master')).toEqual({
        useArea1: true,
        useArea2: false,
        useArea3: false,
      });
    });
  });
});

describe('getAreaCountForClass', () => {
  test('should return 3 for Interior Master', () => {
    expect(getAreaCountForClass('Interior', 'Master')).toBe(3);
  });

  test('should return 2 for Interior Excellent', () => {
    expect(getAreaCountForClass('Interior', 'Excellent')).toBe(2);
  });

  test('should return 2 for Handler Discrimination Master', () => {
    expect(getAreaCountForClass('Handler Discrimination', 'Master')).toBe(2);
  });

  test('should return 1 for Interior Novice', () => {
    expect(getAreaCountForClass('Interior', 'Novice')).toBe(1);
  });

  test('should return 1 for Containers Novice', () => {
    expect(getAreaCountForClass('Containers', 'Novice')).toBe(1);
  });

  test('should return 1 for Containers Master', () => {
    expect(getAreaCountForClass('Containers', 'Master')).toBe(1);
  });

  test('should return 1 for Exterior Excellent', () => {
    expect(getAreaCountForClass('Exterior', 'Excellent')).toBe(1);
  });

  test('should be case-insensitive', () => {
    expect(getAreaCountForClass('INTERIOR', 'MASTER')).toBe(3);
    expect(getAreaCountForClass('interior', 'master')).toBe(3);
  });
});
