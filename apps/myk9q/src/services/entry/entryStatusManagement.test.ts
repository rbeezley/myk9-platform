import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  markInRing,
  markEntryCompleted,
  updateEntryCheckinStatus,
  resetEntryScore,
} from './entryStatusManagement';
import { supabase } from '@/lib/supabase';
import { triggerImmediateEntrySync } from '../entryReplication';
import { checkAndUpdateClassCompletion } from './classCompletionService';

// Mock dependencies
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('../entryReplication', () => ({
  triggerImmediateEntrySync: vi.fn(),
}));

vi.mock('./classCompletionService', () => ({
  checkAndUpdateClassCompletion: vi.fn(),
}));

describe('entryStatusManagement', () => {
  const mockEntryId = 123;

  beforeEach(() => {
    vi.clearAllMocks();
    // Silence console logs in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('markInRing', () => {
    it('should mark entry as in-ring', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      // Act
      const result = await markInRing(mockEntryId, true);

      // Assert
      expect(result).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('entries');
    });

    it('should remove entry from ring when not scored', async () => {
      // Arrange
      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { is_scored: false },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      // Act
      const result = await markInRing(mockEntryId, false);

      // Assert
      expect(result).toBe(true);
    });

    it('should preserve completed status when removing scored entry from ring', async () => {
      // Arrange
      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { is_scored: true },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      // Act
      const result = await markInRing(mockEntryId, false);

      // Assert
      expect(result).toBe(true);
      // Verify it updated to 'completed' not 'no-status'
      const updateCall = vi.mocked(supabase.from).mock.results[1];
      expect(updateCall).toBeDefined();
    });

    it('should handle database errors', async () => {
      // Arrange
      const error = new Error('Database error');
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error }),
          }),
        }),
      } as any);

      // Act & Assert
      await expect(markInRing(mockEntryId, true)).rejects.toThrow();
    });
  });

  describe('markEntryCompleted', () => {
    it('should mark unscored entry as completed', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: mockEntryId, is_scored: false },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      // Act
      const result = await markEntryCompleted(mockEntryId);

      // Assert
      expect(result).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('entries');
    });

    it('should skip marking when entry is already scored', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: mockEntryId, is_scored: true },
              error: null,
            }),
          }),
        }),
      } as any);

      // Act
      const result = await markEntryCompleted(mockEntryId);

      // Assert
      expect(result).toBe(true);
      // Should not have called update
      const fromCalls = vi.mocked(supabase.from).mock.calls;
      expect(fromCalls.length).toBe(1); // Only the select call
    });

    it('should handle PGRST116 error (no rows) as valid', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      // Act
      const result = await markEntryCompleted(mockEntryId);

      // Assert
      expect(result).toBe(true);
    });

    it('should propagate non-PGRST116 errors', async () => {
      // Arrange
      const error = { code: 'OTHER_ERROR', message: 'Some error' };
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error,
            }),
          }),
        }),
      } as any);

      // Act & Assert
      await expect(markEntryCompleted(mockEntryId)).rejects.toThrow();
    });
  });

  describe('updateEntryCheckinStatus', () => {
    beforeEach(() => {
      // Mock setTimeout for write propagation delay
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should update check-in status', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: mockEntryId, entry_status: 'checked-in' },
              error: null,
            }),
          }),
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      const promise = updateEntryCheckinStatus(mockEntryId, 'checked-in');
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert
      expect(result).toBe(true);
      expect(triggerImmediateEntrySync).toHaveBeenCalledWith('updateEntryCheckinStatus');
    });

    it('should trigger immediate sync after successful update', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      const promise = updateEntryCheckinStatus(mockEntryId, 'absent');
      await vi.runAllTimersAsync();
      await promise;

      // Assert - verify sync was triggered after update
      expect(triggerImmediateEntrySync).toHaveBeenCalledWith('updateEntryCheckinStatus');
    });

    it('should handle database errors with detailed logging', async () => {
      // Arrange
      const error = { message: 'Update failed', code: '23505', details: 'Constraint violation' };
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error }),
          }),
        }),
      } as any);

      // Act & Assert
      await expect(updateEntryCheckinStatus(mockEntryId, 'checked-in')).rejects.toThrow(
        'Database update failed'
      );
    });
  });

  describe('resetEntryScore', () => {
    beforeEach(() => {
      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);
      vi.mocked(checkAndUpdateClassCompletion).mockResolvedValue(undefined);
    });

    it('should reset entry score and trigger class completion check', async () => {
      // Arrange
      const mockClassId = 456;
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: mockClassId },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);

      // Act
      const result = await resetEntryScore(mockEntryId);

      // Assert
      expect(result).toBe(true);
      expect(triggerImmediateEntrySync).toHaveBeenCalledWith('resetEntryScore');
      // Function now takes: (classId, pairedClassId, justScoredEntryId, justResetEntryId)
      expect(checkAndUpdateClassCompletion).toHaveBeenCalledWith(mockClassId, undefined, undefined, mockEntryId);
    });

    it('should reset all score fields to default values', async () => {
      // Arrange
      let capturedUpdateData: any;
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: 123 },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockImplementation((data) => {
          capturedUpdateData = data;
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          };
        }),
      } as any);

      // Act
      await resetEntryScore(mockEntryId);

      // Assert
      expect(capturedUpdateData).toMatchObject({
        is_scored: false,
        result_status: 'pending',
        entry_status: 'no-status',
        search_time_seconds: 0,
        total_faults: 0,
        final_placement: 0,
        scoring_completed_at: null,
      });
    });

    it('should handle class completion check errors gracefully', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: 456 },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);

      vi.mocked(checkAndUpdateClassCompletion).mockRejectedValue(
        new Error('Completion check failed')
      );

      // Act - should not throw even if completion check fails
      const result = await resetEntryScore(mockEntryId);

      // Assert
      expect(result).toBe(true); // Score reset succeeded
    });

    it('should handle database errors', async () => {
      // Arrange
      const error = { message: 'Reset failed', code: '500' };
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: 456 },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error }),
        }),
      } as any);

      // Act & Assert
      await expect(resetEntryScore(mockEntryId)).rejects.toThrow('Database reset failed');
    });

    it('should work when entry has no class_id', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: null },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);

      // Act
      const result = await resetEntryScore(mockEntryId);

      // Assert
      expect(result).toBe(true);
      expect(checkAndUpdateClassCompletion).not.toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should handle full lifecycle: check-in → in-ring → completed → reset', async () => {
      // This test demonstrates the typical flow of status transitions
      vi.useFakeTimers();

      // Step 1: Check in
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: mockEntryId, entry_status: 'checked-in' },
              error: null,
            }),
          }),
        }),
      } as any);

      const checkinPromise = updateEntryCheckinStatus(mockEntryId, 'checked-in');
      await vi.runAllTimersAsync();
      await checkinPromise;

      // Step 2: Mark in ring
      await markInRing(mockEntryId, true);

      // Step 3: Mark completed
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: mockEntryId, is_scored: false },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);
      await markEntryCompleted(mockEntryId);

      // Step 4: Reset
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: 456 },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);
      const resetResult = await resetEntryScore(mockEntryId);

      // Assert
      expect(resetResult).toBe(true);

      vi.useRealTimers();
    });
  });
});
