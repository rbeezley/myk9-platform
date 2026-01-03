import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitScore, submitBatchScores, ScoreData } from './scoreSubmission';
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

describe('scoreSubmission', () => {
  const mockEntryId = 123;

  beforeEach(() => {
    vi.clearAllMocks();
    // Silence console logs in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('submitScore', () => {
    it('should submit a basic score successfully', async () => {
      // Arrange
      const scoreData: ScoreData = {
        resultText: 'Qualified',
        searchTime: '1:30',
        faultCount: 0,
      };

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [
                {
                  id: mockEntryId,
                  result_status: 'qualified',
                  entry_status: 'completed',
                },
              ],
              error: null,
            }),
          }),
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);
      vi.mocked(checkAndUpdateClassCompletion).mockResolvedValue(undefined);

      // Act
      const result = await submitScore(mockEntryId, scoreData, undefined, 456);

      // Assert
      expect(result).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('entries');
      expect(triggerImmediateEntrySync).toHaveBeenCalledWith('submitScore');
    });

    it('should handle AKC Scent Work area times', async () => {
      // Arrange
      const scoreData: ScoreData = {
        resultText: 'Qualified',
        areaTimes: ['45', '52', '38'],
        element: 'Interior',
        level: 'Master',
      };

      let capturedUpdateData: any;
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockImplementation((data) => {
          capturedUpdateData = data;
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: mockEntryId }],
                error: null,
              }),
            }),
          };
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await submitScore(mockEntryId, scoreData, undefined, 456);

      // Assert
      expect(capturedUpdateData.area1_time_seconds).toBe(45);
      expect(capturedUpdateData.area2_time_seconds).toBe(52);
      expect(capturedUpdateData.area3_time_seconds).toBe(38);
      expect(capturedUpdateData.search_time_seconds).toBe(135); // Sum of areas
    });

    it('should set entry_status to completed when scored', async () => {
      // Arrange
      const scoreData: ScoreData = {
        resultText: 'Qualified',
        searchTime: '1:30',
      };

      let capturedUpdateData: any;
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockImplementation((data) => {
          capturedUpdateData = data;
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: mockEntryId }],
                error: null,
              }),
            }),
          };
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await submitScore(mockEntryId, scoreData, undefined, 456);

      // Assert
      expect(capturedUpdateData.entry_status).toBe('completed');
      expect(capturedUpdateData.is_scored).toBe(true);
    });

    it('should set entry_status to in-ring when not scored', async () => {
      // Arrange
      const scoreData: ScoreData = {
        resultText: 'Pending', // Maps to 'pending' result_status
      };

      let capturedUpdateData: any;
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockImplementation((data) => {
          capturedUpdateData = data;
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: mockEntryId }],
                error: null,
              }),
            }),
          };
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await submitScore(mockEntryId, scoreData, undefined, 456);

      // Assert
      expect(capturedUpdateData.entry_status).toBe('in-ring');
      expect(capturedUpdateData.is_scored).toBe(false);
    });

    it('should handle all optional fields', async () => {
      // Arrange
      const scoreData: ScoreData = {
        resultText: 'Qualified',
        searchTime: '1:30',
        faultCount: 2,
        points: 95,
        score: 98.5,
        correctCount: 10,
        incorrectCount: 1,
        finishCallErrors: 0,
        nonQualifyingReason: 'None',
      };

      let capturedUpdateData: any;
      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockImplementation((data) => {
          capturedUpdateData = data;
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: mockEntryId }],
                error: null,
              }),
            }),
          };
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act
      await submitScore(mockEntryId, scoreData, undefined, 456);

      // Assert
      expect(capturedUpdateData.total_faults).toBe(2);
      expect(capturedUpdateData.points_earned).toBe(95);
      expect(capturedUpdateData.total_score).toBe(98.5);
      expect(capturedUpdateData.total_correct_finds).toBe(10);
      expect(capturedUpdateData.total_incorrect_finds).toBe(1);
      expect(capturedUpdateData.no_finish_count).toBe(0);
      expect(capturedUpdateData.disqualification_reason).toBe('None');
    });

    it('should trigger class completion check with provided classId', async () => {
      // Arrange
      const scoreData: ScoreData = {
        resultText: 'Qualified',
      };
      const classId = 456;
      const pairedClassId = 457;

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [{ id: mockEntryId }],
              error: null,
            }),
          }),
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);
      vi.mocked(checkAndUpdateClassCompletion).mockResolvedValue(undefined);

      // Act
      await submitScore(mockEntryId, scoreData, pairedClassId, classId);

      // Small delay to allow background task to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert - now includes entryId as third argument (read replica workaround)
      expect(checkAndUpdateClassCompletion).toHaveBeenCalledWith(classId, pairedClassId, mockEntryId);
    });

    it('should query for classId when not provided', async () => {
      // Arrange
      const scoreData: ScoreData = {
        resultText: 'Qualified',
      };

      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table === 'entries') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({
                  data: [{ id: mockEntryId }],
                  error: null,
                }),
              }),
            }),
          } as any;
        } else if (table === 'view_entry_class_join_normalized') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { class_id: 456, license_key: 'test-key', show_id: 789 },
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);
      vi.mocked(checkAndUpdateClassCompletion).mockResolvedValue(undefined);

      // Act
      await submitScore(mockEntryId, scoreData); // No classId provided

      // Small delay to allow background task to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert - now includes entryId as third argument (read replica workaround)
      expect(supabase.from).toHaveBeenCalledWith('view_entry_class_join_normalized');
      expect(checkAndUpdateClassCompletion).toHaveBeenCalledWith(456, undefined, mockEntryId);
    });

    it('should handle database errors gracefully', async () => {
      // Arrange
      const scoreData: ScoreData = {
        resultText: 'Qualified',
      };
      const error = { message: 'Database error', code: '500' };

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: null,
              error,
            }),
          }),
        }),
      } as any);

      // Act & Assert
      await expect(submitScore(mockEntryId, scoreData)).rejects.toThrow();
    });

    it('should continue even if class completion check fails', async () => {
      // Arrange
      const scoreData: ScoreData = {
        resultText: 'Qualified',
      };

      vi.mocked(supabase.from).mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [{ id: mockEntryId }],
              error: null,
            }),
          }),
        }),
      } as any);

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);
      vi.mocked(checkAndUpdateClassCompletion).mockRejectedValue(
        new Error('Completion check failed')
      );

      // Act - should not throw
      const result = await submitScore(mockEntryId, scoreData, undefined, 456);

      // Assert
      expect(result).toBe(true); // Score submission succeeded despite background task failure
    });

    it('should handle missing entry data for background processing', async () => {
      // Arrange
      const scoreData: ScoreData = {
        resultText: 'Qualified',
      };

      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table === 'entries') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({
                  data: [{ id: mockEntryId }],
                  error: null,
                }),
              }),
            }),
          } as any;
        } else if (table === 'view_entry_class_join_normalized') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null, // Entry not found
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);

      // Act - should not throw
      const result = await submitScore(mockEntryId, scoreData);

      // Assert
      expect(result).toBe(true); // Score submission succeeded
      expect(checkAndUpdateClassCompletion).not.toHaveBeenCalled();
    });
  });

  describe('submitBatchScores', () => {
    it('should submit multiple scores successfully', async () => {
      // Arrange
      const scores = [
        {
          id: 'score1',
          entryId: 1,
          scoreData: { resultText: 'Qualified' },
        },
        {
          id: 'score2',
          entryId: 2,
          scoreData: { resultText: 'Not Qualified' },
        },
        {
          id: 'score3',
          entryId: 3,
          scoreData: { resultText: 'Qualified' },
        },
      ];

      // Use mockImplementation to handle both entries and view table lookups
      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table === 'entries') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({
                  data: [{ id: 1 }],
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        // view_entry_class_join_normalized lookup for background completion
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { class_id: 456, license_key: 'test-key', show_id: 789 },
                error: null,
              }),
            }),
          }),
        } as any;
      });

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);
      vi.mocked(checkAndUpdateClassCompletion).mockResolvedValue(undefined);

      // Act
      const result = await submitBatchScores(scores);

      // Small delay to allow background tasks
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(result.successful).toEqual(['score1', 'score2', 'score3']);
      expect(result.failed).toEqual([]);
    });

    it('should continue processing on individual failures', async () => {
      // Arrange
      const scores = [
        {
          id: 'score1',
          entryId: 1,
          scoreData: { resultText: 'Qualified' },
        },
        {
          id: 'score2',
          entryId: 2,
          scoreData: { resultText: 'Not Qualified' },
        },
        {
          id: 'score3',
          entryId: 3,
          scoreData: { resultText: 'Qualified' },
        },
      ];

      let entriesCallCount = 0;
      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table === 'entries') {
          entriesCallCount++;
          if (entriesCallCount === 2) {
            // Second score fails
            return {
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Database error' },
                  }),
                }),
              }),
            } as any;
          }
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockResolvedValue({
                  data: [{ id: 1 }],
                  error: null,
                }),
              }),
            }),
          } as any;
        }
        // view_entry_class_join_normalized lookup for background completion
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { class_id: 456, license_key: 'test-key', show_id: 789 },
                error: null,
              }),
            }),
          }),
        } as any;
      });

      vi.mocked(triggerImmediateEntrySync).mockResolvedValue(undefined);
      vi.mocked(checkAndUpdateClassCompletion).mockResolvedValue(undefined);

      // Act
      const result = await submitBatchScores(scores);

      // Small delay to allow background tasks
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert
      expect(result.successful).toEqual(['score1', 'score3']);
      expect(result.failed).toEqual(['score2']);
    });

    it('should return empty arrays when no scores provided', async () => {
      // Act
      const result = await submitBatchScores([]);

      // Assert
      expect(result.successful).toEqual([]);
      expect(result.failed).toEqual([]);
    });
  });
});
