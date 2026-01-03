import { vi } from 'vitest';
import { recalculatePlacementsForClass, getEntryPlacement, manuallyRecalculatePlacements } from './placementService';
import { supabase } from '../lib/supabase';

// Mock the supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn()
  }
}));

describe('placementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recalculatePlacementsForClass', () => {
    test('should recalculate placements for a single class', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await recalculatePlacementsForClass(101, 'test-license-key', false);

      expect(supabase.rpc).toHaveBeenCalledWith('recalculate_class_placements', {
        p_class_ids: [101],
        p_is_nationals: false
      });
    });

    test('should recalculate placements for multiple classes', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await recalculatePlacementsForClass([101, 102, 103], 'test-license-key', false);

      expect(supabase.rpc).toHaveBeenCalledWith('recalculate_class_placements', {
        p_class_ids: [101, 102, 103],
        p_is_nationals: false
      });
    });

    test('should use nationals flag when specified', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await recalculatePlacementsForClass(101, 'test-license-key', true);

      expect(supabase.rpc).toHaveBeenCalledWith('recalculate_class_placements', {
        p_class_ids: [101],
        p_is_nationals: true
      });
    });

    test('should throw error when RPC call fails', async () => {
      const mockError = { message: 'Database error', code: 'PGRST301' };
      const mockRpc = vi.fn().mockResolvedValue({ error: mockError });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await expect(
        recalculatePlacementsForClass(101, 'test-license-key', false)
      ).rejects.toThrow();
    });

    test('should handle exceptions from supabase', async () => {
      const mockRpc = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await expect(
        recalculatePlacementsForClass(101, 'test-license-key', false)
      ).rejects.toThrow('Network error');
    });

    test('should normalize single class ID to array', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await recalculatePlacementsForClass(201, 'test-license-key', false);

      const calls = mockRpc.mock.calls[0];
      expect(calls[1].p_class_ids).toEqual([201]);
      expect(Array.isArray(calls[1].p_class_ids)).toBe(true);
    });
  });

  describe('getEntryPlacement', () => {
    test('should return placement for a valid entry', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { final_placement: 1 },
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const placement = await getEntryPlacement(1001);

      expect(placement).toBe(1);
      expect(supabase.from).toHaveBeenCalledWith('entries');
      expect(mockSelect).toHaveBeenCalledWith('final_placement');
      expect(mockEq).toHaveBeenCalledWith('id', 1001);
    });

    test('should return null when entry is not found', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' }
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const placement = await getEntryPlacement(9999);

      expect(placement).toBeNull();
    });

    test('should return null when query throws exception', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockRejectedValue(new Error('Database error'));

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const placement = await getEntryPlacement(1001);

      expect(placement).toBeNull();
    });

    test('should handle placement of null (unplaced entry)', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { final_placement: null },
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const placement = await getEntryPlacement(1001);

      expect(placement).toBeNull();
    });

    test('should return placement of 0 for NQ entries', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: { final_placement: 0 },
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const placement = await getEntryPlacement(1001);

      expect(placement).toBe(0);
    });
  });

  describe('manuallyRecalculatePlacements', () => {
    const mockClassData = {
      id: 101,
      trial_id: 10,
      trials: {
        show_id: 1,
        shows: {
          license_key: 'myK9Q1-a260f472-e0d76a33-4b6c264c',
          show_type: 'Regular'
        }
      }
    };

    test('should recalculate placements for regular show', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: mockClassData,
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const mockRpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await manuallyRecalculatePlacements(101);

      expect(supabase.from).toHaveBeenCalledWith('classes');
      expect(mockEq).toHaveBeenCalledWith('id', 101);
      expect(supabase.rpc).toHaveBeenCalledWith('recalculate_class_placements', {
        p_class_ids: [101],
        p_is_nationals: false
      });
    });

    test('should detect nationals competition and use correct flag', async () => {
      const nationalsClassData = {
        ...mockClassData,
        trials: {
          ...mockClassData.trials,
          shows: {
            ...mockClassData.trials.shows,
            show_type: 'National Championship'
          }
        }
      };

      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: nationalsClassData,
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const mockRpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await manuallyRecalculatePlacements(101);

      expect(supabase.rpc).toHaveBeenCalledWith('recalculate_class_placements', {
        p_class_ids: [101],
        p_is_nationals: true
      });
    });

    test('should throw error when class data fetch fails', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Class not found' }
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      await expect(manuallyRecalculatePlacements(999)).rejects.toThrow(
        'Failed to fetch class data'
      );
    });

    test('should throw error when placement recalculation fails', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: mockClassData,
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const mockRpc = vi.fn().mockResolvedValue({
        error: { message: 'Placement calculation failed' }
      });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await expect(manuallyRecalculatePlacements(101)).rejects.toThrow();
    });

    test('should handle case-insensitive nationals detection', async () => {
      const nationalsClassData = {
        ...mockClassData,
        trials: {
          ...mockClassData.trials,
          shows: {
            ...mockClassData.trials.shows,
            show_type: 'NATIONAL'
          }
        }
      };

      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: nationalsClassData,
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const mockRpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await manuallyRecalculatePlacements(101);

      expect(supabase.rpc).toHaveBeenCalledWith('recalculate_class_placements', {
        p_class_ids: [101],
        p_is_nationals: true
      });
    });

    test('should default to false for nationals flag if show_type is null', async () => {
      const classDataWithNullType = {
        ...mockClassData,
        trials: {
          ...mockClassData.trials,
          shows: {
            ...mockClassData.trials.shows,
            show_type: null
          }
        }
      };

      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({
        data: classDataWithNullType,
        error: null
      });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const mockRpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.rpc).mockImplementation(mockRpc);

      await manuallyRecalculatePlacements(101);

      expect(supabase.rpc).toHaveBeenCalledWith('recalculate_class_placements', {
        p_class_ids: [101],
        p_is_nationals: false
      });
    });
  });
});
