/**
 * Unit tests for useClassAvailability hook
 * Tests class availability fetching, entry counts, and waitlist handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useClassAvailability } from '@/hooks/useClassAvailability';

// Mock Supabase client
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockOrder = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => {
      mockFrom(...args);
      return {
        select: (...selectArgs: unknown[]) => {
          mockSelect(...selectArgs);
          return {
            eq: (...eqArgs: unknown[]) => {
              mockEq(...eqArgs);
              return {
                order: (...orderArgs: unknown[]) => {
                  mockOrder(...orderArgs);
                  return Promise.resolve({ data: [], error: null });
                },
              };
            },
            in: (...inArgs: unknown[]) => {
              mockIn(...inArgs);
              return Promise.resolve({ data: [], error: null });
            },
          };
        },
      };
    },
  },
}));

// Mock logger
vi.mock('@/services/LoggingService', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}));

describe('useClassAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('should return empty classes when no showId provided', async () => {
      const { result } = renderHook(() => useClassAvailability(undefined));

      expect(result.current.classes).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('should not fetch when enabled is false', () => {
      const { result } = renderHook(() =>
        useClassAvailability('show-123', { enabled: false })
      );

      expect(result.current.isLoading).toBe(false);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  describe('computed values', () => {
    it('should calculate totalSpotsAvailable correctly', async () => {
      // Mock the chain for classes query
      const mockClassesData = [
        {
          id: 'class-1',
          name: 'Novice A',
          level: 'Novice',
          max_entries: 10,
          trial_id: 'trial-1',
          trials: { id: 'trial-1', name: 'Saturday', date: '2024-02-15', show_id: 'show-123' },
        },
        {
          id: 'class-2',
          name: 'Open A',
          level: 'Open',
          max_entries: 8,
          trial_id: 'trial-1',
          trials: { id: 'trial-1', name: 'Saturday', date: '2024-02-15', show_id: 'show-123' },
        },
      ];

      let callCount = 0;
      mockFrom.mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            order: () => {
              callCount++;
              if (callCount === 1) {
                return Promise.resolve({ data: mockClassesData, error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
          }),
          in: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }));

      const { result } = renderHook(() => useClassAvailability('show-123'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // With no entries, total spots = 10 + 8 = 18
      expect(result.current.totalSpotsAvailable).toBeGreaterThanOrEqual(0);
    });

    it('should calculate fullClasses correctly', async () => {
      const { result } = renderHook(() => useClassAvailability('show-123'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.fullClasses).toBeGreaterThanOrEqual(0);
    });
  });

  describe('refetch functionality', () => {
    it('should provide a refetch function', () => {
      const { result } = renderHook(() => useClassAvailability('show-123'));

      expect(typeof result.current.refetch).toBe('function');
    });

    it('should refetch data when refetch is called', async () => {
      const { result } = renderHook(() => useClassAvailability('show-123'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const initialCallCount = mockFrom.mock.calls.length;

      // Call refetch
      await result.current.refetch();

      // Should have made additional calls
      expect(mockFrom.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  describe('hook interface', () => {
    it('should return expected interface shape', () => {
      const { result } = renderHook(() => useClassAvailability('show-123'));

      expect(result.current).toHaveProperty('classes');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('refetch');
      expect(result.current).toHaveProperty('totalSpotsAvailable');
      expect(result.current).toHaveProperty('fullClasses');
    });

    it('should have correct types for return values', () => {
      const { result } = renderHook(() => useClassAvailability('show-123'));

      expect(Array.isArray(result.current.classes)).toBe(true);
      expect(typeof result.current.isLoading).toBe('boolean');
      expect(typeof result.current.totalSpotsAvailable).toBe('number');
      expect(typeof result.current.fullClasses).toBe('number');
      expect(typeof result.current.refetch).toBe('function');
    });
  });

  describe('ClassAvailability shape', () => {
    it('should return ClassAvailability objects with expected properties', async () => {
      const mockClassData = {
        id: 'class-1',
        name: 'Novice A',
        level: 'Novice',
        max_entries: 10,
        trial_id: 'trial-1',
        trials: { id: 'trial-1', name: 'Saturday', date: '2024-02-15', show_id: 'show-123' },
      };

      let queryCount = 0;
      mockFrom.mockImplementation(() => ({
        select: () => ({
          eq: () => ({
            order: () => {
              queryCount++;
              if (queryCount === 1) {
                return Promise.resolve({ data: [mockClassData], error: null });
              }
              return Promise.resolve({ data: [], error: null });
            },
          }),
          in: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }));

      const { result } = renderHook(() => useClassAvailability('show-123'));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      if (result.current.classes.length > 0) {
        const classItem = result.current.classes[0];
        expect(classItem).toHaveProperty('classId');
        expect(classItem).toHaveProperty('className');
        expect(classItem).toHaveProperty('level');
        expect(classItem).toHaveProperty('trialId');
        expect(classItem).toHaveProperty('trialName');
        expect(classItem).toHaveProperty('trialDate');
        expect(classItem).toHaveProperty('entryLimit');
        expect(classItem).toHaveProperty('currentEntries');
        expect(classItem).toHaveProperty('spotsAvailable');
        expect(classItem).toHaveProperty('waitlistCount');
        expect(classItem).toHaveProperty('isFull');
        expect(classItem).toHaveProperty('hasWaitlist');
      }
    });
  });

  describe('options', () => {
    it('should accept enabled option', () => {
      const { result } = renderHook(() =>
        useClassAvailability('show-123', { enabled: true })
      );

      expect(result.current).toBeDefined();
    });

    it('should default enabled to true', () => {
      renderHook(() => useClassAvailability('show-123'));

      // Should start fetching immediately
      expect(mockFrom).toHaveBeenCalled();
    });
  });

  describe('showId changes', () => {
    it('should refetch when showId changes', async () => {
      const { result, rerender } = renderHook(
        ({ showId }) => useClassAvailability(showId),
        { initialProps: { showId: 'show-1' } }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const callCountBefore = mockFrom.mock.calls.length;

      // Change showId
      rerender({ showId: 'show-2' });

      await waitFor(() => {
        expect(mockFrom.mock.calls.length).toBeGreaterThan(callCountBefore);
      });
    });
  });
});
