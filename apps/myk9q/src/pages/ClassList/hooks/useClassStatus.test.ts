/**
 * Tests for useClassStatus Hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { useClassStatus, type StatusDependencies } from './useClassStatus';
import type { ClassEntry } from './useClassListData';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase client
const createMockSupabaseClient = () => ({
  from: vi.fn(() => ({
    update: vi.fn(() => ({
      in: vi.fn(() => Promise.resolve({ data: null, error: null }))
    }))
  }))
});

// Sample test data
const mockClasses: ClassEntry[] = [
  {
    id: 1,
    trial_id: 1,
    element: 'Agility',
    level: 'Novice',
    section: 'A',
    class_name: 'Novice A Agility',
    class_order: 1,
    judge_name: 'Judge Smith',
    entry_count: 0,
    completed_count: 0,
    class_status: 'no-status',
    is_scoring_finalized: false,
    is_favorite: false,
    trial_date: '2025-01-20',
    trial_number: 1,
    pairedClassId: 2, // Paired with class 2
    dogs: [],
  } as ClassEntry,
  {
    id: 2,
    trial_id: 1,
    element: 'Agility',
    level: 'Novice',
    section: 'B',
    class_name: 'Novice B Agility',
    class_order: 2,
    judge_name: 'Judge Smith',
    entry_count: 0,
    completed_count: 0,
    class_status: 'no-status',
    is_scoring_finalized: false,
    is_favorite: false,
    trial_date: '2025-01-20',
    trial_number: 1,
    pairedClassId: 1, // Paired with class 1
    dogs: [],
  } as ClassEntry,
  {
    id: 3,
    trial_id: 1,
    element: 'Jumping',
    level: 'Open',
    section: 'A',
    class_name: 'Open A Jumping',
    class_order: 3,
    judge_name: 'Judge Jones',
    entry_count: 0,
    completed_count: 0,
    class_status: 'no-status',
    is_scoring_finalized: false,
    is_favorite: false,
    trial_date: '2025-01-20',
    trial_number: 1,
    pairedClassId: undefined, // No pairing
    dogs: [],
  } as ClassEntry,
];

describe('useClassStatus', () => {
  let mockSetClasses: ReturnType<typeof vi.fn>;
  let mockRefetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetClasses = vi.fn((updater) => {
      // Simulate state update if updater is a function
      if (typeof updater === 'function') {
        updater(mockClasses);
      }
    });
    mockRefetch = vi.fn().mockResolvedValue(undefined);
  });

  // Helper to create deps object for tests
  const createDeps = (supabaseClient: ReturnType<typeof createMockSupabaseClient>): StatusDependencies => ({
    classes: mockClasses,
    setClasses: mockSetClasses,
    supabaseClient: supabaseClient as unknown as SupabaseClient,
    refetch: mockRefetch
  });

  describe('Initialization', () => {
    it('should initialize with closed dialog', () => {
      const { result } = renderHook(() => useClassStatus());

      expect(result.current.statusDialogOpen).toBe(false);
      expect(result.current.selectedClassForStatus).toBe(null);
    });

    it('should provide all required methods', () => {
      const { result } = renderHook(() => useClassStatus());

      expect(typeof result.current.setStatusDialogOpen).toBe('function');
      expect(typeof result.current.setSelectedClassForStatus).toBe('function');
      expect(typeof result.current.handleStatusChange).toBe('function');
      expect(typeof result.current.handleStatusChangeWithTime).toBe('function');
    });
  });

  describe('Dialog state management', () => {
    it('should open status dialog', () => {
      const { result } = renderHook(() => useClassStatus());

      act(() => {
        result.current.setStatusDialogOpen(true);
      });

      expect(result.current.statusDialogOpen).toBe(true);
    });

    it('should close status dialog', () => {
      const { result } = renderHook(() => useClassStatus());

      act(() => {
        result.current.setStatusDialogOpen(true);
      });
      expect(result.current.statusDialogOpen).toBe(true);

      act(() => {
        result.current.setStatusDialogOpen(false);
      });
      expect(result.current.statusDialogOpen).toBe(false);
    });

    it('should set selected class for status', () => {
      const { result } = renderHook(() => useClassStatus());

      act(() => {
        result.current.setSelectedClassForStatus(mockClasses[0]);
      });

      expect(result.current.selectedClassForStatus).toEqual(mockClasses[0]);
    });

    it('should clear selected class', () => {
      const { result } = renderHook(() => useClassStatus());

      act(() => {
        result.current.setSelectedClassForStatus(mockClasses[0]);
      });
      expect(result.current.selectedClassForStatus).not.toBe(null);

      act(() => {
        result.current.setSelectedClassForStatus(null);
      });
      expect(result.current.selectedClassForStatus).toBe(null);
    });
  });

  describe('Status change without time', () => {
    it('should update single class status successfully', async () => {
      const mockSupabase = createMockSupabaseClient();
      const { result } = renderHook(() => useClassStatus());

      let statusResult;
      await act(async () => {
        statusResult = await result.current.handleStatusChange(
          3, // Class without pairing
          'in_progress',
          createDeps(mockSupabase)
        );
      });

      expect(statusResult).toEqual({ success: true });
      expect(mockSetClasses).toHaveBeenCalled();
      expect(mockSupabase.from).toHaveBeenCalledWith('classes');
      expect(result.current.statusDialogOpen).toBe(false);
      expect(result.current.selectedClassForStatus).toBe(null);
    });

    it('should update paired classes together', async () => {
      const mockSupabase = createMockSupabaseClient();
      const { result } = renderHook(() => useClassStatus());

      await act(async () => {
        await result.current.handleStatusChange(
          1, // Class with pairing (paired with 2)
          'completed',
          createDeps(mockSupabase)
        );
      });

      // Should update both class 1 and 2
      expect(mockSetClasses).toHaveBeenCalled();
      const updateCall = mockSetClasses.mock.calls[0][0];
      const updatedClasses = updateCall(mockClasses);

      // Both paired classes should have new status
      expect(updatedClasses.find((c: ClassEntry) => c.id === 1)?.class_status).toBe('completed');
      expect(updatedClasses.find((c: ClassEntry) => c.id === 2)?.class_status).toBe('completed');
    });

    it('should convert no-status to null for database', async () => {
      const mockSupabase = createMockSupabaseClient();
      const updateSpy = vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ error: null })) }));
      mockSupabase.from = vi.fn(() => ({ update: updateSpy }));

      const { result } = renderHook(() => useClassStatus());

      await act(async () => {
        await result.current.handleStatusChange(
          3,
          'no-status',
          createDeps(mockSupabase)
        );
      });

      expect(updateSpy).toHaveBeenCalledWith({ class_status: null });
    });

    it('should handle database errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockSupabase = createMockSupabaseClient();
      mockSupabase.from = vi.fn(() => ({
        update: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ error: { message: 'Database error' } }))
        }))
      }));

      const { result } = renderHook(() => useClassStatus());

      let statusResult;
      await act(async () => {
        statusResult = await result.current.handleStatusChange(
          3,
          'in_progress',
          createDeps(mockSupabase)
        );
      });

      expect(statusResult).toEqual({
        success: false,
        error: 'Database error'
      });
      expect(mockRefetch).toHaveBeenCalled(); // Should revert
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should close dialog after successful update', async () => {
      const mockSupabase = createMockSupabaseClient();
      const { result } = renderHook(() => useClassStatus());

      // Open dialog first
      act(() => {
        result.current.setStatusDialogOpen(true);
        result.current.setSelectedClassForStatus(mockClasses[0]);
      });

      await act(async () => {
        await result.current.handleStatusChange(
          1,
          'completed',
          createDeps(mockSupabase)
        );
      });

      expect(result.current.statusDialogOpen).toBe(false);
      expect(result.current.selectedClassForStatus).toBe(null);
    });
  });

  describe('Status change with time', () => {
    it('should update status with briefing time', async () => {
      const mockSupabase = createMockSupabaseClient();
      const updateSpy = vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ error: null })) }));
      mockSupabase.from = vi.fn(() => ({ update: updateSpy }));

      const { result } = renderHook(() => useClassStatus());

      await act(async () => {
        await result.current.handleStatusChangeWithTime(
          3,
          'briefing',
          '08:00',
          createDeps(mockSupabase)
        );
      });

      expect(updateSpy).toHaveBeenCalledWith({
        class_status: 'briefing',
        briefing_time: '08:00'
      });
    });

    it('should update status with break time', async () => {
      const mockSupabase = createMockSupabaseClient();
      const updateSpy = vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ error: null })) }));
      mockSupabase.from = vi.fn(() => ({ update: updateSpy }));

      const { result } = renderHook(() => useClassStatus());

      await act(async () => {
        await result.current.handleStatusChangeWithTime(
          3,
          'break',
          '10:30',
          createDeps(mockSupabase)
        );
      });

      expect(updateSpy).toHaveBeenCalledWith({
        class_status: 'break',
        break_until: '10:30'
      });
    });

    it('should update status with start time', async () => {
      const mockSupabase = createMockSupabaseClient();
      const updateSpy = vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ error: null })) }));
      mockSupabase.from = vi.fn(() => ({ update: updateSpy }));

      const { result } = renderHook(() => useClassStatus());

      await act(async () => {
        await result.current.handleStatusChangeWithTime(
          3,
          'start_time',
          '09:00',
          createDeps(mockSupabase)
        );
      });

      expect(updateSpy).toHaveBeenCalledWith({
        class_status: 'start_time',
        start_time: '09:00'
      });
    });

    it('should update local state with time value', async () => {
      const mockSupabase = createMockSupabaseClient();
      const { result } = renderHook(() => useClassStatus());

      await act(async () => {
        await result.current.handleStatusChangeWithTime(
          3,
          'briefing',
          '08:00',
          createDeps(mockSupabase)
        );
      });

      const updateCall = mockSetClasses.mock.calls[0][0];
      const updatedClasses = updateCall(mockClasses);
      const updatedClass = updatedClasses.find((c: ClassEntry) => c.id === 3);

      expect(updatedClass?.class_status).toBe('briefing');
      expect(updatedClass?.briefing_time).toBe('08:00');
    });

    it('should handle paired classes with time', async () => {
      const mockSupabase = createMockSupabaseClient();
      const { result } = renderHook(() => useClassStatus());

      await act(async () => {
        await result.current.handleStatusChangeWithTime(
          1, // Paired with class 2
          'break',
          '11:00',
          createDeps(mockSupabase)
        );
      });

      const updateCall = mockSetClasses.mock.calls[0][0];
      const updatedClasses = updateCall(mockClasses);

      // Both paired classes should be updated
      expect(updatedClasses.find((c: ClassEntry) => c.id === 1)?.break_until).toBe('11:00');
      expect(updatedClasses.find((c: ClassEntry) => c.id === 2)?.break_until).toBe('11:00');
    });

    it('should handle time update errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockSupabase = createMockSupabaseClient();
      mockSupabase.from = vi.fn(() => ({
        update: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ error: { message: 'Time update failed' } }))
        }))
      }));

      const { result } = renderHook(() => useClassStatus());

      let statusResult;
      await act(async () => {
        statusResult = await result.current.handleStatusChangeWithTime(
          3,
          'briefing',
          '08:00',
          createDeps(mockSupabase)
        );
      });

      expect(statusResult).toEqual({
        success: false,
        error: 'Time update failed'
      });
      expect(mockRefetch).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete class workflow', async () => {
      const mockSupabase = createMockSupabaseClient();
      const { result } = renderHook(() => useClassStatus());
      const deps = createDeps(mockSupabase);

      // 1. Open dialog
      act(() => {
        result.current.setStatusDialogOpen(true);
        result.current.setSelectedClassForStatus(mockClasses[0]);
      });

      // 2. Set briefing with time
      await act(async () => {
        const result1 = await result.current.handleStatusChangeWithTime(
          1,
          'briefing',
          '08:00',
          deps
        );
        expect(result1.success).toBe(true);
      });
      expect(result.current.statusDialogOpen).toBe(false);

      // 3. Change to in_progress
      await act(async () => {
        const result2 = await result.current.handleStatusChange(
          1,
          'in_progress',
          deps
        );
        expect(result2.success).toBe(true);
      });

      // 4. Mark as completed
      await act(async () => {
        const result3 = await result.current.handleStatusChange(
          1,
          'completed',
          deps
        );
        expect(result3.success).toBe(true);
      });
    });

    it('should recover from errors and retry', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First call fails
      const failingSupabase = createMockSupabaseClient();
      failingSupabase.from = vi.fn(() => ({
        update: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ error: { message: 'Network error' } }))
        }))
      }));

      const { result } = renderHook(() => useClassStatus());

      await act(async () => {
        const result1 = await result.current.handleStatusChange(
          3,
          'completed',
          createDeps(failingSupabase)
        );
        expect(result1.success).toBe(false);
      });

      // Second call succeeds
      const successSupabase = createMockSupabaseClient();

      await act(async () => {
        const result2 = await result.current.handleStatusChange(
          3,
          'completed',
          createDeps(successSupabase)
        );
        expect(result2.success).toBe(true);
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
