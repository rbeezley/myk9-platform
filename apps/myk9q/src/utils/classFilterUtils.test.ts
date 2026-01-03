/**
 * Unit Tests for Class Filtering Utilities
 */

import {
  filterClasses,
  sortClasses,
  filterAndSortClasses,
  getClassCounts,
  classMatchesSearch,
  type ClassFilter,
  type ClassSortOrder,
  type ClassEntry,
} from './classFilterUtils';

// Mock class entries for testing
const createMockClass = (
  id: number,
  overrides: Partial<ClassEntry> = {}
): ClassEntry => ({
  id,
  class_name: 'Test Class',
  element: 'Standard',
  level: 'Novice',
  section: 'A',
  class_order: id,
  judge_name: 'Judge Smith',
  entry_count: 10,
  completed_count: 0,
  class_status: 'no-status',
  is_scoring_finalized: false,
  is_favorite: false,
  dogs: [],
  ...overrides,
});

describe('classFilterUtils', () => {
  describe('filterClasses', () => {
    const classes: ClassEntry[] = [
      createMockClass(1, {
        class_name: 'Standard Novice A',
        element: 'Standard',
        level: 'Novice',
        section: 'A',
        is_favorite: true,
        class_status: 'no-status',
      }),
      createMockClass(2, {
        class_name: 'Standard Novice B',
        element: 'Standard',
        level: 'Novice',
        section: 'B',
        class_status: 'completed',
      }),
      createMockClass(3, {
        class_name: 'Jumpers Excellent',
        element: 'Jumpers',
        level: 'Excellent',
        section: '-',
        judge_name: 'Judge Jones',
        is_favorite: true,
        class_status: 'in_progress',
      }),
      createMockClass(4, {
        class_name: 'Snooker Master',
        element: 'Snooker',
        level: 'Master',
        section: '-',
        is_scoring_finalized: true,
      }),
    ];

    describe('Status filtering', () => {
      test('should filter pending classes', () => {
        const result = filterClasses(classes, { filter: 'pending' });
        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([1, 3]);
      });

      test('should filter completed classes', () => {
        const result = filterClasses(classes, { filter: 'completed' });
        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([2, 4]);
      });

      test('should filter favorite classes', () => {
        const result = filterClasses(classes, { filter: 'favorites' });
        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([1, 3]);
      });

      test('should return all classes when no filter applied', () => {
        const result = filterClasses(classes);
        expect(result).toHaveLength(4);
      });
    });

    describe('Search filtering', () => {
      test('should search by class name', () => {
        const result = filterClasses(classes, { searchTerm: 'snooker' });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(4);
      });

      test('should search by element', () => {
        const result = filterClasses(classes, { searchTerm: 'jumpers' });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(3);
      });

      test('should search by level', () => {
        const result = filterClasses(classes, { searchTerm: 'novice' });
        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([1, 2]);
      });

      test('should search by judge name', () => {
        const result = filterClasses(classes, { searchTerm: 'jones' });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(3);
      });

      test('should search by section', () => {
        // Search for section 'B' to avoid matching 'Standard' which contains 'a'
        const result = filterClasses(classes, { searchTerm: 'B' });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(2);
      });

      test('should ignore hyphen sections in search', () => {
        const result = filterClasses(classes, { searchTerm: '-' });
        expect(result).toHaveLength(0);
      });

      test('should be case-insensitive', () => {
        const result = filterClasses(classes, { searchTerm: 'STANDARD' });
        expect(result).toHaveLength(2);
      });

      test('should match partial terms', () => {
        const result = filterClasses(classes, { searchTerm: 'stan' });
        expect(result).toHaveLength(2);
      });

      test('should return empty array for non-matching search', () => {
        const result = filterClasses(classes, { searchTerm: 'nonexistent' });
        expect(result).toHaveLength(0);
      });
    });

    describe('Combined filtering', () => {
      test('should combine status filter and search', () => {
        const result = filterClasses(classes, {
          filter: 'pending',
          searchTerm: 'standard',
        });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
      });

      test('should combine favorites filter and search', () => {
        const result = filterClasses(classes, {
          filter: 'favorites',
          searchTerm: 'jumpers',
        });
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(3);
      });
    });
  });

  describe('sortClasses', () => {
    const classes: ClassEntry[] = [
      createMockClass(1, {
        class_name: 'Jumpers Master',
        element: 'Jumpers',
        level: 'Master',
        section: 'B',
        class_order: 5,
      }),
      createMockClass(2, {
        class_name: 'Standard Novice',
        element: 'Standard',
        level: 'Novice',
        section: 'A',
        class_order: 1,
      }),
      createMockClass(3, {
        class_name: 'Standard Excellent',
        element: 'Standard',
        level: 'Excellent',
        section: 'A',
        class_order: 3,
      }),
      createMockClass(4, {
        class_name: 'Jumpers Advanced',
        element: 'Jumpers',
        level: 'Advanced',
        section: 'A',
        class_order: 2,
      }),
      createMockClass(5, {
        class_name: 'Standard Master',
        element: 'Standard',
        level: 'Master',
        section: 'A',
        class_order: 4,
      }),
    ];

    describe('class_order sorting', () => {
      test('should sort by class_order by default', () => {
        const result = sortClasses(classes, 'class_order');
        expect(result.map((c) => c.class_order)).toEqual([1, 2, 3, 4, 5]);
      });

      test('should not mutate original array', () => {
        const original = [...classes];
        sortClasses(classes, 'class_order');
        expect(classes).toEqual(original);
      });
    });

    describe('element_level sorting', () => {
      test('should sort by element first, then level', () => {
        const result = sortClasses(classes, 'element_level');
        // Expected order: Jumpers Advanced → Jumpers Master → Standard Novice → Standard Excellent → Standard Master
        expect(result.map((c) => c.id)).toEqual([4, 1, 2, 3, 5]);
      });
    });

    describe('level_element sorting', () => {
      test('should sort by level first, then element', () => {
        const result = sortClasses(classes, 'level_element');
        // Expected order: Novice (Standard) → Advanced (Jumpers) → Excellent (Standard) → Master (Jumpers, Standard)
        expect(result.map((c) => c.id)).toEqual([2, 4, 3, 1, 5]);
      });
    });

    describe('Section tie-breaking', () => {
      const classesWithSections: ClassEntry[] = [
        createMockClass(1, {
          element: 'Standard',
          level: 'Novice',
          section: 'B',
          class_order: 1,
        }),
        createMockClass(2, {
          element: 'Standard',
          level: 'Novice',
          section: 'A',
          class_order: 2,
        }),
      ];

      test('should use section for tie-breaking', () => {
        const result = sortClasses(classesWithSections, 'element_level');
        expect(result.map((c) => c.section)).toEqual(['A', 'B']);
      });
    });
  });

  describe('filterAndSortClasses', () => {
    const classes: ClassEntry[] = [
      createMockClass(1, {
        class_name: 'Standard Novice A',
        element: 'Standard',
        level: 'Novice',
        class_order: 2,
        is_favorite: true,
      }),
      createMockClass(2, {
        class_name: 'Jumpers Master',
        element: 'Jumpers',
        level: 'Master',
        class_order: 1,
        class_status: 'completed',
      }),
      createMockClass(3, {
        class_name: 'Standard Excellent',
        element: 'Standard',
        level: 'Excellent',
        class_order: 3,
      }),
    ];

    test('should filter and sort together', () => {
      const result = filterAndSortClasses(classes, {
        filter: 'pending',
        sortOrder: 'class_order',
      });
      expect(result.map((c) => c.id)).toEqual([1, 3]);
    });

    test('should apply search, filter, and sort', () => {
      const result = filterAndSortClasses(classes, {
        filter: 'pending',
        searchTerm: 'standard',
        sortOrder: 'level_element',
      });
      // Standard Novice → Standard Excellent
      expect(result.map((c) => c.id)).toEqual([1, 3]);
    });

    test('should use default class_order sort when not specified', () => {
      const result = filterAndSortClasses(classes, {
        filter: 'pending',
      });
      expect(result.map((c) => c.class_order)).toEqual([2, 3]);
    });
  });

  describe('getClassCounts', () => {
    const classes: ClassEntry[] = [
      createMockClass(1, {
        class_status: 'no-status',
        is_favorite: true,
      }),
      createMockClass(2, {
        class_status: 'completed',
        is_favorite: false,
      }),
      createMockClass(3, {
        class_status: 'in_progress',
        is_favorite: true,
      }),
      createMockClass(4, {
        is_scoring_finalized: true,
        is_favorite: false,
      }),
      createMockClass(5, {
        class_status: 'no-status',
        is_favorite: true,
      }),
    ];

    test('should count pending classes correctly', () => {
      const counts = getClassCounts(classes);
      expect(counts.pending).toBe(3); // IDs: 1, 3, 5
    });

    test('should count completed classes correctly', () => {
      const counts = getClassCounts(classes);
      expect(counts.completed).toBe(2); // IDs: 2, 4
    });

    test('should count favorites correctly', () => {
      const counts = getClassCounts(classes);
      expect(counts.favorites).toBe(3); // IDs: 1, 3, 5
    });

    test('should count total classes correctly', () => {
      const counts = getClassCounts(classes);
      expect(counts.total).toBe(5);
    });

    test('should handle empty array', () => {
      const counts = getClassCounts([]);
      expect(counts).toEqual({
        pending: 0,
        completed: 0,
        favorites: 0,
        total: 0,
      });
    });
  });

  describe('classMatchesSearch', () => {
    const classEntry = createMockClass(1, {
      class_name: 'Standard Novice A',
      element: 'Standard',
      level: 'Novice',
      section: 'A',
      judge_name: 'Judge Smith',
    });

    test('should match by class name', () => {
      expect(classMatchesSearch(classEntry, 'standard')).toBe(true);
    });

    test('should match by element', () => {
      expect(classMatchesSearch(classEntry, 'standard')).toBe(true);
    });

    test('should match by level', () => {
      expect(classMatchesSearch(classEntry, 'novice')).toBe(true);
    });

    test('should match by section', () => {
      expect(classMatchesSearch(classEntry, 'A')).toBe(true);
    });

    test('should match by judge name', () => {
      expect(classMatchesSearch(classEntry, 'smith')).toBe(true);
    });

    test('should be case-insensitive', () => {
      expect(classMatchesSearch(classEntry, 'STANDARD')).toBe(true);
      expect(classMatchesSearch(classEntry, 'NoViCe')).toBe(true);
    });

    test('should not match non-existent term', () => {
      expect(classMatchesSearch(classEntry, 'excellent')).toBe(false);
    });

    test('should ignore hyphen sections', () => {
      const classWithHyphen = createMockClass(2, { section: '-' });
      expect(classMatchesSearch(classWithHyphen, '-')).toBe(false);
    });

    test('should return true for empty search term', () => {
      expect(classMatchesSearch(classEntry, '')).toBe(true);
    });

    test('should match partial terms', () => {
      expect(classMatchesSearch(classEntry, 'stan')).toBe(true);
      expect(classMatchesSearch(classEntry, 'nov')).toBe(true);
    });
  });

  describe('Real-world scenarios', () => {
    test('should handle ClassList.tsx filtering workflow', () => {
      const classes: ClassEntry[] = [
        createMockClass(1, {
          class_name: 'Standard Novice A',
          element: 'Standard',
          level: 'Novice',
          class_order: 1,
          is_favorite: true,
        }),
        createMockClass(2, {
          class_name: 'Standard Novice B',
          element: 'Standard',
          level: 'Novice',
          class_order: 2,
          class_status: 'completed',
        }),
        createMockClass(3, {
          class_name: 'Jumpers Excellent',
          element: 'Jumpers',
          level: 'Excellent',
          class_order: 3,
        }),
      ];

      // Simulate user selecting "pending" filter
      const pending = filterAndSortClasses(classes, {
        filter: 'pending',
        sortOrder: 'class_order',
      });
      expect(pending).toHaveLength(2);
      expect(pending.map((c) => c.id)).toEqual([1, 3]);

      // Simulate user searching for "standard"
      const searched = filterAndSortClasses(classes, {
        filter: 'pending',
        searchTerm: 'standard',
        sortOrder: 'class_order',
      });
      expect(searched).toHaveLength(1);
      expect(searched[0].id).toBe(1);
    });

    test('should handle ClassFilters.tsx count workflow', () => {
      const classes: ClassEntry[] = [
        createMockClass(1, { is_favorite: true }),
        createMockClass(2, { class_status: 'completed' }),
        createMockClass(3, { is_favorite: true, class_status: 'in_progress' }),
        createMockClass(4, { is_scoring_finalized: true }),
      ];

      const counts = getClassCounts(classes);

      // Verify tab badge counts
      expect(counts.pending).toBe(2); // IDs: 1, 3
      expect(counts.favorites).toBe(2); // IDs: 1, 3
      expect(counts.completed).toBe(2); // IDs: 2, 4
    });

    test('should handle sort order changes', () => {
      const classes: ClassEntry[] = [
        createMockClass(1, {
          element: 'Standard',
          level: 'Master',
          class_order: 4,
        }),
        createMockClass(2, {
          element: 'Jumpers',
          level: 'Novice',
          class_order: 1,
        }),
        createMockClass(3, {
          element: 'Standard',
          level: 'Novice',
          class_order: 2,
        }),
      ];

      // Default class order
      const byClassOrder = sortClasses(classes, 'class_order');
      expect(byClassOrder.map((c) => c.id)).toEqual([2, 3, 1]);

      // By element
      const byElement = sortClasses(classes, 'element_level');
      expect(byElement.map((c) => c.id)).toEqual([2, 3, 1]);

      // By level
      const byLevel = sortClasses(classes, 'level_element');
      expect(byLevel.map((c) => c.id)).toEqual([2, 3, 1]);
    });
  });
});
