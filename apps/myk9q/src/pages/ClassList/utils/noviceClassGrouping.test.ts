/**
 * Unit Tests for Sectioned Class Grouping Utilities
 */

import {
  findPairedNoviceClass,
  findPairedSectionedClass,
  groupNoviceClasses,
  groupSectionedClasses,
  isCombinedNoviceEntry,
  isCombinedEntry,
  getClassIds,
  shouldCombineAllSections
} from './noviceClassGrouping';

const createMockClass = (overrides: any = {}) => ({
  id: 1,
  class_name: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  entry_count: 5,
  completed_count: 0,
  dogs: [],
  is_favorite: false,
  ...overrides
});

describe('findPairedNoviceClass', () => {
  test('should find matching Novice B for Novice A', () => {
    const classA = createMockClass({ id: 1, section: 'A' });
    const classB = createMockClass({ id: 2, section: 'B' });
    const classes = [classA, classB];

    const result = findPairedNoviceClass(classA, classes);
    expect(result).toEqual(classB);
  });

  test('should return null if no pair exists', () => {
    const classA = createMockClass({ id: 1, section: 'A' });
    const classes = [classA];

    const result = findPairedNoviceClass(classA, classes);
    expect(result).toBeNull();
  });

  test('should not pair different elements', () => {
    const classA = createMockClass({ id: 1, element: 'Container', section: 'A' });
    const classB = createMockClass({ id: 2, element: 'Exterior', section: 'B' });
    const classes = [classA, classB];

    const result = findPairedNoviceClass(classA, classes);
    expect(result).toBeNull();
  });
});

describe('groupNoviceClasses', () => {
  test('should combine Novice A and B classes', () => {
    const classA = createMockClass({ id: 1, section: 'A', entry_count: 5 });
    const classB = createMockClass({ id: 2, section: 'B', entry_count: 3 });
    const classes = [classA, classB];

    const result = groupNoviceClasses(classes);

    expect(result).toHaveLength(1);
    expect(result[0].section).toBe('A & B');
    expect(result[0].entry_count).toBe(8); // 5 + 3
  });

  test('should keep unpaired classes as-is', () => {
    const classA = createMockClass({ id: 1, section: 'A' });
    const classes = [classA];

    const result = groupNoviceClasses(classes);

    expect(result).toHaveLength(1);
    expect(result[0].section).toBe('A');
  });

  test('should not group non-Novice classes', () => {
    const classAdvanced = createMockClass({
      id: 1,
      level: 'Advanced',
      section: 'A'
    });
    const classes = [classAdvanced];

    const result = groupNoviceClasses(classes);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(classAdvanced);
  });
});

describe('isCombinedNoviceEntry', () => {
  test('should identify combined entries', () => {
    const combined = createMockClass({ section: 'A & B', pairedClassId: 2 });
    expect(isCombinedNoviceEntry(combined)).toBe(true);
  });

  test('should return false for single sections', () => {
    const single = createMockClass({ section: 'A' });
    expect(isCombinedNoviceEntry(single)).toBe(false);
  });

  test('should return false if section is A & B but no pairedClassId', () => {
    const incompleteCombined = createMockClass({ section: 'A & B' });
    expect(isCombinedNoviceEntry(incompleteCombined)).toBe(false);
  });
});

describe('getClassIds', () => {
  test('should return single ID for regular class', () => {
    const regularClass = createMockClass({ id: 1, section: 'A' });
    const ids = getClassIds(regularClass);

    expect(ids).toEqual([1]);
  });

  test('should return both IDs for combined class', () => {
    const combined = createMockClass({
      id: 1,
      section: 'A & B',
      pairedClassId: 2
    });
    const ids = getClassIds(combined);

    expect(ids).toEqual([1, 2]);
  });
});

// =============================================================================
// NEW: Tests for organization-aware sectioned class grouping
// =============================================================================

describe('shouldCombineAllSections', () => {
  test('should return true for UKC Nosework', () => {
    expect(shouldCombineAllSections('UKC Nosework')).toBe(true);
    expect(shouldCombineAllSections('ukc nosework')).toBe(true);
    expect(shouldCombineAllSections('UKC NOSEWORK')).toBe(true);
  });

  test('should return false for AKC', () => {
    expect(shouldCombineAllSections('AKC Scent Work')).toBe(false);
    expect(shouldCombineAllSections('AKC ScentWork')).toBe(false);
  });

  test('should return false for undefined/empty', () => {
    expect(shouldCombineAllSections(undefined)).toBe(false);
    expect(shouldCombineAllSections('')).toBe(false);
  });

  test('should return false for other UKC events without Nosework', () => {
    expect(shouldCombineAllSections('UKC Rally')).toBe(false);
    expect(shouldCombineAllSections('UKC Obedience')).toBe(false);
  });
});

describe('findPairedSectionedClass', () => {
  test('should pair Advanced classes for UKC Nosework', () => {
    const classA = createMockClass({ id: 1, level: 'Advanced', section: 'A' });
    const classB = createMockClass({ id: 2, level: 'Advanced', section: 'B' });
    const classes = [classA, classB];

    const result = findPairedSectionedClass(classA, classes, 'UKC Nosework');
    expect(result).toEqual(classB);
  });

  test('should pair Master classes for UKC Nosework', () => {
    const classA = createMockClass({ id: 1, level: 'Master', section: 'A' });
    const classB = createMockClass({ id: 2, level: 'Master', section: 'B' });
    const classes = [classA, classB];

    const result = findPairedSectionedClass(classA, classes, 'UKC Nosework');
    expect(result).toEqual(classB);
  });

  test('should NOT pair Advanced classes for AKC', () => {
    const classA = createMockClass({ id: 1, level: 'Advanced', section: 'A' });
    const classB = createMockClass({ id: 2, level: 'Advanced', section: 'B' });
    const classes = [classA, classB];

    const result = findPairedSectionedClass(classA, classes, 'AKC Scent Work');
    expect(result).toBeNull();
  });

  test('should still pair Novice classes for AKC', () => {
    const classA = createMockClass({ id: 1, level: 'Novice', section: 'A' });
    const classB = createMockClass({ id: 2, level: 'Novice', section: 'B' });
    const classes = [classA, classB];

    const result = findPairedSectionedClass(classA, classes, 'AKC Scent Work');
    expect(result).toEqual(classB);
  });

  test('should return null for classes without A/B sections', () => {
    const classNoSection = createMockClass({ id: 1, level: 'Advanced', section: '-' });
    const classes = [classNoSection];

    const result = findPairedSectionedClass(classNoSection, classes, 'UKC Nosework');
    expect(result).toBeNull();
  });
});

describe('groupSectionedClasses', () => {
  test('should combine all levels for UKC Nosework', () => {
    const noviceA = createMockClass({ id: 1, level: 'Novice', section: 'A', entry_count: 5 });
    const noviceB = createMockClass({ id: 2, level: 'Novice', section: 'B', entry_count: 3 });
    const advancedA = createMockClass({ id: 3, level: 'Advanced', section: 'A', entry_count: 4 });
    const advancedB = createMockClass({ id: 4, level: 'Advanced', section: 'B', entry_count: 2 });
    const classes = [noviceA, noviceB, advancedA, advancedB];

    const result = groupSectionedClasses(classes, 'UKC Nosework');

    expect(result).toHaveLength(2); // Novice A&B and Advanced A&B
    expect(result[0].section).toBe('A & B');
    expect(result[0].entry_count).toBe(8); // 5 + 3
    expect(result[1].section).toBe('A & B');
    expect(result[1].entry_count).toBe(6); // 4 + 2
  });

  test('should only combine Novice for AKC', () => {
    const noviceA = createMockClass({ id: 1, level: 'Novice', section: 'A', entry_count: 5 });
    const noviceB = createMockClass({ id: 2, level: 'Novice', section: 'B', entry_count: 3 });
    const advancedA = createMockClass({ id: 3, level: 'Advanced', section: 'A', entry_count: 4 });
    const advancedB = createMockClass({ id: 4, level: 'Advanced', section: 'B', entry_count: 2 });
    const classes = [noviceA, noviceB, advancedA, advancedB];

    const result = groupSectionedClasses(classes, 'AKC Scent Work');

    expect(result).toHaveLength(3); // Novice A&B (combined) + Advanced A + Advanced B (separate)
    expect(result[0].section).toBe('A & B'); // Novice combined
    expect(result[1].section).toBe('A'); // Advanced A kept separate
    expect(result[2].section).toBe('B'); // Advanced B kept separate
  });

  test('should default to AKC behavior when no organization provided', () => {
    const advancedA = createMockClass({ id: 1, level: 'Advanced', section: 'A' });
    const advancedB = createMockClass({ id: 2, level: 'Advanced', section: 'B' });
    const classes = [advancedA, advancedB];

    const result = groupSectionedClasses(classes, undefined);

    // Advanced classes should NOT be combined without organization
    expect(result).toHaveLength(2);
    expect(result[0].section).toBe('A');
    expect(result[1].section).toBe('B');
  });
});

describe('isCombinedEntry', () => {
  test('should identify combined entries', () => {
    const combined = createMockClass({ section: 'A & B', pairedClassId: 2 });
    expect(isCombinedEntry(combined)).toBe(true);
  });

  test('should return false for single sections', () => {
    const single = createMockClass({ section: 'A' });
    expect(isCombinedEntry(single)).toBe(false);
  });
});
