import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  updateExhibitorOrder,
  calculateNewOrders,
  validateExhibitorOrderArray,
} from './entryBatchOperations';
import { supabase } from '@/lib/supabase';
import { triggerImmediateEntrySync } from '../entryReplication';
import { Entry } from '@/stores/entryStore';

// Mock dependencies
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock('../entryReplication', () => ({
  triggerImmediateEntrySync: vi.fn(),
}));

describe('entryBatchOperations', () => {
  const mockEntries: Entry[] = [
    { id: 1, armband: 101 } as Entry,
    { id: 2, armband: 102 } as Entry,
    { id: 3, armband: 103 } as Entry,
    { id: 4, armband: 104 } as Entry,
    { id: 5, armband: 105 } as Entry,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Silence console logs in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('updateExhibitorOrder', () => {
    it('should update exhibitor_order for all entries with 1-based indexing', async () => {
      // Arrange
      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ error: null, data: [] }),
        }),
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      const result = await updateExhibitorOrder(mockEntries);

      // Assert
      expect(result).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('entries');
      expect(updateMock).toHaveBeenCalledTimes(5);

      // Verify 1-based indexing (updated_at is also included in updates)
      expect(updateMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ exhibitor_order: 1 }));
      expect(updateMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ exhibitor_order: 2 }));
      expect(updateMock).toHaveBeenNthCalledWith(3, expect.objectContaining({ exhibitor_order: 3 }));
      expect(updateMock).toHaveBeenNthCalledWith(4, expect.objectContaining({ exhibitor_order: 4 }));
      expect(updateMock).toHaveBeenNthCalledWith(5, expect.objectContaining({ exhibitor_order: 5 }));
    });

    it('should update correct entry IDs', async () => {
      // Arrange
      const selectMock = vi.fn().mockResolvedValue({ error: null, data: [] });
      const eqMock = vi.fn().mockReturnValue({ select: selectMock });
      const updateMock = vi.fn().mockReturnValue({
        eq: eqMock,
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await updateExhibitorOrder(mockEntries);

      // Assert
      expect(eqMock).toHaveBeenNthCalledWith(1, 'id', 1);
      expect(eqMock).toHaveBeenNthCalledWith(2, 'id', 2);
      expect(eqMock).toHaveBeenNthCalledWith(3, 'id', 3);
      expect(eqMock).toHaveBeenNthCalledWith(4, 'id', 4);
      expect(eqMock).toHaveBeenNthCalledWith(5, 'id', 5);
    });

    it('should trigger immediate sync after successful updates', async () => {
      // Arrange
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error: null, data: [] }),
          }),
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await updateExhibitorOrder(mockEntries);

      // Assert
      expect(triggerImmediateEntrySync).toHaveBeenCalledWith('updateExhibitorOrder');
    });

    it('should handle reordered entries correctly', async () => {
      // Arrange
      const reordered = [mockEntries[4], mockEntries[0], mockEntries[2], mockEntries[1], mockEntries[3]];

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ error: null, data: [] }),
        }),
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await updateExhibitorOrder(reordered);

      // Assert - Entry 5 should now be exhibitor_order 1
      expect(updateMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ exhibitor_order: 1 }));
      // Entry 1 should now be exhibitor_order 2
      expect(updateMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ exhibitor_order: 2 }));
      // Entry 3 should now be exhibitor_order 3
      expect(updateMock).toHaveBeenNthCalledWith(3, expect.objectContaining({ exhibitor_order: 3 }));
    });

    it('should throw error if any update fails', async () => {
      // Arrange
      const error = { message: 'Database error', code: '23505' };

      let callCount = 0;
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockImplementation(() => {
              callCount++;
              // Fail on second update
              if (callCount === 2) {
                return Promise.resolve({ error, data: null });
              }
              return Promise.resolve({ error: null, data: [] });
            }),
          }),
        }),
      } as any);

      // Act & Assert
      await expect(updateExhibitorOrder(mockEntries)).rejects.toThrow();
    });

    it('should not trigger sync if updates fail', async () => {
      // Arrange
      const error = { message: 'Database error' };

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({ error, data: null }),
          }),
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      try {
        await updateExhibitorOrder(mockEntries);
      } catch (e) {
        // Expected to throw
      }

      // Assert
      expect(triggerImmediateEntrySync).not.toHaveBeenCalled();
    });

    it('should handle single entry', async () => {
      // Arrange
      const singleEntry = [mockEntries[0]];

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ error: null, data: [] }),
        }),
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      const result = await updateExhibitorOrder(singleEntry);

      // Assert
      expect(result).toBe(true);
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ exhibitor_order: 1 }));
    });

    it('should handle large batch of entries', async () => {
      // Arrange
      const largeEntries = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        armband: 100 + i,
      })) as Entry[];

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ error: null, data: [] }),
        }),
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      const result = await updateExhibitorOrder(largeEntries);

      // Assert
      expect(result).toBe(true);
      expect(updateMock).toHaveBeenCalledTimes(50);
      expect(updateMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ exhibitor_order: 1 }));
      expect(updateMock).toHaveBeenNthCalledWith(50, expect.objectContaining({ exhibitor_order: 50 }));
    });
  });

  describe('calculateNewOrders', () => {
    it('should calculate correct 1-based orders', () => {
      // Act
      const result = calculateNewOrders(mockEntries);

      // Assert
      expect(result).toEqual([
        { entryId: 1, newOrder: 1 },
        { entryId: 2, newOrder: 2 },
        { entryId: 3, newOrder: 3 },
        { entryId: 4, newOrder: 4 },
        { entryId: 5, newOrder: 5 },
      ]);
    });

    it('should handle reordered entries', () => {
      // Arrange
      const reordered = [mockEntries[4], mockEntries[0], mockEntries[2]];

      // Act
      const result = calculateNewOrders(reordered);

      // Assert
      expect(result).toEqual([
        { entryId: 5, newOrder: 1 },
        { entryId: 1, newOrder: 2 },
        { entryId: 3, newOrder: 3 },
      ]);
    });

    it('should handle single entry', () => {
      // Arrange
      const singleEntry = [mockEntries[0]];

      // Act
      const result = calculateNewOrders(singleEntry);

      // Assert
      expect(result).toEqual([{ entryId: 1, newOrder: 1 }]);
    });

    it('should handle empty array', () => {
      // Act
      const result = calculateNewOrders([]);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('validateExhibitorOrderArray', () => {
    it('should validate correct array', () => {
      // Act
      const result = validateExhibitorOrderArray(mockEntries);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty array', () => {
      // Act
      const result = validateExhibitorOrderArray([]);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Entries array is empty');
    });

    it('should reject null/undefined', () => {
      // Act
      const result = validateExhibitorOrderArray(null as any);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Entries array is empty');
    });

    it('should reject entry with invalid ID (0)', () => {
      // Arrange
      const invalidEntries = [
        { id: 1, armband: 101 } as Entry,
        { id: 0, armband: 102 } as Entry,
      ];

      // Act
      const result = validateExhibitorOrderArray(invalidEntries);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Entry has invalid ID');
    });

    it('should reject entry with negative ID', () => {
      // Arrange
      const invalidEntries = [
        { id: 1, armband: 101 } as Entry,
        { id: -5, armband: 102 } as Entry,
      ];

      // Act
      const result = validateExhibitorOrderArray(invalidEntries);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Entry has invalid ID');
    });

    it('should reject entry without ID', () => {
      // Arrange
      const invalidEntries = [
        { id: 1, armband: 101 } as Entry,
        { armband: 102 } as any,
      ];

      // Act
      const result = validateExhibitorOrderArray(invalidEntries);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Entry has invalid ID');
    });

    it('should reject duplicate IDs', () => {
      // Arrange
      const duplicateEntries = [
        { id: 1, armband: 101 } as Entry,
        { id: 2, armband: 102 } as Entry,
        { id: 1, armband: 103 } as Entry, // Duplicate ID
      ];

      // Act
      const result = validateExhibitorOrderArray(duplicateEntries);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Duplicate entry IDs found');
      expect(result.error).toContain('1');
    });

    it('should reject multiple duplicate IDs', () => {
      // Arrange
      const duplicateEntries = [
        { id: 1, armband: 101 } as Entry,
        { id: 2, armband: 102 } as Entry,
        { id: 1, armband: 103 } as Entry,
        { id: 2, armband: 104 } as Entry,
      ];

      // Act
      const result = validateExhibitorOrderArray(duplicateEntries);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Duplicate entry IDs found');
    });
  });

  describe('integration scenarios', () => {
    it('should handle drag-and-drop move from middle to start', async () => {
      // Arrange - Move entry 3 from index 2 to index 0
      const reordered = [mockEntries[2], mockEntries[0], mockEntries[1], mockEntries[3], mockEntries[4]];

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ error: null, data: [] }),
        }),
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await updateExhibitorOrder(reordered);

      // Assert - Entry 3 should now be first (exhibitor_order = 1)
      const firstUpdate = updateMock.mock.calls[0][0];
      expect(firstUpdate).toMatchObject({ exhibitor_order: 1 });
    });

    it('should handle drag-and-drop move from start to end', async () => {
      // Arrange - Move entry 1 from index 0 to index 4
      const reordered = [mockEntries[1], mockEntries[2], mockEntries[3], mockEntries[4], mockEntries[0]];

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ error: null, data: [] }),
        }),
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await updateExhibitorOrder(reordered);

      // Assert - Entry 1 should now be last (exhibitor_order = 5)
      const lastUpdate = updateMock.mock.calls[4][0];
      expect(lastUpdate).toMatchObject({ exhibitor_order: 5 });
    });

    it('should handle complete reversal of list', async () => {
      // Arrange
      const reversed = [...mockEntries].reverse();

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ error: null, data: [] }),
        }),
      });

      vi.mocked(supabase.from).mockReturnValue({
        update: updateMock,
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await updateExhibitorOrder(reversed);

      // Assert
      expect(updateMock).toHaveBeenCalledTimes(5);
      // Entry 5 should be first
      expect(updateMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ exhibitor_order: 1 }));
      // Entry 1 should be last
      expect(updateMock).toHaveBeenNthCalledWith(5, expect.objectContaining({ exhibitor_order: 5 }));
    });
  });
});
