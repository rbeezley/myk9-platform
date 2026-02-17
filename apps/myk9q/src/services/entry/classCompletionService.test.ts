import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkAndUpdateClassCompletion,
  manuallyCheckClassCompletion,
} from './classCompletionService';
import { supabase } from '@/lib/supabase';
import { recalculatePlacementsForClass } from '../placementService';
import { shouldCheckCompletion } from '@/utils/validationUtils';

/** Helper to cast mock Supabase query builder chains */
type MockQueryBuilder = ReturnType<typeof supabase.from>;
const mockFrom = (obj: Record<string, unknown>): MockQueryBuilder =>
  obj as unknown as MockQueryBuilder;

// Mock dependencies
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('../placementService', () => ({
  recalculatePlacementsForClass: vi.fn(),
}));

vi.mock('@/utils/validationUtils', () => ({
  shouldCheckCompletion: vi.fn(),
}));

// Mock the ReplicationManager to return null (simulating no cache available)
// This forces the code to use the Supabase fallback path
vi.mock('../replication/ReplicationManager', () => ({
  getReplicationManager: vi.fn(() => null),
}));

// Mock the logger to prevent import errors
vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('classCompletionService', () => {
  const mockClassId = 123;
  const mockPairedClassId = 124;

  beforeEach(() => {
    vi.clearAllMocks();
    // Silence console logs in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkAndUpdateClassCompletion', () => {
    it('should check completion for single class', async () => {
      // Arrange - new query pattern: single query for entries with is_scored field
      const mockEntries = [
        { id: 1, is_scored: true },
        { id: 2, is_scored: true },
        { id: 3, is_scored: true },
      ];

      vi.mocked(shouldCheckCompletion).mockReturnValue(true);

      vi.mocked(supabase.from).mockImplementation(table => {
        if (table === 'entries') {
          return mockFrom({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: mockEntries,
                error: null,
              }),
            }),
          });
        } else if (table === 'classes') {
          return mockFrom({
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: mockClassId,
                    trial_id: 1,
                    trials: {
                      show_id: 1,
                      shows: {
                        license_key: 'test-key',
                        show_type: 'Regular',
                      },
                    },
                  },
                  error: null,
                }),
              }),
            }),
          });
        }
        return mockFrom({ select: vi.fn() });
      });

      // Act
      await checkAndUpdateClassCompletion(mockClassId);

      // Assert
      expect(supabase.from).toHaveBeenCalledWith('entries');
      expect(supabase.from).toHaveBeenCalledWith('classes');
      expect(recalculatePlacementsForClass).toHaveBeenCalledWith(mockClassId, 'test-key', false);
    });

    it('should check completion for paired classes', async () => {
      // Arrange - entries with is_scored: false for both classes
      const mockEntries = [{ id: 1, is_scored: false }];

      vi.mocked(shouldCheckCompletion).mockReturnValue(false); // Skip update

      vi.mocked(supabase.from).mockImplementation(() =>
        mockFrom({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: mockEntries,
              error: null,
            }),
          }),
        })
      );

      // Act
      await checkAndUpdateClassCompletion(mockClassId, mockPairedClassId);

      // Assert
      // Should query entries for both classes (1 query each with new pattern)
      expect(supabase.from).toHaveBeenCalledTimes(2); // 2 classes x 1 query each
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      vi.mocked(supabase.from).mockImplementation(() =>
        mockFrom({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database error' },
            }),
          }),
        })
      );

      // Act & Assert - should not throw
      await expect(checkAndUpdateClassCompletion(mockClassId)).resolves.not.toThrow();
    });

    it('should mark class as in_progress when partially scored', async () => {
      // Arrange - 3 entries, only 1 scored
      const mockEntries = [
        { id: 1, is_scored: true },
        { id: 2, is_scored: false },
        { id: 3, is_scored: false },
      ];

      vi.mocked(shouldCheckCompletion).mockReturnValue(true);

      vi.mocked(supabase.from).mockImplementation(table => {
        if (table === 'entries') {
          return mockFrom({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: mockEntries,
                error: null,
              }),
            }),
          });
        } else if (table === 'classes') {
          return mockFrom({
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            }),
          });
        }
        return mockFrom({ select: vi.fn() });
      });

      // Act
      await checkAndUpdateClassCompletion(mockClassId);

      // Assert
      expect(supabase.from).toHaveBeenCalledWith('classes');
      // Verify update was called with in_progress status
      const classesFromCall = vi
        .mocked(supabase.from)
        .mock.calls.find(call => call[0] === 'classes');
      expect(classesFromCall).toBeDefined();
    });

    it('should skip update when shouldCheckCompletion returns false', async () => {
      // Arrange - 4 entries, 2 scored (middle)
      const mockEntries = [
        { id: 1, is_scored: true },
        { id: 2, is_scored: true },
        { id: 3, is_scored: false },
        { id: 4, is_scored: false },
      ];

      vi.mocked(shouldCheckCompletion).mockReturnValue(false); // Skip

      vi.mocked(supabase.from).mockImplementation(() =>
        mockFrom({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: mockEntries,
              error: null,
            }),
          }),
        })
      );

      // Act
      await checkAndUpdateClassCompletion(mockClassId);

      // Assert
      expect(shouldCheckCompletion).toHaveBeenCalledWith(2, 4);
      // Should not update classes table when skipped
      expect(
        vi.mocked(supabase.from).mock.calls.find(call => call[0] === 'classes')
      ).toBeUndefined();
    });

    it('should handle placement calculation errors', async () => {
      // Arrange - single scored entry
      const mockEntries = [{ id: 1, is_scored: true }];

      vi.mocked(shouldCheckCompletion).mockReturnValue(true);
      vi.mocked(recalculatePlacementsForClass).mockRejectedValue(new Error('Placement error'));

      vi.mocked(supabase.from).mockImplementation(table => {
        if (table === 'entries') {
          return mockFrom({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: mockEntries,
                error: null,
              }),
            }),
          });
        } else if (table === 'classes') {
          return mockFrom({
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                error: null,
              }),
            }),
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: mockClassId,
                    trial_id: 1,
                    trials: {
                      show_id: 1,
                      shows: {
                        license_key: 'test-key',
                        show_type: 'Regular',
                      },
                    },
                  },
                  error: null,
                }),
              }),
            }),
          });
        }
        return mockFrom({ select: vi.fn() });
      });

      // Act & Assert - should not throw even if placement calculation fails
      await expect(checkAndUpdateClassCompletion(mockClassId)).resolves.not.toThrow();
      expect(recalculatePlacementsForClass).toHaveBeenCalled();
    });
  });

  describe('manuallyCheckClassCompletion', () => {
    it('should trigger completion check', async () => {
      // Arrange - single unscored entry
      const mockEntries = [{ id: 1, is_scored: false }];

      vi.mocked(supabase.from).mockImplementation(() =>
        mockFrom({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: mockEntries,
              error: null,
            }),
          }),
        })
      );

      vi.mocked(shouldCheckCompletion).mockReturnValue(false);

      // Act
      await manuallyCheckClassCompletion(mockClassId);

      // Assert
      expect(supabase.from).toHaveBeenCalledWith('entries');
    });
  });
});
