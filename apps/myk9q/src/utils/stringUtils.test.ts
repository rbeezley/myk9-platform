/**
 * Unit Tests for String Utility Functions
 */

import { buildClassName } from './stringUtils';

describe('buildClassName', () => {
  test('should build class name with all components', () => {
    expect(buildClassName('Containers', 'Novice', 'A')).toBe('Containers Novice A');
    expect(buildClassName('Interior', 'Excellent', 'B')).toBe('Interior Excellent B');
    expect(buildClassName('Handler Discrimination', 'Master', 'C')).toBe('Handler Discrimination Master C');
  });

  test('should build class name without section', () => {
    expect(buildClassName('Containers', 'Novice', null)).toBe('Containers Novice');
    expect(buildClassName('Interior', 'Master', undefined)).toBe('Interior Master');
    expect(buildClassName('Buried', 'Excellent')).toBe('Buried Excellent');
  });

  test('should ignore placeholder section ("-")', () => {
    expect(buildClassName('Containers', 'Novice', '-')).toBe('Containers Novice');
    expect(buildClassName('Interior', 'Master', '-')).toBe('Interior Master');
  });

  test('should handle empty string section', () => {
    expect(buildClassName('Containers', 'Novice', '')).toBe('Containers Novice');
  });

  test('should preserve exact casing of inputs', () => {
    expect(buildClassName('CONTAINERS', 'NOVICE', 'A')).toBe('CONTAINERS NOVICE A');
    expect(buildClassName('containers', 'novice', 'a')).toBe('containers novice a');
  });

  test('should handle multi-word elements', () => {
    expect(buildClassName('Handler Discrimination', 'Master', 'A')).toBe('Handler Discrimination Master A');
    expect(buildClassName('Exterior/Containers', 'Novice', 'B')).toBe('Exterior/Containers Novice B');
  });

  test('should handle single character sections', () => {
    expect(buildClassName('Interior', 'Novice', 'A')).toBe('Interior Novice A');
    expect(buildClassName('Interior', 'Novice', 'B')).toBe('Interior Novice B');
    expect(buildClassName('Interior', 'Novice', 'C')).toBe('Interior Novice C');
  });

  test('should handle multi-character sections', () => {
    expect(buildClassName('Interior', 'Novice', 'A1')).toBe('Interior Novice A1');
    expect(buildClassName('Interior', 'Novice', 'Group1')).toBe('Interior Novice Group1');
  });

  test('should handle whitespace in components', () => {
    expect(buildClassName('  Interior  ', '  Master  ', '  A  ')).toBe('  Interior     Master     A  ');
  });
});
