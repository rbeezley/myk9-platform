/**
 * Unit Tests for useClassFilters Hook
 */

import { renderHook, act } from '@testing-library/react';
import { useClassFilters } from './useClassFilters';
import type { ClassEntry } from '../utils/classFilterUtils';

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

describe('useClassFilters', () => {
  const mockClasses: ClassEntry[] = [
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
      is_favorite: true,
    }),
    createMockClass(4, {
      class_name: 'Snooker Master',
      element: 'Snooker',
      level: 'Master',
      class_order: 4,
      is_scoring_finalized: true,
    }),
  ];

  describe('Initial state', () => {
    test('should initialize with default values', () => {
      const { result } = renderHook(() =>
        useClassFilters({ classes: mockClasses })
      );

      expect(result.current.combinedFilter).toBe('pending');
      expect(result.current.searchTerm).toBe('');
      expect(result.current.sortOrder).toBe('class_order');
      expect(result.current.isSearchCollapsed).toBe(true);
    });

    test('should initialize with custom values', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialFilter: 'favorites',
          initialSortOrder: 'element_level',
          initialSearchTerm: 'test',
          initialSearchCollapsed: false,
        })
      );

      expect(result.current.combinedFilter).toBe('favorites');
      expect(result.current.searchTerm).toBe('test');
      expect(result.current.sortOrder).toBe('element_level');
      expect(result.current.isSearchCollapsed).toBe(false);
    });
  });

  describe('Filtering', () => {
    test('should filter pending classes', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialFilter: 'pending',
        })
      );

      expect(result.current.filteredClasses).toHaveLength(2);
      expect(result.current.filteredClasses.map((c) => c.id)).toEqual([1, 3]);
    });

    test('should filter completed classes', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialFilter: 'completed',
        })
      );

      expect(result.current.filteredClasses).toHaveLength(2);
      expect(result.current.filteredClasses.map((c) => c.id)).toEqual([2, 4]);
    });

    test('should filter favorite classes', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialFilter: 'favorites',
        })
      );

      expect(result.current.filteredClasses).toHaveLength(2);
      expect(result.current.filteredClasses.map((c) => c.id)).toEqual([1, 3]);
    });

    test('should update filter when setCombinedFilter is called', () => {
      const { result } = renderHook(() =>
        useClassFilters({ classes: mockClasses })
      );

      act(() => {
        result.current.setCombinedFilter('completed');
      });

      expect(result.current.combinedFilter).toBe('completed');
      expect(result.current.filteredClasses).toHaveLength(2);
    });
  });

  describe('Searching', () => {
    test('should filter by search term', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialSearchTerm: 'snooker',
          initialFilter: 'completed', // Snooker is completed
        })
      );

      expect(result.current.filteredClasses).toHaveLength(1);
      expect(result.current.filteredClasses[0].id).toBe(4);
    });

    test('should be case-insensitive', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialSearchTerm: 'STANDARD',
          initialFilter: 'pending', // One Standard is pending
        })
      );

      // Only one Standard class is pending (id: 1)
      expect(result.current.filteredClasses).toHaveLength(1);
    });

    test('should update search term', () => {
      const { result } = renderHook(() =>
        useClassFilters({ classes: mockClasses })
      );

      act(() => {
        result.current.setSearchTerm('jumpers');
      });

      expect(result.current.searchTerm).toBe('jumpers');
      expect(result.current.filteredClasses).toHaveLength(1);
      expect(result.current.filteredClasses[0].id).toBe(3);
    });

    test('should combine filter and search', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialFilter: 'pending',
          initialSearchTerm: 'standard',
        })
      );

      expect(result.current.filteredClasses).toHaveLength(1);
      expect(result.current.filteredClasses[0].id).toBe(1);
    });

    test('should clear search', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialSearchTerm: 'test',
        })
      );

      act(() => {
        result.current.clearSearch();
      });

      expect(result.current.searchTerm).toBe('');
    });
  });

  describe('Sorting', () => {
    test('should sort by class_order by default', () => {
      const { result } = renderHook(() =>
        useClassFilters({ classes: mockClasses })
      );

      const orders = result.current.filteredClasses.map((c) => c.class_order);
      expect(orders).toEqual([1, 3]); // Pending classes in order
    });

    test('should update sort order', () => {
      const { result } = renderHook(() =>
        useClassFilters({ classes: mockClasses })
      );

      act(() => {
        result.current.setSortOrder('element_level');
      });

      expect(result.current.sortOrder).toBe('element_level');
    });

    test('should sort by element_level', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialSortOrder: 'element_level',
        })
      );

      // Pending: Jumpers Excellent (3), Standard Novice (1)
      expect(result.current.filteredClasses.map((c) => c.id)).toEqual([3, 1]);
    });

    test('should sort by level_element', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialSortOrder: 'level_element',
        })
      );

      // Pending: Novice (Standard=1), Excellent (Jumpers=3)
      expect(result.current.filteredClasses.map((c) => c.id)).toEqual([1, 3]);
    });
  });

  describe('Search UI state', () => {
    test('should manage search collapsed state', () => {
      const { result } = renderHook(() =>
        useClassFilters({ classes: mockClasses })
      );

      expect(result.current.isSearchCollapsed).toBe(true);

      act(() => {
        result.current.setIsSearchCollapsed(false);
      });

      expect(result.current.isSearchCollapsed).toBe(false);
    });
  });

  describe('Grouping classes', () => {
    test('should apply groupClasses function before filtering', () => {
      const groupClasses = vi.fn((classes) => {
        // Mock grouping: reverse the array
        return [...classes].reverse();
      });

      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          groupClasses,
        })
      );

      expect(groupClasses).toHaveBeenCalledWith(mockClasses);
      // Since we reversed and filtered pending, should still get correct results
      expect(result.current.filteredClasses).toHaveLength(2);
    });

    test('should work without groupClasses function', () => {
      const { result } = renderHook(() =>
        useClassFilters({ classes: mockClasses })
      );

      expect(result.current.filteredClasses).toHaveLength(2);
    });
  });

  describe('Reset functionality', () => {
    test('should reset all filters to initial state', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialFilter: 'pending',
          initialSearchTerm: '',
          initialSortOrder: 'class_order',
          initialSearchCollapsed: true,
        })
      );

      // Change all values
      act(() => {
        result.current.setCombinedFilter('completed');
        result.current.setSearchTerm('test');
        result.current.setSortOrder('element_level');
        result.current.setIsSearchCollapsed(false);
      });

      // Verify changes
      expect(result.current.combinedFilter).toBe('completed');
      expect(result.current.searchTerm).toBe('test');
      expect(result.current.sortOrder).toBe('element_level');
      expect(result.current.isSearchCollapsed).toBe(false);

      // Reset
      act(() => {
        result.current.resetFilters();
      });

      // Verify reset
      expect(result.current.combinedFilter).toBe('pending');
      expect(result.current.searchTerm).toBe('');
      expect(result.current.sortOrder).toBe('class_order');
      expect(result.current.isSearchCollapsed).toBe(true);
    });
  });

  describe('Memoization', () => {
    test('should memoize filtered results', () => {
      const { result, rerender } = renderHook(() =>
        useClassFilters({ classes: mockClasses })
      );

      const firstResult = result.current.filteredClasses;

      // Rerender without changing dependencies
      rerender();

      // Should be the same reference (memoized)
      expect(result.current.filteredClasses).toBe(firstResult);
    });

    test('should recompute when classes change', () => {
      const { result, rerender } = renderHook(
        ({ classes }) => useClassFilters({ classes }),
        { initialProps: { classes: mockClasses } }
      );

      const firstResult = result.current.filteredClasses;

      // Change classes
      const newClasses = [...mockClasses, createMockClass(5, { class_order: 5 })];
      rerender({ classes: newClasses });

      // Should be different reference (recomputed)
      expect(result.current.filteredClasses).not.toBe(firstResult);
    });

    test('should recompute when filter changes', () => {
      const { result } = renderHook(() =>
        useClassFilters({ classes: mockClasses })
      );

      const firstResult = result.current.filteredClasses;

      act(() => {
        result.current.setCombinedFilter('completed');
      });

      // Should be different reference (recomputed)
      expect(result.current.filteredClasses).not.toBe(firstResult);
    });
  });

  describe('Real-world scenarios', () => {
    test('should handle ClassList.tsx workflow', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialFilter: 'pending',
        })
      );

      // Initial state: 2 pending classes
      expect(result.current.filteredClasses).toHaveLength(2);

      // User searches for "standard"
      act(() => {
        result.current.setSearchTerm('standard');
      });
      expect(result.current.filteredClasses).toHaveLength(1);

      // User clears search
      act(() => {
        result.current.clearSearch();
      });
      expect(result.current.filteredClasses).toHaveLength(2);

      // User switches to favorites
      act(() => {
        result.current.setCombinedFilter('favorites');
      });
      expect(result.current.filteredClasses).toHaveLength(2);

      // User changes sort order
      act(() => {
        result.current.setSortOrder('element_level');
      });
      expect(result.current.filteredClasses.map((c) => c.element)).toEqual([
        'Jumpers',
        'Standard',
      ]);
    });

    test('should handle empty classes array', () => {
      const { result } = renderHook(() =>
        useClassFilters({ classes: [] })
      );

      expect(result.current.filteredClasses).toEqual([]);
    });

    test('should handle no matching results', () => {
      const { result } = renderHook(() =>
        useClassFilters({
          classes: mockClasses,
          initialSearchTerm: 'nonexistent',
        })
      );

      expect(result.current.filteredClasses).toEqual([]);
    });
  });
});
