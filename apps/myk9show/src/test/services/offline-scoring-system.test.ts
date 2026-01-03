/**
 * Comprehensive tests for Phase 3 Offline Scoring System
 * Tests offline scoring, placement calculations, and score validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

// Service imports
import { OfflineScoringService } from '@/services/scoring/OfflineScoringService';
import { PlacementCalculatorService } from '@/services/scoring/PlacementCalculatorService';
import { ScoreValidatorService } from '@/services/scoring/ScoreValidatorService';
import { JudgeWorkflowManager } from '@/services/scoring/JudgeWorkflowManager';

// Store imports
import { useEntryStore } from '@/store/entryStore';
import { useClassStore } from '@/store/classStore';
import { useSyncQueue } from '@/store/syncQueue';

// Type imports
import type { Entry, EntryStatus } from '@/types/entry-types';
import type { Score, ScoreData } from '@/types/scoring-types';
import type { Class } from '@/types/class-types';

describe('Phase 3 Offline Scoring System', () => {
  beforeEach(() => {
    localStorage.clear();
    
    // Reset stores
    useEntryStore.getState().clearEntries();
    useClassStore.getState().clearClasses();
    useSyncQueue.getState().clearQueue();
  });

  describe('OfflineScoringService - Core Functionality', () => {
    const mockClass: Class = {
      id: 'class-1',
      name: 'Open Dogs',
      showId: 'show-1',
      maxEntries: 10,
      entryFee: 25,
      status: 'in_progress',
      judgeId: 'judge-1',
      rings: ['1'],
      scheduledTime: '09:00',
      estimatedDuration: 60,
      scoringType: 'placement',
      createdAt: '2024-07-01T08:00:00Z',
      updatedAt: '2024-07-01T08:00:00Z'
    };

    const mockEntries: Entry[] = [
      {
        id: 'entry-1',
        dogId: 'dog-1',
        classId: 'class-1',
        showId: 'show-1',
        status: 'checked_in',
        armbandNumber: '101',
        registrationData: {
          submittedAt: '2024-07-01T10:00:00Z',
          handler: 'Handler 1',
          entryFee: 25,
          paymentStatus: 'paid'
        },
        statusHistory: [],
        createdAt: '2024-07-01T10:00:00Z',
        updatedAt: '2024-07-01T10:00:00Z'
      },
      {
        id: 'entry-2',
        dogId: 'dog-2',
        classId: 'class-1',
        showId: 'show-1',
        status: 'checked_in',
        armbandNumber: '102',
        registrationData: {
          submittedAt: '2024-07-01T10:00:00Z',
          handler: 'Handler 2',
          entryFee: 25,
          paymentStatus: 'paid'
        },
        statusHistory: [],
        createdAt: '2024-07-01T10:00:00Z',
        updatedAt: '2024-07-01T10:00:00Z'
      },
      {
        id: 'entry-3',
        dogId: 'dog-3',
        classId: 'class-1',
        showId: 'show-1',
        status: 'checked_in',
        armbandNumber: '103',
        registrationData: {
          submittedAt: '2024-07-01T10:00:00Z',
          handler: 'Handler 3',
          entryFee: 25,
          paymentStatus: 'paid'
        },
        statusHistory: [],
        createdAt: '2024-07-01T10:00:00Z',
        updatedAt: '2024-07-01T10:00:00Z'
      }
    ];

    beforeEach(() => {
      useClassStore.getState().addClass(mockClass);
      mockEntries.forEach(entry => useEntryStore.getState().addEntry(entry));
    });

    it('should record scores offline for placement-based judging', async () => {
      const scoreData: ScoreData = {
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 1,
        comments: 'Excellent movement',
        scoredAt: new Date().toISOString()
      };

      const result = await OfflineScoringService.recordScore(scoreData);

      expect(result.success).toBe(true);
      expect(result.score).toBeDefined();
      expect(result.score?.placement).toBe(1);
      
      // Verify score was stored
      const scores = OfflineScoringService.getClassScores('class-1');
      expect(scores).toHaveLength(1);
      expect(scores[0].entryId).toBe('entry-1');
      
      // Verify sync queue entry
      const syncQueue = useSyncQueue.getState().queue;
      expect(syncQueue).toHaveLength(1);
      expect(syncQueue[0].operation).toBe('RECORD_SCORE');
    });

    it('should record scores for time-based competition (agility)', async () => {
      const agilityClass = {
        ...mockClass,
        id: 'agility-class-1',
        scoringType: 'time_plus_faults'
      };
      useClassStore.getState().addClass(agilityClass);

      const agilityScore: ScoreData = {
        entryId: 'entry-1',
        classId: 'agility-class-1',
        judgeId: 'judge-1',
        time: '45.67',
        faults: 0,
        status: 'Qualified',
        scoredAt: new Date().toISOString()
      };

      const result = await OfflineScoringService.recordScore(agilityScore);

      expect(result.success).toBe(true);
      expect(result.score?.time).toBe('45.67');
      expect(result.score?.faults).toBe(0);
      expect(result.score?.status).toBe('Qualified');
    });

    it('should record scores for point-based competition (obedience)', async () => {
      const obedienceClass = {
        ...mockClass,
        id: 'obedience-class-1',
        scoringType: 'points'
      };
      useClassStore.getState().addClass(obedienceClass);

      const obedienceScore: ScoreData = {
        entryId: 'entry-1',
        classId: 'obedience-class-1',
        judgeId: 'judge-1',
        points: 195.5,
        maxPoints: 200,
        status: 'Qualified',
        scoredAt: new Date().toISOString()
      };

      const result = await OfflineScoringService.recordScore(obedienceScore);

      expect(result.success).toBe(true);
      expect(result.score?.points).toBe(195.5);
      expect(result.score?.maxPoints).toBe(200);
      expect(result.score?.status).toBe('Qualified');
    });

    it('should handle score updates and revisions', async () => {
      // Record initial score
      const initialScore: ScoreData = {
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 2,
        comments: 'Good movement',
        scoredAt: new Date().toISOString()
      };

      const initialResult = await OfflineScoringService.recordScore(initialScore);
      expect(initialResult.success).toBe(true);

      // Update score
      const updatedScore: ScoreData = {
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 1,
        comments: 'Excellent movement - revised',
        scoredAt: new Date().toISOString()
      };

      const updateResult = await OfflineScoringService.updateScore(
        initialResult.score!.id,
        updatedScore
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.score?.placement).toBe(1);
      expect(updateResult.score?.comments).toBe('Excellent movement - revised');
      
      // Verify only one score exists (updated, not duplicated)
      const scores = OfflineScoringService.getClassScores('class-1');
      expect(scores).toHaveLength(1);
      
      // Verify sync queue has update operation
      const syncQueue = useSyncQueue.getState().queue;
      const updateOperation = syncQueue.find(op => op.operation === 'UPDATE_SCORE');
      expect(updateOperation).toBeDefined();
    });

    it('should handle absent/scratched entries', async () => {
      const absentScore: ScoreData = {
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        status: 'Absent',
        comments: 'Dog did not show',
        scoredAt: new Date().toISOString()
      };

      const result = await OfflineScoringService.recordScore(absentScore);

      expect(result.success).toBe(true);
      expect(result.score?.status).toBe('Absent');
      expect(result.score?.placement).toBeUndefined();
    });

    it('should validate scoring permissions', async () => {
      const scoreData: ScoreData = {
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'unauthorized-judge',
        placement: 1,
        scoredAt: new Date().toISOString()
      };

      const result = await OfflineScoringService.recordScore(scoreData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('UNAUTHORIZED_JUDGE');
    });
  });

  describe('PlacementCalculatorService - Automatic Placement Logic', () => {
    it('should calculate placements for time-based competition', () => {
      const scores: Score[] = [
        {
          id: 'score-1',
          entryId: 'entry-1',
          classId: 'class-1',
          judgeId: 'judge-1',
          time: '45.67',
          faults: 0,
          status: 'Qualified',
          scoredAt: '2024-07-01T10:00:00Z'
        },
        {
          id: 'score-2',
          entryId: 'entry-2',
          classId: 'class-1',
          judgeId: 'judge-1',
          time: '48.23',
          faults: 5,
          status: 'Qualified',
          scoredAt: '2024-07-01T10:01:00Z'
        },
        {
          id: 'score-3',
          entryId: 'entry-3',
          classId: 'class-1',
          judgeId: 'judge-1',
          time: '42.15',
          faults: 0,
          status: 'Qualified',
          scoredAt: '2024-07-01T10:02:00Z'
        }
      ];

      const placements = PlacementCalculatorService.calculateTimePlacements(scores);

      expect(placements.get('entry-3')).toBe(1); // Fastest time
      expect(placements.get('entry-1')).toBe(2); // Second fastest
      expect(placements.get('entry-2')).toBe(3); // Slowest with faults
    });

    it('should calculate placements for point-based competition', () => {
      const scores: Score[] = [
        {
          id: 'score-1',
          entryId: 'entry-1',
          classId: 'class-1',
          judgeId: 'judge-1',
          points: 195.5,
          maxPoints: 200,
          status: 'Qualified',
          scoredAt: '2024-07-01T10:00:00Z'
        },
        {
          id: 'score-2',
          entryId: 'entry-2',
          classId: 'class-1',
          judgeId: 'judge-1',
          points: 198.0,
          maxPoints: 200,
          status: 'Qualified',
          scoredAt: '2024-07-01T10:01:00Z'
        },
        {
          id: 'score-3',
          entryId: 'entry-3',
          classId: 'class-1',
          judgeId: 'judge-1',
          points: 190.0,
          maxPoints: 200,
          status: 'Not Qualified',
          scoredAt: '2024-07-01T10:02:00Z'
        }
      ];

      const placements = PlacementCalculatorService.calculatePointPlacements(scores);

      expect(placements.get('entry-2')).toBe(1); // Highest points
      expect(placements.get('entry-1')).toBe(2); // Second highest
      expect(placements.get('entry-3')).toBeUndefined(); // NQ, no placement
    });

    it('should handle tied scores appropriately', () => {
      const scores: Score[] = [
        {
          id: 'score-1',
          entryId: 'entry-1',
          classId: 'class-1',
          judgeId: 'judge-1',
          time: '45.67',
          faults: 0,
          status: 'Qualified',
          scoredAt: '2024-07-01T10:00:00Z'
        },
        {
          id: 'score-2',
          entryId: 'entry-2',
          classId: 'class-1',
          judgeId: 'judge-1',
          time: '45.67',
          faults: 0,
          status: 'Qualified',
          scoredAt: '2024-07-01T10:01:00Z'
        }
      ];

      const placements = PlacementCalculatorService.calculateTimePlacements(scores);

      // Both should get placement 1 (tied for first)
      expect(placements.get('entry-1')).toBe(1);
      expect(placements.get('entry-2')).toBe(1);
    });

    it('should exclude non-qualifying scores from placements', () => {
      const scores: Score[] = [
        {
          id: 'score-1',
          entryId: 'entry-1',
          classId: 'class-1',
          judgeId: 'judge-1',
          time: '45.67',
          faults: 0,
          status: 'Qualified',
          scoredAt: '2024-07-01T10:00:00Z'
        },
        {
          id: 'score-2',
          entryId: 'entry-2',
          classId: 'class-1',
          judgeId: 'judge-1',
          time: '60.00',
          faults: 10,
          status: 'Not Qualified',
          scoredAt: '2024-07-01T10:01:00Z'
        },
        {
          id: 'score-3',
          entryId: 'entry-3',
          classId: 'class-1',
          judgeId: 'judge-1',
          status: 'Absent',
          scoredAt: '2024-07-01T10:02:00Z'
        }
      ];

      const placements = PlacementCalculatorService.calculateTimePlacements(scores);

      expect(placements.get('entry-1')).toBe(1);
      expect(placements.get('entry-2')).toBeUndefined(); // NQ
      expect(placements.get('entry-3')).toBeUndefined(); // Absent
    });
  });

  describe('ScoreValidatorService - Score Validation', () => {
    it('should validate placement scores', () => {
      const validPlacement = {
        placement: 1,
        comments: 'Excellent dog'
      };

      const result = ScoreValidatorService.validatePlacementScore(validPlacement);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate time-based scores', () => {
      const validTimeScore = {
        time: '45.67',
        faults: 0,
        status: 'Qualified'
      };

      const result = ScoreValidatorService.validateTimeScore(validTimeScore);
      expect(result.isValid).toBe(true);

      const invalidTimeScore = {
        time: 'invalid',
        faults: -1,
        status: 'Invalid'
      };

      const invalidResult = ScoreValidatorService.validateTimeScore(invalidTimeScore);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.some(e => e.code === 'INVALID_TIME_FORMAT')).toBe(true);
      expect(invalidResult.errors.some(e => e.code === 'INVALID_FAULTS')).toBe(true);
    });

    it('should validate point-based scores', () => {
      const validPointScore = {
        points: 195.5,
        maxPoints: 200,
        status: 'Qualified'
      };

      const result = ScoreValidatorService.validatePointScore(validPointScore);
      expect(result.isValid).toBe(true);

      const invalidPointScore = {
        points: 250, // Exceeds max
        maxPoints: 200,
        status: 'Qualified'
      };

      const invalidResult = ScoreValidatorService.validatePointScore(invalidPointScore);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.some(e => e.code === 'POINTS_EXCEED_MAX')).toBe(true);
    });

    it('should validate score consistency', () => {
      const inconsistentScore = {
        time: '45.67',
        faults: 0,
        status: 'Not Qualified' // Inconsistent with good time/faults
      };

      const result = ScoreValidatorService.validateScoreConsistency(inconsistentScore);
      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain('SCORE_STATUS_INCONSISTENCY');
    });
  });

  describe('JudgeWorkflowManager - Workflow Management', () => {
    it('should manage judging session lifecycle', async () => {
      const session = await JudgeWorkflowManager.startJudgingSession('class-1', 'judge-1');

      expect(session.success).toBe(true);
      expect(session.sessionId).toBeDefined();
      expect(session.classInfo?.id).toBe('class-1');
      
      // Verify session is tracked
      const activeSessions = JudgeWorkflowManager.getActiveSessions('judge-1');
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].classId).toBe('class-1');
    });

    it('should track scoring progress', async () => {
      await JudgeWorkflowManager.startJudgingSession('class-1', 'judge-1');

      // Record some scores
      await OfflineScoringService.recordScore({
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 1,
        scoredAt: new Date().toISOString()
      });

      const progress = JudgeWorkflowManager.getClassProgress('class-1');

      expect(progress.totalEntries).toBe(3);
      expect(progress.scoredEntries).toBe(1);
      expect(progress.remainingEntries).toBe(2);
      expect(progress.percentComplete).toBe(33.33);
    });

    it('should handle judging session completion', async () => {
      const session = await JudgeWorkflowManager.startJudgingSession('class-1', 'judge-1');

      // Score all entries
      await OfflineScoringService.recordScore({
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 1,
        scoredAt: new Date().toISOString()
      });

      await OfflineScoringService.recordScore({
        entryId: 'entry-2',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 2,
        scoredAt: new Date().toISOString()
      });

      await OfflineScoringService.recordScore({
        entryId: 'entry-3',
        classId: 'class-1',
        judgeId: 'judge-1',
        status: 'Absent',
        scoredAt: new Date().toISOString()
      });

      const completionResult = await JudgeWorkflowManager.completeJudgingSession(session.sessionId!);

      expect(completionResult.success).toBe(true);
      expect(completionResult.finalResults).toBeDefined();
      expect(completionResult.finalResults?.placements).toHaveLength(2); // 2 placed entries
      
      // Verify class status updated
      const updatedClass = useClassStore.getState().getClass('class-1');
      expect(updatedClass?.status).toBe('completed');
    });

    it('should prevent unauthorized judging access', async () => {
      const session = await JudgeWorkflowManager.startJudgingSession('class-1', 'unauthorized-judge');

      expect(session.success).toBe(false);
      expect(session.errors).toContain('JUDGE_NOT_ASSIGNED');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle scoring when entry is not checked in', async () => {
      const uncheckedEntry = {
        ...mockEntries[0],
        status: 'confirmed' as EntryStatus // Not checked in
      };

      useEntryStore.getState().updateEntry(uncheckedEntry);

      const scoreData: ScoreData = {
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 1,
        scoredAt: new Date().toISOString()
      };

      const result = await OfflineScoringService.recordScore(scoreData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('ENTRY_NOT_CHECKED_IN');
    });

    it('should handle storage errors during scoring', async () => {
      // Mock storage failure
      vi.spyOn(OfflineScoringService, 'saveScore').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const scoreData: ScoreData = {
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 1,
        scoredAt: new Date().toISOString()
      };

      const result = await OfflineScoringService.recordScore(scoreData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('STORAGE_ERROR');
    });

    it('should handle class not in progress', async () => {
      const completedClass = {
        ...mockClass,
        status: 'completed'
      };
      useClassStore.getState().updateClass(completedClass);

      const scoreData: ScoreData = {
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 1,
        scoredAt: new Date().toISOString()
      };

      const result = await OfflineScoringService.recordScore(scoreData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('CLASS_NOT_IN_PROGRESS');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle scoring large classes efficiently', async () => {
      // Create a large class with many entries
      const largeClass = {
        ...mockClass,
        id: 'large-class',
        maxEntries: 500
      };

      const largeEntries = Array.from({ length: 100 }, (_, i) => ({
        id: `entry-${i}`,
        dogId: `dog-${i}`,
        classId: 'large-class',
        showId: 'show-1',
        status: 'checked_in' as EntryStatus,
        armbandNumber: `${100 + i}`,
        registrationData: {
          submittedAt: '2024-07-01T10:00:00Z',
          handler: `Handler ${i}`,
          entryFee: 25,
          paymentStatus: 'paid' as const
        },
        statusHistory: [],
        createdAt: '2024-07-01T10:00:00Z',
        updatedAt: '2024-07-01T10:00:00Z'
      }));

      useClassStore.getState().addClass(largeClass);
      largeEntries.forEach(entry => useEntryStore.getState().addEntry(entry));

      const startTime = performance.now();

      // Score all entries
      const promises = largeEntries.map((entry, i) =>
        OfflineScoringService.recordScore({
          entryId: entry.id,
          classId: 'large-class',
          judgeId: 'judge-1',
          placement: i + 1,
          scoredAt: new Date().toISOString()
        })
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      // All should succeed
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBe(100);

      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(2000); // 2 seconds max
    });

    it('should efficiently calculate placements for large result sets', () => {
      const largeScoreSet = Array.from({ length: 500 }, (_, i) => ({
        id: `score-${i}`,
        entryId: `entry-${i}`,
        classId: 'large-class',
        judgeId: 'judge-1',
        time: `${45 + Math.random() * 30}.${Math.floor(Math.random() * 100)}`,
        faults: Math.floor(Math.random() * 5),
        status: 'Qualified' as const,
        scoredAt: '2024-07-01T10:00:00Z'
      }));

      const startTime = performance.now();
      const placements = PlacementCalculatorService.calculateTimePlacements(largeScoreSet);
      const endTime = performance.now();

      expect(placements.size).toBe(500);
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast
    });
  });

  describe('Data Consistency and Integrity', () => {
    it('should maintain scoring data consistency', async () => {
      const scoreData: ScoreData = {
        entryId: 'entry-1',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 1,
        comments: 'Great performance',
        scoredAt: new Date().toISOString()
      };

      // Record score
      const result = await OfflineScoringService.recordScore(scoreData);
      expect(result.success).toBe(true);

      // Update score
      const updatedData = {
        ...scoreData,
        placement: 2,
        comments: 'Good performance - updated'
      };

      const updateResult = await OfflineScoringService.updateScore(
        result.score!.id,
        updatedData
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.score?.placement).toBe(2);

      // Verify consistency
      const scores = OfflineScoringService.getClassScores('class-1');
      expect(scores).toHaveLength(1); // No duplicates
      expect(scores[0].placement).toBe(2); // Updated value
    });

    it('should maintain referential integrity between scores and entries', async () => {
      const scoreData: ScoreData = {
        entryId: 'non-existent-entry',
        classId: 'class-1',
        judgeId: 'judge-1',
        placement: 1,
        scoredAt: new Date().toISOString()
      };

      const result = await OfflineScoringService.recordScore(scoreData);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('ENTRY_NOT_FOUND');
    });
  });
});