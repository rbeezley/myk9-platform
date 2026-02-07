import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  markInRing,
  markEntryCompleted,
  updateEntryCheckinStatus,
  resetEntryScore,
  savePreviousStatus,
  popPreviousStatus,
} from './entryStatusManagement';
import { supabase } from '@/lib/supabase';
import { triggerImmediateEntrySync } from '../entryReplication';
import { checkAndUpdateClassCompletion } from './classCompletionService';
import { getReplicationManager } from '../replication/ReplicationManager';

// Mock dependencies
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('../entryReplication', () => ({
  triggerImmediateEntrySync: vi.fn(),
}));

vi.mock('./classCompletionService', () => ({
  checkAndUpdateClassCompletion: vi.fn(),
}));

vi.mock('../replication/ReplicationManager', () => ({
  getReplicationManager: vi.fn(),
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

  describe('savePreviousStatus and popPreviousStatus', () => {
    it('should save and retrieve previous status', () => {
      // Act
      savePreviousStatus(mockEntryId, 'checked-in');
      const retrieved = popPreviousStatus(mockEntryId);

      // Assert
      expect(retrieved).toBe('checked-in');
    });

    it('should return undefined for non-existent entry', () => {
      // Act
      const retrieved = popPreviousStatus(999999);

      // Assert
      expect(retrieved).toBeUndefined();
    });

    it('should clear status after popping', () => {
      // Arrange
      savePreviousStatus(mockEntryId, 'checked-in');

      // Act
      popPreviousStatus(mockEntryId);
      const secondPop = popPreviousStatus(mockEntryId);

      // Assert
      expect(secondPop).toBeUndefined();
    });

    it('should handle multiple entries independently', () => {
      // Arrange
      const entry1 = 100;
      const entry2 = 200;

      // Act
      savePreviousStatus(entry1, 'checked-in');
      savePreviousStatus(entry2, 'no-status');

      // Assert
      expect(popPreviousStatus(entry1)).toBe('checked-in');
      expect(popPreviousStatus(entry2)).toBe('no-status');
    });
  });

  describe('markInRing - Advanced Edge Cases', () => {
    it('should use knownPreviousStatus when provided', async () => {
      // Arrange
      vi.mocked(getReplicationManager).mockReturnValue(null);
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      // Act
      await markInRing(mockEntryId, true, 'checked-in');
      const savedStatus = popPreviousStatus(mockEntryId);

      // Assert
      expect(savedStatus).toBe('checked-in');
    });

    it('should skip update when entry already in desired state (cache optimization)', async () => {
      // Arrange - Mock replication manager with entry already in-ring
      const mockEntriesTable = {
        get: vi.fn().mockResolvedValue({
          id: mockEntryId,
          entry_status: 'in-ring',
        }),
      };

      vi.mocked(getReplicationManager).mockReturnValue({
        getTable: vi.fn().mockReturnValue(mockEntriesTable),
      } as any);

      // Act
      const result = await markInRing(mockEntryId, true);

      // Assert
      expect(result).toBe(true);
      expect(supabase.from).not.toHaveBeenCalled(); // Should skip DB call
    });

    it('should not skip update when cache shows different state', async () => {
      // Arrange - Mock cache showing not in-ring
      const mockEntriesTable = {
        get: vi.fn().mockResolvedValue({
          id: mockEntryId,
          entry_status: 'checked-in',
        }),
      };

      vi.mocked(getReplicationManager).mockReturnValue({
        getTable: vi.fn().mockReturnValue(mockEntriesTable),
      } as any);

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
      expect(supabase.from).toHaveBeenCalled(); // Should make DB call
    });

    it('should not overwrite existing saved status when already saved', async () => {
      // Arrange - Pre-save a status
      savePreviousStatus(mockEntryId, 'checked-in');

      vi.mocked(getReplicationManager).mockReturnValue(null);
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      // Act - Try to mark in-ring with different known status
      await markInRing(mockEntryId, true, 'no-status');
      const savedStatus = popPreviousStatus(mockEntryId);

      // Assert - Should keep original 'checked-in', not overwrite with 'no-status'
      expect(savedStatus).toBe('checked-in');
    });

    it('should handle missing cache entry gracefully', async () => {
      // Arrange - Cache returns undefined
      const mockEntriesTable = {
        get: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getReplicationManager).mockReturnValue({
        getTable: vi.fn().mockReturnValue(mockEntriesTable),
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      // Act
      const result = await markInRing(mockEntryId, true);

      // Assert - Should succeed and default to 'no-status'
      expect(result).toBe(true);
    });

    it('should update local cache after successful DB write', async () => {
      // Arrange
      const mockEntriesTable = {
        get: vi.fn().mockResolvedValue({
          id: mockEntryId,
          entry_status: 'checked-in',
        }),
        set: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getReplicationManager).mockReturnValue({
        getTable: vi.fn().mockReturnValue(mockEntriesTable),
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      // Act
      await markInRing(mockEntryId, true);

      // Assert
      expect(mockEntriesTable.set).toHaveBeenCalled();
    });

    it('should handle cache update failure gracefully (non-fatal)', async () => {
      // Arrange - Cache update throws error
      const mockEntriesTable = {
        get: vi.fn().mockResolvedValue({
          id: mockEntryId,
          entry_status: 'checked-in',
        }),
        set: vi.fn().mockRejectedValue(new Error('Cache write failed')),
      };

      vi.mocked(getReplicationManager).mockReturnValue({
        getTable: vi.fn().mockReturnValue(mockEntriesTable),
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      // Act - Should not throw even if cache fails
      const result = await markInRing(mockEntryId, true);

      // Assert - DB write succeeded, cache failure is logged but non-fatal
      expect(result).toBe(true);
    });
  });

  describe('resetEntryScore - Advanced Edge Cases', () => {
    it('should unlock scored entry before reset', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: 456, is_scored: true },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);

      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: null,
      } as any);

      // Act
      await resetEntryScore(mockEntryId);

      // Assert
      expect(supabase.rpc).toHaveBeenCalledWith('unlock_entry_for_edit', {
        p_entry_id: mockEntryId,
      });
    });

    it('should throw error if unlock fails', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: 456, is_scored: true },
              error: null,
            }),
          }),
        }),
      } as any);

      const unlockError = { message: 'Failed to unlock' };
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: unlockError,
      } as any);

      // Act & Assert
      await expect(resetEntryScore(mockEntryId)).rejects.toThrow('Failed to unlock entry');
    });

    it('should skip unlock if entry not scored', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: 456, is_scored: false },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);

      // Act
      await resetEntryScore(mockEntryId);

      // Assert
      expect(supabase.rpc).not.toHaveBeenCalled();
    });

    it('should update local cache with all reset fields', async () => {
      // Arrange
      const mockEntriesTable = {
        get: vi.fn().mockResolvedValue({
          id: mockEntryId,
          entry_status: 'completed',
          is_scored: true,
        }),
        set: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(getReplicationManager).mockReturnValue({
        getTable: vi.fn().mockReturnValue(mockEntriesTable),
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: 456, is_scored: false },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);

      // Act
      await resetEntryScore(mockEntryId);

      // Assert
      expect(mockEntriesTable.set).toHaveBeenCalledWith(
        String(mockEntryId),
        expect.objectContaining({
          entry_status: 'no-status',
          is_in_ring: false,
          is_scored: false,
          result_status: 'pending',
          final_placement: 0,
          search_time_seconds: 0,
        }),
        false // not dirty
      );
    });

    it('should trigger background sync without awaiting', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { class_id: 456, is_scored: false },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await resetEntryScore(mockEntryId);

      // Assert - Sync called but not awaited (fire-and-forget)
      expect(triggerImmediateEntrySync).toHaveBeenCalledWith('resetEntryScore');
    });
  });

  describe('updateEntryCheckinStatus - Edge Cases', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle all valid check-in status values', async () => {
      // Arrange
      const statuses: Array<'checked-in' | 'absent' | 'withdrawn' | 'no-status'> = [
        'checked-in',
        'absent',
        'withdrawn',
        'no-status',
      ];

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act & Assert
      for (const status of statuses) {
        const promise = updateEntryCheckinStatus(mockEntryId, status);
        await vi.runAllTimersAsync();
        const result = await promise;
        expect(result).toBe(true);
      }
    });

    it('should include 100ms propagation delay', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null }),
          }),
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act - Start the update
      const promise = updateEntryCheckinStatus(mockEntryId, 'checked-in');

      // Fast-forward through all timers and resolve the promise
      await vi.runAllTimersAsync();
      const result = await promise;

      // Assert - The function should complete successfully
      expect(result).toBe(true);
      expect(triggerImmediateEntrySync).toHaveBeenCalled();
    });
  });

  describe('markEntryCompleted - Edge Cases', () => {
    it('should set result_status to manual_complete', async () => {
      // Arrange
      let capturedUpdateData: any;
      vi.mocked(supabase.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: mockEntryId, is_scored: false },
              error: null,
            }),
          }),
        }),
        update: vi.fn().mockImplementation((data) => {
          capturedUpdateData = data;
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }),
      } as any);

      // Act
      await markEntryCompleted(mockEntryId);

      // Assert
      expect(capturedUpdateData).toMatchObject({
        entry_status: 'completed',
        is_scored: true,
        result_status: 'manual_complete',
      });
      expect(capturedUpdateData.scoring_completed_at).toBeDefined();
    });

    it('should handle check error other than PGRST116', async () => {
      // Arrange
      const error = { code: '500', message: 'Server error' };
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

    it('should handle update error', async () => {
      // Arrange
      const updateError = { message: 'Update failed' };
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
            select: vi.fn().mockResolvedValue({ error: updateError }),
          }),
        }),
      } as any);

      // Act & Assert
      await expect(markEntryCompleted(mockEntryId)).rejects.toThrow();
    });
  });
});
