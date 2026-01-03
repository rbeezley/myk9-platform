/**
 * Tests for useBulkOperations Hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useBulkOperations } from './useBulkOperations';
import * as resultVisibilityService from '@/services/resultVisibilityService';
import type { ClassInfo } from './useCompetitionAdminData';

// Mock the result visibility service
vi.mock('@/services/resultVisibilityService');

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
    }))
  }))
};

// Sample test data
const mockClasses: ClassInfo[] = [
  {
    id: 1,
    trial_id: 1,
    element: 'Agility',
    level: 'Novice',
    section: 'A',
    judge_name: 'Judge Smith',
    trial_date: '2025-01-15',
    trial_number: '1',
    class_completed: false,
    results_released_at: null,
    results_released_by: null,
    class_completed_at: null,
    self_checkin: false,
    total_entries: 10,
    scored_entries: 0,
    visibility_preset: 'standard'
  },
  {
    id: 2,
    trial_id: 1,
    element: 'Jumping',
    level: 'Novice',
    section: 'A',
    judge_name: 'Judge Smith',
    trial_date: '2025-01-15',
    trial_number: '1',
    class_completed: false,
    results_released_at: null,
    results_released_by: null,
    class_completed_at: null,
    self_checkin: false,
    total_entries: 12,
    scored_entries: 0,
    visibility_preset: 'standard'
  },
  {
    id: 3,
    trial_id: 2,
    element: 'Agility',
    level: 'Open',
    section: 'B',
    judge_name: 'Judge Jones',
    trial_date: '2025-01-16',
    trial_number: '2',
    class_completed: false,
    results_released_at: null,
    results_released_by: null,
    class_completed_at: null,
    self_checkin: true,
    total_entries: 15,
    scored_entries: 5,
    visibility_preset: 'open'
  }
];

describe('useBulkOperations', () => {
  beforeEach(() => {
    // IMPORTANT: Use resetAllMocks to fully reset mock state (clears calls AND implementations)
    // This prevents async operations from previous tests polluting current test
    vi.resetAllMocks();
  });

  afterEach(async () => {
    // Clean up after each test to prevent contamination
    // Flush any pending promises/timers before resetting mocks
    await vi.runOnlyPendingTimersAsync().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 0)); // Flush microtask queue
    vi.resetAllMocks();
    vi.clearAllTimers();
  });

  describe('Initialization', () => {
    it('should initialize with empty selection', () => {
      const { result } = renderHook(() => useBulkOperations());

      expect(result.current.selectedClasses).toEqual(new Set());
      expect(result.current.selectedClasses.size).toBe(0);
    });

    it('should provide all required methods', () => {
      const { result } = renderHook(() => useBulkOperations());

      expect(typeof result.current.setSelectedClasses).toBe('function');
      expect(typeof result.current.toggleClassSelection).toBe('function');
      expect(typeof result.current.selectAllClasses).toBe('function');
      expect(typeof result.current.clearSelection).toBe('function');
      expect(typeof result.current.handleBulkSetClassVisibility).toBe('function');
      expect(typeof result.current.handleBulkSetClassSelfCheckin).toBe('function');
      expect(typeof result.current.handleBulkReleaseResults).toBe('function');
    });
  });

  describe('Class selection', () => {
    it('should toggle class selection on', () => {
      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleClassSelection(1);
      });

      expect(result.current.selectedClasses.has(1)).toBe(true);
      expect(result.current.selectedClasses.size).toBe(1);
    });

    it('should toggle class selection off', () => {
      const { result } = renderHook(() => useBulkOperations());

      // Select first
      act(() => {
        result.current.toggleClassSelection(1);
      });
      expect(result.current.selectedClasses.has(1)).toBe(true);

      // Then deselect
      act(() => {
        result.current.toggleClassSelection(1);
      });
      expect(result.current.selectedClasses.has(1)).toBe(false);
      expect(result.current.selectedClasses.size).toBe(0);
    });

    it('should toggle multiple classes', () => {
      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleClassSelection(1);
        result.current.toggleClassSelection(2);
        result.current.toggleClassSelection(3);
      });

      expect(result.current.selectedClasses.size).toBe(3);
      expect(result.current.selectedClasses.has(1)).toBe(true);
      expect(result.current.selectedClasses.has(2)).toBe(true);
      expect(result.current.selectedClasses.has(3)).toBe(true);
    });

    it('should select all classes', () => {
      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.selectAllClasses(mockClasses);
      });

      expect(result.current.selectedClasses.size).toBe(3);
      expect(result.current.selectedClasses.has(1)).toBe(true);
      expect(result.current.selectedClasses.has(2)).toBe(true);
      expect(result.current.selectedClasses.has(3)).toBe(true);
    });

    it('should clear selection', () => {
      const { result } = renderHook(() => useBulkOperations());

      // First select some classes
      act(() => {
        result.current.toggleClassSelection(1);
        result.current.toggleClassSelection(2);
      });
      expect(result.current.selectedClasses.size).toBe(2);

      // Then clear
      act(() => {
        result.current.clearSelection();
      });
      expect(result.current.selectedClasses.size).toBe(0);
    });

    it('should allow direct state updates via setter', () => {
      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.setSelectedClasses(new Set([1, 2]));
      });

      expect(result.current.selectedClasses.size).toBe(2);
      expect(result.current.selectedClasses.has(1)).toBe(true);
      expect(result.current.selectedClasses.has(2)).toBe(true);
    });
  });

  describe('Bulk visibility operations', () => {
    it('should set bulk visibility successfully', async () => {
      vi.mocked(resultVisibilityService.bulkSetClassVisibility).mockResolvedValue();

      const { result } = renderHook(() => useBulkOperations());

      // Select classes
      act(() => {
        result.current.toggleClassSelection(1);
        result.current.toggleClassSelection(2);
      });

      let bulkResult;
      await act(async () => {
        bulkResult = await result.current.handleBulkSetClassVisibility('open', mockClasses, 'Admin');
      });

      expect(bulkResult).toMatchObject({ success: true });
      expect(bulkResult!.affectedClasses).toHaveLength(2);
      expect(bulkResult!.affectedClasses).toContain('Agility (Novice • A)');
      expect(bulkResult!.affectedClasses).toContain('Jumping (Novice • A)');
      expect(resultVisibilityService.bulkSetClassVisibility).toHaveBeenCalledWith([1, 2], 'open', 'Admin');
      expect(result.current.selectedClasses.size).toBe(0); // Selection cleared after operation
    });

    it('should fail when no classes selected', async () => {
      // Explicitly reset mocks at test start to ensure clean state
      vi.mocked(resultVisibilityService.bulkSetClassVisibility).mockClear();

      const { result } = renderHook(() => useBulkOperations());

      let bulkResult;
      await act(async () => {
        bulkResult = await result.current.handleBulkSetClassVisibility('review', mockClasses, 'Admin');
      });

      expect(bulkResult).toEqual({
        success: false,
        error: 'Please select at least one class to apply visibility settings.'
      });
      expect(resultVisibilityService.bulkSetClassVisibility).not.toHaveBeenCalled();
    });

    it('should handle bulk visibility errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(resultVisibilityService.bulkSetClassVisibility).mockRejectedValue(new Error('Service error'));

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleClassSelection(1);
      });

      let bulkResult;
      await act(async () => {
        bulkResult = await result.current.handleBulkSetClassVisibility('standard', mockClasses, 'Admin');
      });

      expect(bulkResult).toEqual({
        success: false,
        error: 'Service error'
      });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Bulk self check-in operations', () => {
    it('should set bulk self check-in successfully', async () => {
      vi.mocked(resultVisibilityService.bulkSetClassSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useBulkOperations());

      // Select classes
      act(() => {
        result.current.toggleClassSelection(1);
        result.current.toggleClassSelection(3);
      });

      let bulkResult;
      await act(async () => {
        bulkResult = await result.current.handleBulkSetClassSelfCheckin(true, mockClasses, 'Admin');
      });

      expect(bulkResult).toMatchObject({ success: true });
      expect(bulkResult!.affectedClasses).toHaveLength(2);
      expect(bulkResult!.affectedClasses).toContain('Agility (Novice • A)');
      expect(bulkResult!.affectedClasses).toContain('Agility (Open • B)');
      expect(resultVisibilityService.bulkSetClassSelfCheckin).toHaveBeenCalledWith([1, 3], true);
      expect(result.current.selectedClasses.size).toBe(0); // Selection cleared after operation
    });

    it('should fail when no classes selected', async () => {
      // Explicitly reset mocks at test start to ensure clean state
      vi.mocked(resultVisibilityService.bulkSetClassSelfCheckin).mockClear();

      const { result } = renderHook(() => useBulkOperations());

      let bulkResult;
      await act(async () => {
        bulkResult = await result.current.handleBulkSetClassSelfCheckin(false, mockClasses, 'Admin');
      });

      expect(bulkResult).toEqual({
        success: false,
        error: 'Please select at least one class to apply self check-in settings.'
      });
      expect(resultVisibilityService.bulkSetClassSelfCheckin).not.toHaveBeenCalled();
    });

    it('should handle bulk self check-in errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(resultVisibilityService.bulkSetClassSelfCheckin).mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleClassSelection(2);
      });

      let bulkResult;
      await act(async () => {
        bulkResult = await result.current.handleBulkSetClassSelfCheckin(true, mockClasses, 'Admin');
      });

      expect(bulkResult).toEqual({
        success: false,
        error: 'Database error'
      });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Bulk release results operations', () => {
    it('should release results successfully', async () => {
      const { result } = renderHook(() => useBulkOperations());

      // Select classes
      act(() => {
        result.current.toggleClassSelection(1);
        result.current.toggleClassSelection(2);
      });

      let bulkResult;
      await act(async () => {
        bulkResult = await result.current.handleBulkReleaseResults(mockClasses, 'Admin', mockSupabaseClient);
      });

      expect(bulkResult).toMatchObject({ success: true });
      expect(bulkResult!.affectedClasses).toHaveLength(2);
      expect(bulkResult!.affectedClasses).toContain('Agility (Novice • A)');
      expect(bulkResult!.affectedClasses).toContain('Jumping (Novice • A)');
      expect(mockSupabaseClient.from).toHaveBeenCalled();
      expect(result.current.selectedClasses.size).toBe(0); // Selection cleared after operation
    });

    it('should fail when no classes selected', async () => {
      const { result } = renderHook(() => useBulkOperations());

      let bulkResult;
      await act(async () => {
        bulkResult = await result.current.handleBulkReleaseResults(mockClasses, 'Admin', mockSupabaseClient);
      });

      expect(bulkResult).toEqual({
        success: false,
        error: 'Please select at least one class to release results for.'
      });
    });

    it('should handle release results errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock Supabase error
      const failingSupabaseClient = {
        from: vi.fn(() => ({
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.reject(new Error('Database error')))
          }))
        }))
      };

      const { result } = renderHook(() => useBulkOperations());

      act(() => {
        result.current.toggleClassSelection(1);
      });

      let bulkResult;
      await act(async () => {
        bulkResult = await result.current.handleBulkReleaseResults(mockClasses, 'Admin', failingSupabaseClient);
      });

      expect(bulkResult).toEqual({
        success: false,
        error: 'Database error'
      });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete bulk operation workflow', async () => {
      vi.mocked(resultVisibilityService.bulkSetClassVisibility).mockResolvedValue();
      vi.mocked(resultVisibilityService.bulkSetClassSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useBulkOperations());

      // 1. Select all classes
      act(() => {
        result.current.selectAllClasses(mockClasses);
      });
      expect(result.current.selectedClasses.size).toBe(3);

      // 2. Apply visibility to all
      await act(async () => {
        const result1 = await result.current.handleBulkSetClassVisibility('open', mockClasses, 'Admin');
        expect(result1.success).toBe(true);
      });
      expect(result.current.selectedClasses.size).toBe(0); // Cleared

      // 3. Select subset of classes
      act(() => {
        result.current.toggleClassSelection(1);
        result.current.toggleClassSelection(2);
      });

      // 4. Enable self check-in for subset
      await act(async () => {
        const result2 = await result.current.handleBulkSetClassSelfCheckin(true, mockClasses, 'Admin');
        expect(result2.success).toBe(true);
      });
      expect(result.current.selectedClasses.size).toBe(0); // Cleared
    });

    it('should maintain selection across failed operations', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(resultVisibilityService.bulkSetClassVisibility).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useBulkOperations());

      // Select classes
      act(() => {
        result.current.toggleClassSelection(1);
        result.current.toggleClassSelection(2);
      });

      // Failed operation
      await act(async () => {
        const result1 = await result.current.handleBulkSetClassVisibility('review', mockClasses, 'Admin');
        expect(result1.success).toBe(false);
      });

      // Selection should still be there (not cleared on failure)
      expect(result.current.selectedClasses.size).toBe(2);

      consoleErrorSpy.mockRestore();
    });

    it('should handle mixed operations on different selections', async () => {
      vi.mocked(resultVisibilityService.bulkSetClassVisibility).mockResolvedValue();
      vi.mocked(resultVisibilityService.bulkSetClassSelfCheckin).mockResolvedValue();

      const { result } = renderHook(() => useBulkOperations());

      // Operation 1: Apply visibility to classes 1 and 2
      act(() => {
        result.current.setSelectedClasses(new Set([1, 2]));
      });
      await act(async () => {
        const result1 = await result.current.handleBulkSetClassVisibility('standard', mockClasses, 'Admin');
        expect(result1.success).toBe(true);
        expect(result1.affectedClasses).toHaveLength(2);
      });

      // Operation 2: Enable check-in for class 3 only
      act(() => {
        result.current.setSelectedClasses(new Set([3]));
      });
      await act(async () => {
        const result2 = await result.current.handleBulkSetClassSelfCheckin(true, mockClasses, 'Admin');
        expect(result2.success).toBe(true);
        expect(result2.affectedClasses).toHaveLength(1);
        expect(result2.affectedClasses).toContain('Agility (Open • B)');
      });
    });
  });
});
