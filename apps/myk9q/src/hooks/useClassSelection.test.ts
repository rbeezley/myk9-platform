/**
 * Unit Tests for useClassSelection Hook
 */

import { renderHook, act } from '@testing-library/react';
import { useClassSelection } from './useClassSelection';
import { vi } from 'vitest';

describe('useClassSelection', () => {
  describe('Initial state', () => {
    test('should initialize with empty selection by default', () => {
      const { result } = renderHook(() => useClassSelection());

      expect(result.current.selectedClasses).toEqual(new Set());
      expect(result.current.selectionCount).toBe(0);
      expect(result.current.hasSelection).toBe(false);
    });

    test('should initialize with provided selection', () => {
      const initialSelection = new Set([1, 2, 3]);
      const { result } = renderHook(() =>
        useClassSelection({ initialSelection })
      );

      expect(result.current.selectedClasses).toEqual(initialSelection);
      expect(result.current.selectionCount).toBe(3);
      expect(result.current.hasSelection).toBe(true);
    });
  });

  describe('Toggle class', () => {
    test('should add class when not selected', () => {
      const { result } = renderHook(() => useClassSelection());

      act(() => {
        result.current.toggleClass(1);
      });

      expect(result.current.selectedClasses).toEqual(new Set([1]));
      expect(result.current.selectionCount).toBe(1);
      expect(result.current.hasSelection).toBe(true);
    });

    test('should remove class when already selected', () => {
      const initialSelection = new Set([1, 2, 3]);
      const { result } = renderHook(() =>
        useClassSelection({ initialSelection })
      );

      act(() => {
        result.current.toggleClass(2);
      });

      expect(result.current.selectedClasses).toEqual(new Set([1, 3]));
      expect(result.current.selectionCount).toBe(2);
    });

    test('should toggle multiple times correctly', () => {
      const { result } = renderHook(() => useClassSelection());

      // Add 1
      act(() => {
        result.current.toggleClass(1);
      });
      expect(result.current.selectedClasses).toEqual(new Set([1]));

      // Remove 1
      act(() => {
        result.current.toggleClass(1);
      });
      expect(result.current.selectedClasses).toEqual(new Set());

      // Add 1 again
      act(() => {
        result.current.toggleClass(1);
      });
      expect(result.current.selectedClasses).toEqual(new Set([1]));
    });

    test('should handle toggling multiple different classes', () => {
      const { result } = renderHook(() => useClassSelection());

      act(() => {
        result.current.toggleClass(1);
        result.current.toggleClass(2);
        result.current.toggleClass(3);
      });

      expect(result.current.selectedClasses).toEqual(new Set([1, 2, 3]));
      expect(result.current.selectionCount).toBe(3);
    });
  });

  describe('Select all', () => {
    test('should select all provided class IDs', () => {
      const { result } = renderHook(() => useClassSelection());

      act(() => {
        result.current.selectAll([1, 2, 3, 4, 5]);
      });

      expect(result.current.selectedClasses).toEqual(new Set([1, 2, 3, 4, 5]));
      expect(result.current.selectionCount).toBe(5);
      expect(result.current.hasSelection).toBe(true);
    });

    test('should replace existing selection', () => {
      const initialSelection = new Set([1, 2]);
      const { result } = renderHook(() =>
        useClassSelection({ initialSelection })
      );

      act(() => {
        result.current.selectAll([3, 4, 5]);
      });

      expect(result.current.selectedClasses).toEqual(new Set([3, 4, 5]));
      expect(result.current.selectionCount).toBe(3);
    });

    test('should handle empty array', () => {
      const initialSelection = new Set([1, 2, 3]);
      const { result } = renderHook(() =>
        useClassSelection({ initialSelection })
      );

      act(() => {
        result.current.selectAll([]);
      });

      expect(result.current.selectedClasses).toEqual(new Set());
      expect(result.current.selectionCount).toBe(0);
      expect(result.current.hasSelection).toBe(false);
    });

    test('should handle duplicate IDs in array', () => {
      const { result } = renderHook(() => useClassSelection());

      act(() => {
        result.current.selectAll([1, 2, 2, 3, 3, 3]);
      });

      // Set automatically deduplicates
      expect(result.current.selectedClasses).toEqual(new Set([1, 2, 3]));
      expect(result.current.selectionCount).toBe(3);
    });
  });

  describe('Clear selection', () => {
    test('should clear all selected classes', () => {
      const initialSelection = new Set([1, 2, 3, 4, 5]);
      const { result } = renderHook(() =>
        useClassSelection({ initialSelection })
      );

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedClasses).toEqual(new Set());
      expect(result.current.selectionCount).toBe(0);
      expect(result.current.hasSelection).toBe(false);
    });

    test('should work when already empty', () => {
      const { result } = renderHook(() => useClassSelection());

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedClasses).toEqual(new Set());
      expect(result.current.selectionCount).toBe(0);
    });
  });

  describe('isSelected', () => {
    test('should return true for selected classes', () => {
      const initialSelection = new Set([1, 2, 3]);
      const { result } = renderHook(() =>
        useClassSelection({ initialSelection })
      );

      expect(result.current.isSelected(1)).toBe(true);
      expect(result.current.isSelected(2)).toBe(true);
      expect(result.current.isSelected(3)).toBe(true);
    });

    test('should return false for non-selected classes', () => {
      const initialSelection = new Set([1, 2, 3]);
      const { result } = renderHook(() =>
        useClassSelection({ initialSelection })
      );

      expect(result.current.isSelected(4)).toBe(false);
      expect(result.current.isSelected(999)).toBe(false);
    });

    test('should update when selection changes', () => {
      const { result } = renderHook(() => useClassSelection());

      expect(result.current.isSelected(1)).toBe(false);

      act(() => {
        result.current.toggleClass(1);
      });

      expect(result.current.isSelected(1)).toBe(true);
    });
  });

  describe('Selection count and hasSelection', () => {
    test('should track selection count correctly', () => {
      const { result } = renderHook(() => useClassSelection());

      expect(result.current.selectionCount).toBe(0);

      act(() => {
        result.current.toggleClass(1);
      });
      expect(result.current.selectionCount).toBe(1);

      act(() => {
        result.current.toggleClass(2);
      });
      expect(result.current.selectionCount).toBe(2);

      act(() => {
        result.current.toggleClass(1);
      });
      expect(result.current.selectionCount).toBe(1);

      act(() => {
        result.current.clearSelection();
      });
      expect(result.current.selectionCount).toBe(0);
    });

    test('should track hasSelection correctly', () => {
      const { result } = renderHook(() => useClassSelection());

      expect(result.current.hasSelection).toBe(false);

      act(() => {
        result.current.toggleClass(1);
      });
      expect(result.current.hasSelection).toBe(true);

      act(() => {
        result.current.clearSelection();
      });
      expect(result.current.hasSelection).toBe(false);
    });
  });

  describe('onSelectionChange callback', () => {
    test('should call callback when toggling class', () => {
      const onSelectionChange = vi.fn();
      const { result } = renderHook(() =>
        useClassSelection({ onSelectionChange })
      );

      act(() => {
        result.current.toggleClass(1);
      });

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      expect(onSelectionChange).toHaveBeenCalledWith(new Set([1]));
    });

    test('should call callback when selecting all', () => {
      const onSelectionChange = vi.fn();
      const { result } = renderHook(() =>
        useClassSelection({ onSelectionChange })
      );

      act(() => {
        result.current.selectAll([1, 2, 3]);
      });

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      expect(onSelectionChange).toHaveBeenCalledWith(new Set([1, 2, 3]));
    });

    test('should call callback when clearing selection', () => {
      const onSelectionChange = vi.fn();
      const initialSelection = new Set([1, 2, 3]);
      const { result } = renderHook(() =>
        useClassSelection({ initialSelection, onSelectionChange })
      );

      act(() => {
        result.current.clearSelection();
      });

      expect(onSelectionChange).toHaveBeenCalledTimes(1);
      expect(onSelectionChange).toHaveBeenCalledWith(new Set());
    });

    test('should not call callback on initialization', () => {
      const onSelectionChange = vi.fn();
      const initialSelection = new Set([1, 2, 3]);

      renderHook(() =>
        useClassSelection({ initialSelection, onSelectionChange })
      );

      expect(onSelectionChange).not.toHaveBeenCalled();
    });
  });

  describe('Real-world CompetitionAdmin.tsx workflow', () => {
    test('should handle bulk operations workflow', () => {
      const { result } = renderHook(() => useClassSelection());

      // User selects a few classes
      act(() => {
        result.current.toggleClass(1);
        result.current.toggleClass(2);
        result.current.toggleClass(3);
      });
      expect(result.current.selectionCount).toBe(3);

      // User releases results for selected classes
      const selectedForRelease = Array.from(result.current.selectedClasses);
      expect(selectedForRelease).toEqual([1, 2, 3]);

      // After successful release, clear selection
      act(() => {
        result.current.clearSelection();
      });
      expect(result.current.hasSelection).toBe(false);
    });

    test('should handle select all workflow', () => {
      const allClassIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { result } = renderHook(() => useClassSelection());

      // User clicks "Select All"
      act(() => {
        result.current.selectAll(allClassIds);
      });
      expect(result.current.selectionCount).toBe(10);

      // User deselects one class
      act(() => {
        result.current.toggleClass(5);
      });
      expect(result.current.selectionCount).toBe(9);
      expect(result.current.isSelected(5)).toBe(false);

      // User clears selection
      act(() => {
        result.current.clearSelection();
      });
      expect(result.current.hasSelection).toBe(false);
    });

    test('should handle checkbox interactions', () => {
      const { result } = renderHook(() => useClassSelection());

      // Simulate clicking checkboxes
      const classIds = [101, 102, 103, 104, 105];

      classIds.forEach((id) => {
        act(() => {
          result.current.toggleClass(id);
        });
      });

      expect(result.current.selectionCount).toBe(5);

      // Uncheck one
      act(() => {
        result.current.toggleClass(103);
      });

      expect(result.current.selectionCount).toBe(4);
      expect(result.current.isSelected(103)).toBe(false);
    });

    test('should support conditional bulk actions based on selection', () => {
      const { result } = renderHook(() => useClassSelection());

      // Initially no selection - bulk actions should be disabled
      expect(result.current.hasSelection).toBe(false);

      // Select some classes
      act(() => {
        result.current.selectAll([1, 2, 3]);
      });

      // Now bulk actions should be enabled
      expect(result.current.hasSelection).toBe(true);
      expect(result.current.selectionCount).toBe(3);

      // Can get selected IDs for bulk operation
      const selectedIds = Array.from(result.current.selectedClasses);
      expect(selectedIds).toEqual([1, 2, 3]);
    });
  });

  describe('Memoization', () => {
    test('should memoize toggleClass callback', () => {
      const { result, rerender } = renderHook(
        ({ onSelectionChange }) => useClassSelection({ onSelectionChange }),
        { initialProps: { onSelectionChange: vi.fn() } }
      );

      const firstToggle = result.current.toggleClass;

      // Rerender with same callback
      rerender({ onSelectionChange: vi.fn() });

      // Should be different reference because callback changed
      expect(result.current.toggleClass).not.toBe(firstToggle);
    });

    test('should update isSelected when selection changes', () => {
      const { result } = renderHook(() => useClassSelection());

      const firstIsSelected = result.current.isSelected;

      act(() => {
        result.current.toggleClass(1);
      });

      // isSelected should be a new reference (dependency changed)
      expect(result.current.isSelected).not.toBe(firstIsSelected);
    });
  });

  describe('Edge cases', () => {
    test('should handle very large selections', () => {
      const { result } = renderHook(() => useClassSelection());

      const largeClassIds = Array.from({ length: 1000 }, (_, i) => i + 1);

      act(() => {
        result.current.selectAll(largeClassIds);
      });

      expect(result.current.selectionCount).toBe(1000);
      expect(result.current.isSelected(500)).toBe(true);
      expect(result.current.isSelected(1001)).toBe(false);
    });

    test('should handle toggling same class rapidly', () => {
      const { result } = renderHook(() => useClassSelection());

      act(() => {
        result.current.toggleClass(1);
        result.current.toggleClass(1);
        result.current.toggleClass(1);
        result.current.toggleClass(1);
      });

      // After 4 toggles (even number), should be unselected
      expect(result.current.isSelected(1)).toBe(false);
      expect(result.current.selectionCount).toBe(0);
    });

    test('should handle negative class IDs', () => {
      const { result } = renderHook(() => useClassSelection());

      act(() => {
        result.current.toggleClass(-1);
        result.current.toggleClass(-99);
      });

      expect(result.current.selectedClasses).toEqual(new Set([-1, -99]));
      expect(result.current.isSelected(-1)).toBe(true);
    });
  });
});
