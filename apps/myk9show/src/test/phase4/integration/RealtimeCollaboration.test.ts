import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RealtimeScoringService } from '../../../services/realtime/RealtimeScoringService';
import { PresenceService } from '../../../services/collaboration/PresenceService';
import { OptimisticUIService } from '../../../services/optimistic/OptimisticUIService';
import { ConflictResolver } from '../../../services/conflict/ConflictResolver';

// Mock all services
vi.mock('../../../services/realtime/RealtimeScoringService');
vi.mock('../../../services/collaboration/PresenceService');
vi.mock('../../../services/optimistic/OptimisticUIService');
vi.mock('../../../services/conflict/ConflictResolver');

describe('Realtime Collaboration Integration - Phase 4', () => {
  let realtimeService: RealtimeScoringService;
  let presenceService: PresenceService;
  let optimisticService: OptimisticUIService;
  let conflictResolver: ConflictResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock instances
    realtimeService = {
      subscribe: vi.fn(),
      submitScore: vi.fn(),
      updateScore: vi.fn(),
      updateJudgePresence: vi.fn(),
      getActiveJudges: vi.fn(),
      isJudgeActive: vi.fn(),
      subscribeToClass: vi.fn(),
      disconnect: vi.fn()
    } as RealtimeScoringService;

    presenceService = {
      initialize: vi.fn(),
      updatePresence: vi.fn(),
      updateActivity: vi.fn(),
      updateLocation: vi.fn(),
      getActiveUsers: vi.fn(),
      getActiveUsersForEntity: vi.fn(),
      isUserEditing: vi.fn(),
      subscribe: vi.fn(),
      cleanup: vi.fn()
    } as PresenceService;

    optimisticService = {
      applyOptimisticUpdate: vi.fn(),
      rollbackOperation: vi.fn(),
      getPendingOperations: vi.fn(),
      hasPendingOperations: vi.fn(),
      on: vi.fn(),
      clearCompletedOperations: vi.fn()
    } as OptimisticUIService;

    conflictResolver = {
      detectConflicts: vi.fn(),
      resolveConflict: vi.fn(),
      batchResolveConflicts: vi.fn(),
      getConflictHistory: vi.fn(),
      clearHistory: vi.fn()
    } as ConflictResolver;

    // Mock service instances
    (RealtimeScoringService as unknown as { getInstance: () => RealtimeScoringService }).getInstance = vi.fn().mockReturnValue(realtimeService);
    (PresenceService as unknown as { getInstance: () => PresenceService }).getInstance = vi.fn().mockReturnValue(presenceService);
    (OptimisticUIService as unknown as { getInstance: () => OptimisticUIService }).getInstance = vi.fn().mockReturnValue(optimisticService);
  });

  afterEach(async () => {
    await realtimeService.disconnect();
    await presenceService.cleanup();
    optimisticService.clearCompletedOperations();
    conflictResolver.clearHistory();
  });

  describe('Multi-Judge Scoring Collaboration', () => {
    it('should coordinate scoring between multiple judges', async () => {
      // Setup: Two judges working on the same class
      const judge1 = {
        id: 'judge-1',
        name: 'Judge Smith',
        role: 'judge' as const,
        status: 'online' as const
      };

      const judge2 = {
        id: 'judge-2',  
        name: 'Judge Wilson',
        role: 'judge' as const,
        status: 'online' as const
      };

      // Initialize presence for both judges
      await presenceService.initialize(judge1);
      await presenceService.initialize(judge2);

      // Both judges join the same class
      await realtimeService.subscribeToClass('class-123', 'show-456');
      
      await presenceService.updateLocation('/scoring/class/123', 'class-123', 'show');
      await presenceService.updateActivity('scoring', 'Evaluating entries 1-10');

      // Mock presence tracking
      (presenceService.getActiveUsersForEntity as ReturnType<typeof vi.fn>).mockReturnValue([
        { ...judge1, activity: { type: 'scoring', details: 'Entries 1-10' } },
        { ...judge2, activity: { type: 'scoring', details: 'Entries 11-20' } }
      ]);

      // Judge 1 submits a score
      const score1 = {
        entryId: 'entry-1',
        judgeId: 'judge-1',
        classId: 'class-123',
        showId: 'show-456',
        score: 92,
        placement: 1,
        qualified: true
      };

      (optimisticService.applyOptimisticUpdate as ReturnType<typeof vi.fn>).mockResolvedValue('op-1');
      (realtimeService.submitScore as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'score-1', ...score1 });

      await realtimeService.submitScore(score1);

      // Verify optimistic update was applied
      expect(optimisticService.applyOptimisticUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'create',
          entityType: 'score',
          payload: score1
        })
      );

      // Judge 2 submits conflicting score for same entry
      const score2 = {
        entryId: 'entry-1', // Same entry!
        judgeId: 'judge-2',
        classId: 'class-123',
        showId: 'show-456',
        score: 88,
        placement: 2,
        qualified: true
      };

      // Mock conflict detection
      (conflictResolver.detectConflicts as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'conflict-1',
        conflictType: 'concurrent_modification',
        priority: 'high',
        details: [{
          field: 'score',
          localValue: 92,
          remoteValue: 88
        }]
      });

      await realtimeService.submitScore(score2);

      // Should detect and handle conflict
      expect(conflictResolver.detectConflicts).toHaveBeenCalled();
    });

    it('should handle judge handoff during scoring', async () => {
      const judge1 = {
        id: 'judge-1',
        name: 'Judge Smith',
        role: 'judge' as const,
        status: 'online' as const
      };

      const judge2 = {
        id: 'judge-2',
        name: 'Judge Wilson', 
        role: 'head_judge' as const,
        status: 'online' as const
      };

      // Judge 1 starts scoring
      await presenceService.initialize(judge1);
      await presenceService.updateActivity('scoring', 'Entries 1-20');

      // Judge 1 scores several entries
      for (let i = 1; i <= 5; i++) {
        const score = {
          entryId: `entry-${i}`,
          judgeId: 'judge-1',
          classId: 'class-123',
          showId: 'show-456',
          score: 85 + i,
          placement: i,
          qualified: true
        };

        (realtimeService.submitScore as ReturnType<typeof vi.fn>).mockResolvedValue({ id: `score-${i}`, ...score });
        await realtimeService.submitScore(score);
      }

      // Judge 2 (head judge) takes over
      await presenceService.initialize(judge2);
      await presenceService.updateActivity('scoring', 'Reviewing and continuing entries 6-20');

      // Judge 2 reviews previous scores and makes adjustments
      const updatedScore = {
        score: 92,
        notes: 'Adjusted by head judge - excellent performance'
      };

      (conflictResolver.resolveConflict as ReturnType<typeof vi.fn>).mockResolvedValue({
        strategy: 'user_hierarchy',
        resolvedEntity: { ...updatedScore, judgeId: 'judge-2' },
        automatic: true
      });

      await realtimeService.updateScore('score-1', updatedScore);

      // Head judge authority should be respected
      expect(conflictResolver.resolveConflict).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userRole: 'head_judge'
        }),
        'user_hierarchy'
      );
    });

    it('should maintain scoring state across judge disconnections', async () => {
      const judge = {
        id: 'judge-1',
        name: 'Judge Smith',
        role: 'judge' as const,
        status: 'online' as const
      };

      await presenceService.initialize(judge);
      await realtimeService.subscribeToClass('class-123', 'show-456');

      // Judge submits several scores
      const scores = Array.from({ length: 3 }, (_, i) => ({
        entryId: `entry-${i + 1}`,
        judgeId: 'judge-1',
        classId: 'class-123',
        showId: 'show-456',
        score: 85 + i * 2,
        placement: i + 1,
        qualified: true
      }));

      for (const score of scores) {
        (optimisticService.applyOptimisticUpdate as ReturnType<typeof vi.fn>).mockResolvedValue(`op-${score.entryId}`);
        await realtimeService.submitScore(score);
      }

      // Simulate judge disconnection
      await presenceService.cleanup();

      // Mock pending operations
      (optimisticService.getPendingOperations as ReturnType<typeof vi.fn>).mockReturnValue([
        { id: 'op-entry-3', status: 'pending', entityType: 'score' }
      ]);

      // Judge reconnects
      await presenceService.initialize(judge);
      await realtimeService.subscribeToClass('class-123', 'show-456');

      // Should have pending operations
      const pendingOps = optimisticService.getPendingOperations();
      expect(pendingOps).toHaveLength(1);
    });
  });

  describe('Real-time Conflict Resolution Workflows', () => {
    it('should handle automatic conflict resolution in real-time', async () => {
      const context = {
        userId: 'judge-1',
        userRole: 'judge',
        userPermissions: ['score'],
        timestamp: new Date(),
        deviceId: 'device-1'
      };

      // Mock scoring conflict
      const conflict = {
        id: 'conflict-1',
        conflictType: 'field_conflict',
        priority: 'medium',
        localEntity: { score: 92, judgeId: 'judge-1' },
        remoteEntity: { score: 90, judgeId: 'judge-1' },
        details: [{ field: 'score', localValue: 92, remoteValue: 90 }]
      };

      (conflictResolver.detectConflicts as ReturnType<typeof vi.fn>).mockResolvedValue(conflict);
      (conflictResolver.resolveConflict as ReturnType<typeof vi.fn>).mockResolvedValue({
        strategy: 'last_write_wins',
        resolvedEntity: { score: 92, judgeId: 'judge-1' },
        automatic: true,
        conflictId: 'conflict-1'
      });

      // Setup conflict listener
      const conflictListener = vi.fn();
      optimisticService.on('conflictDetected', conflictListener);

      // Trigger conflict
      await optimisticService.applyOptimisticUpdate({
        type: 'update',
        entityType: 'score',
        entityId: 'score-1',
        payload: { score: 92 },
        execute: vi.fn().mockResolvedValue({ score: 90 }) // Conflicting result
      });

      // Should auto-resolve
      expect(conflictResolver.resolveConflict).toHaveBeenCalledWith(
        conflict,
        expect.objectContaining(context),
        'last_write_wins'
      );
    });

    it('should escalate critical conflicts for manual resolution', async () => {
      const criticalConflict = {
        id: 'conflict-critical',
        conflictType: 'business_rule_violation',
        priority: 'critical',
        localEntity: { placement: 1, qualified: true },
        remoteEntity: { placement: 1, qualified: false }, // Same placement, different qualification
        details: [
          { field: 'qualified', localValue: true, remoteValue: false }
        ]
      };

      (conflictResolver.detectConflicts as ReturnType<typeof vi.fn>).mockResolvedValue(criticalConflict);
      (conflictResolver.resolveConflict as ReturnType<typeof vi.fn>).mockResolvedValue({
        strategy: 'manual_required',
        automatic: false,
        conflictId: 'conflict-critical',
        requiresUserInput: true
      });

      const manualConflictListener = vi.fn();
      optimisticService.on('conflictDetected', manualConflictListener);

      await optimisticService.applyOptimisticUpdate({
        type: 'update',
        entityType: 'score',
        entityId: 'score-critical',
        payload: { placement: 1, qualified: true },
        execute: vi.fn().mockResolvedValue({ placement: 1, qualified: false })
      });

      expect(manualConflictListener).toHaveBeenCalledWith(
        expect.objectContaining({
          conflicts: expect.arrayContaining([criticalConflict])
        })
      );
    });

    it('should handle batch conflict resolution efficiently', async () => {
      // Create multiple simultaneous conflicts
      const conflicts = Array.from({ length: 10 }, (_, i) => ({
        id: `conflict-${i}`,
        conflictType: 'field_conflict',
        priority: 'low',
        localEntity: { score: 85 + i },
        remoteEntity: { score: 83 + i },
        details: [{ field: 'score', localValue: 85 + i, remoteValue: 83 + i }]
      }));

      (conflictResolver.batchResolveConflicts as ReturnType<typeof vi.fn>).mockResolvedValue(
        conflicts.map(conflict => ({
          strategy: 'last_write_wins',
          resolvedEntity: conflict.localEntity,
          automatic: true,
          conflictId: conflict.id
        }))
      );

      const startTime = Date.now();
      
      const resolutions = await conflictResolver.batchResolveConflicts(
        conflicts,
        {
          userId: 'admin-1',
          userRole: 'admin',
          userPermissions: ['admin'],
          timestamp: new Date(),
          deviceId: 'device-1'
        },
        'last_write_wins'
      );

      const endTime = Date.now();

      expect(resolutions).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(500); // Should be fast
      expect(resolutions.every(r => r.automatic)).toBe(true);
    });
  });

  describe('Cross-Service Integration Scenarios', () => {
    it('should coordinate presence updates with scoring activities', async () => {
      const judge = {
        id: 'judge-1',
        name: 'Judge Smith',
        role: 'judge' as const,
        status: 'online' as const
      };

      await presenceService.initialize(judge);

      // Subscribe to scoring events
      const scoringCallback = vi.fn();
      realtimeService.subscribe('score-update', scoringCallback);

      // Subscribe to presence updates  
      const presenceCallback = vi.fn();
      presenceService.subscribe(presenceCallback);

      // Judge starts scoring activity
      await presenceService.updateActivity('scoring', 'Evaluating Novice A');
      await presenceService.updateLocation('/scoring/class/123', 'class-123', 'show');

      // Judge submits score
      const score = {
        entryId: 'entry-1',
        judgeId: 'judge-1',
        classId: 'class-123',
        showId: 'show-456',
        score: 92,
        placement: 1,
        qualified: true
      };

      await realtimeService.submitScore(score);

      // Both services should be notified
      expect(presenceService.updateActivity).toHaveBeenCalledWith('scoring', 'Evaluating Novice A');
      expect(realtimeService.submitScore).toHaveBeenCalledWith(score);
    });

    it('should handle optimistic updates with presence awareness', async () => {
      // Two users editing same entity
      const user1 = { id: 'user-1', name: 'User 1', role: 'secretary' as const };

      // User 1 starts editing
      (presenceService.isUserEditing as ReturnType<typeof vi.fn>).mockReturnValue(null);
      await presenceService.updateActivity('editing', 'Updating dog profile');

      // Apply optimistic update
      const update = {
        type: 'update' as const,
        entityType: 'dog',
        entityId: 'dog-123',
        payload: { name: 'Updated Name' },
        execute: vi.fn().mockResolvedValue({ name: 'Updated Name' })
      };

      (optimisticService.applyOptimisticUpdate as ReturnType<typeof vi.fn>).mockResolvedValue('op-1');
      await optimisticService.applyOptimisticUpdate(update);

      // User 2 tries to edit same entity
      (presenceService.isUserEditing as ReturnType<typeof vi.fn>).mockReturnValue(user1);
      
      const editingUser = presenceService.isUserEditing('dog', 'dog-123');
      expect(editingUser).toEqual(user1);

      // Should warn about concurrent editing
      expect(presenceService.isUserEditing).toHaveBeenCalledWith('dog', 'dog-123');
    });

    it('should maintain consistency across service failures', async () => {
      const judge = {
        id: 'judge-1',
        name: 'Judge Smith',
        role: 'judge' as const,
        status: 'online' as const
      };

      await presenceService.initialize(judge);

      // Simulate presence service failure
      (presenceService.updateActivity as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Presence service down'));

      // Should still allow scoring to continue
      const score = {
        entryId: 'entry-1',
        judgeId: 'judge-1',
        classId: 'class-123',
        showId: 'show-456',
        score: 92,
        placement: 1,
        qualified: true
      };

      (realtimeService.submitScore as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'score-1', ...score });

      // Should not throw error
      await expect(realtimeService.submitScore(score)).resolves.toBeDefined();

      // Optimistic update should still work
      expect(optimisticService.applyOptimisticUpdate).toHaveBeenCalled();
    });
  });

  describe('Performance Under Load', () => {
    it('should handle high-frequency real-time updates', async () => {
      const judges = Array.from({ length: 10 }, (_, i) => ({
        id: `judge-${i}`,
        name: `Judge ${i}`,
        role: 'judge' as const,
        status: 'online' as const
      }));

      // Initialize all judges
      for (const judge of judges) {
        await presenceService.initialize(judge);
        await realtimeService.subscribeToClass('class-123', 'show-456');
      }

      const startTime = Date.now();

      // Each judge submits 5 scores rapidly
      const scorePromises = [];
      for (let judgeIdx = 0; judgeIdx < judges.length; judgeIdx++) {
        for (let scoreIdx = 0; scoreIdx < 5; scoreIdx++) {
          const score = {
            entryId: `entry-${judgeIdx * 5 + scoreIdx}`,
            judgeId: `judge-${judgeIdx}`,
            classId: 'class-123',
            showId: 'show-456',
            score: 80 + scoreIdx * 2,
            placement: scoreIdx + 1,
            qualified: true
          };

          scorePromises.push(realtimeService.submitScore(score));
        }
      }

      await Promise.all(scorePromises);
      const endTime = Date.now();

      // Should handle 50 concurrent scores efficiently
      expect(endTime - startTime).toBeLessThan(2000);
      expect(realtimeService.submitScore).toHaveBeenCalledTimes(50);
    });

    it('should maintain performance with many presence updates', async () => {
      const users = Array.from({ length: 50 }, (_, i) => ({
        id: `user-${i}`,
        name: `User ${i}`,
        role: (i % 4 === 0 ? 'judge' : i % 4 === 1 ? 'secretary' : i % 4 === 2 ? 'exhibitor' : 'admin') as const,
        status: 'online' as const
      }));

      const startTime = Date.now();

      // Rapid presence updates
      const updatePromises = users.map(async (user, i) => {
        await presenceService.initialize(user);
        await presenceService.updateLocation(`/page-${i % 5}`, `entity-${i}`, 'show');
        await presenceService.updateActivity(
          i % 3 === 0 ? 'viewing' : i % 3 === 1 ? 'editing' : 'scoring',
          `Activity ${i}`
        );
      });

      await Promise.all(updatePromises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1500);
      expect(presenceService.initialize).toHaveBeenCalledTimes(50);
    });

    it('should handle complex conflict resolution scenarios under load', async () => {
      // Create many overlapping conflicts
      const conflicts = Array.from({ length: 20 }, (_, i) => ({
        id: `conflict-load-${i}`,
        conflictType: 'field_conflict',
        priority: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
        localEntity: { score: 85 + i, notes: `Local ${i}` },
        remoteEntity: { score: 87 + i, notes: `Remote ${i}` },
        details: [
          { field: 'score', localValue: 85 + i, remoteValue: 87 + i },
          { field: 'notes', localValue: `Local ${i}`, remoteValue: `Remote ${i}` }
        ]
      }));

      const context = {
        userId: 'admin-1',
        userRole: 'admin',
        userPermissions: ['admin'],
        timestamp: new Date(),
        deviceId: 'device-1'
      };

      const startTime = Date.now();
      
      (conflictResolver.batchResolveConflicts as ReturnType<typeof vi.fn>).mockResolvedValue(
        conflicts.map(conflict => ({
          strategy: 'field_merge',
          resolvedEntity: { 
            score: Math.max(conflict.localEntity.score, conflict.remoteEntity.score),
            notes: `${conflict.localEntity.notes} + ${conflict.remoteEntity.notes}`
          },
          automatic: conflict.priority !== 'high',
          conflictId: conflict.id
        }))
      );

      const resolutions = await conflictResolver.batchResolveConflicts(
        conflicts,
        context,
        'field_merge'
      );

      const endTime = Date.now();

      expect(resolutions).toHaveLength(20);
      expect(endTime - startTime).toBeLessThan(1000);

      // High priority conflicts should require manual resolution
      const manualResolutions = resolutions.filter(r => !r.automatic);
      expect(manualResolutions.length).toBeGreaterThan(0);
    });
  });
});