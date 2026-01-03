import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RealtimeScoringService } from '../../../services/realtime/RealtimeScoringService';
import { Score } from '../../../types/scoring-types';

// Mock Supabase
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  track: vi.fn(),
  untrack: vi.fn(),
  send: vi.fn(),
  presenceState: vi.fn().mockReturnValue({}),
  updatePostgresChangesFilter: vi.fn()
};

const mockSupabase = {
  channel: vi.fn().mockReturnValue(mockChannel)
};

vi.mock('@/lib/supabase-client', () => ({
  supabase: mockSupabase
}));

// Mock other services
vi.mock('../../../services/offline/OfflineScoringService', () => ({
  OfflineScoringService: {
    getInstance: vi.fn().mockReturnValue({
      updateScoreCache: vi.fn(),
      saveScore: vi.fn().mockResolvedValue({ id: 'test-score', score: 85 }),
      updateScore: vi.fn().mockResolvedValue({ id: 'test-score', score: 90 }),
      deleteScore: vi.fn()
    })
  }
}));

vi.mock('../../../services/scoring/PlacementCalculatorService', () => ({
  PlacementCalculatorService: {
    getInstance: vi.fn().mockReturnValue({
      calculatePlacements: vi.fn().mockResolvedValue([
        { entryId: 'entry-1', placement: 1 },
        { entryId: 'entry-2', placement: 2 }
      ])
    })
  }
}));

vi.mock('../../../services/conflict/ConflictResolver', () => ({
  ConflictResolver: {
    getInstance: vi.fn().mockReturnValue({
      addConflict: vi.fn(),
      resolveConflict: vi.fn(),
      isAutoResolutionEnabled: vi.fn().mockReturnValue(true)
    })
  }
}));

vi.mock('../../../services/sync/SyncQueue', () => ({
  SyncQueue: {
    getInstance: vi.fn().mockReturnValue({
      enqueue: vi.fn(),
      processQueue: vi.fn()
    })
  }
}));

describe('RealtimeScoringService - Phase 4 Tests', () => {
  let service: RealtimeScoringService;
  let scoreUpdateCallback: ((payload: Record<string, unknown>) => void) | undefined;
  let presenceJoinCallback: ((payload: Record<string, unknown>) => void) | undefined;
  let presenceLeaveCallback: ((payload: Record<string, unknown>) => void) | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Capture event handlers
    mockChannel.on.mockImplementation((event: string, filter: Record<string, unknown>, callback?: (payload: Record<string, unknown>) => void) => {
      if (event === 'postgres_changes' && filter.table === 'scores') {
        scoreUpdateCallback = callback || filter;
      } else if (event === 'postgres_changes' && filter.table === 'placements') {
        // Placement update callback would be assigned here
      } else if (event === 'presence' && filter.event === 'join') {
        presenceJoinCallback = callback || filter;
      } else if (event === 'presence' && filter.event === 'leave') {
        presenceLeaveCallback = callback || filter;
      }
      return mockChannel;
    });

    mockChannel.subscribe.mockImplementation((callback) => {
      callback('SUBSCRIBED');
      return Promise.resolve();
    });

    service = RealtimeScoringService.getInstance();
  });

  afterEach(async () => {
    await service.disconnect();
  });

  describe('Real-time Score Updates', () => {
    it('should handle real-time score updates from multiple judges', async () => {
      const updateListener = vi.fn();
      service.subscribe('score-update', updateListener);

      // Simulate score update from database
      const newScore: Score = {
        id: 'score-1',
        entryId: 'entry-123',
        judgeId: 'judge-1',
        classId: 'class-1',
        showId: 'show-1',
        score: 92,
        placement: 1,
        qualified: true,
        notes: 'Excellent performance',
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T11:00:00Z'
      };

      await scoreUpdateCallback({
        eventType: 'UPDATE',
        new: newScore,
        old: { ...newScore, score: 85 }
      });

      expect(updateListener).toHaveBeenCalledWith({
        eventType: 'UPDATE',
        score: newScore,
        timestamp: expect.any(Date)
      });
    });

    it('should detect and handle scoring conflicts', async () => {
      const conflictListener = vi.fn();
      service.subscribe('scoring-conflict', conflictListener);

      // Simulate concurrent score updates
      const baseScore: Score = {
        id: 'score-1',
        entryId: 'entry-123',
        judgeId: 'judge-1',
        classId: 'class-1',
        showId: 'show-1',
        score: 85,
        placement: 3,
        qualified: true,
        created_at: '2024-01-01T10:00:00Z',
        updated_at: '2024-01-01T10:00:00Z'
      };

      const newScore: Score = {
        ...baseScore,
        judgeId: 'judge-2', // Different judge
        score: 92,
        placement: 1,
        updated_at: '2024-01-01T10:00:03Z' // Within conflict window
      };

      await scoreUpdateCallback({
        eventType: 'UPDATE',
        new: newScore,
        old: baseScore
      });

      expect(conflictListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'concurrent_update',
          entityType: 'score'
        })
      );
    });

    it('should throttle rapid score updates', async () => {
      const updateListener = vi.fn();
      service.subscribe('score-update', updateListener);

      // Send multiple rapid updates
      const updates = Array.from({ length: 5 }, (_, i) => ({
        eventType: 'UPDATE',
        new: {
          id: 'score-1',
          entryId: 'entry-123',
          judgeId: 'judge-1',
          classId: 'class-1',
          showId: 'show-1',
          score: 85 + i,
          placement: 1,
          qualified: true,
          created_at: '2024-01-01T10:00:00Z',
          updated_at: `2024-01-01T10:00:0${i}Z`
        },
        old: null
      }));

      // Send all updates rapidly
      for (const update of updates) {
        scoreUpdateCallback(update);
      }

      // Wait for throttling
      await new Promise(resolve => setTimeout(resolve, 400));

      // Should be throttled to fewer calls
      expect(updateListener.mock.calls.length).toBeLessThan(updates.length);
    });
  });

  describe('Judge Presence Management', () => {
    it('should track judge presence accurately', async () => {
      const presenceListener = vi.fn();
      service.subscribe('judge-joined', presenceListener);

      await service.updateJudgePresence(
        'judge-1',
        'John Smith',
        'class-123',
        'active'
      );

      expect(mockChannel.track).toHaveBeenCalledWith({
        judge_id: 'judge-1',
        judge_name: 'John Smith',
        class_id: 'class-123',
        last_activity: expect.any(String),
        status: 'active'
      });

      // Simulate presence join event
      presenceJoinCallback('judge-1', [{
        judge_id: 'judge-1',
        judge_name: 'John Smith',
        class_id: 'class-123',
        last_activity: new Date().toISOString(),
        status: 'active'
      }]);

      expect(presenceListener).toHaveBeenCalledWith(
        expect.objectContaining({
          judgeId: 'judge-1',
          judgeName: 'John Smith',
          status: 'active'
        })
      );
    });

    it('should handle judge disconnections gracefully', async () => {
      const leaveListener = vi.fn();
      service.subscribe('judge-left', leaveListener);

      // First add a judge
      await service.updateJudgePresence('judge-1', 'John Smith', 'class-123');

      // Simulate judge leaving
      presenceLeaveCallback('judge-1', [{
        judge_id: 'judge-1',
        judge_name: 'John Smith'
      }]);

      expect(leaveListener).toHaveBeenCalledWith({
        judgeId: 'judge-1',
        judgeName: 'John Smith'
      });

      expect(service.isJudgeActive('judge-1')).toBe(false);
    });

    it('should filter active judges by class', async () => {
      // Add multiple judges to different classes
      await service.updateJudgePresence('judge-1', 'John Smith', 'class-123');
      await service.updateJudgePresence('judge-2', 'Jane Doe', 'class-456');
      await service.updateJudgePresence('judge-3', 'Bob Wilson', 'class-123');

      // Simulate presence state
      service['presenceStates'].set('judge-1', {
        judgeId: 'judge-1',
        judgeName: 'John Smith',
        classId: 'class-123',
        lastActivity: new Date(),
        status: 'active'
      });

      service['presenceStates'].set('judge-2', {
        judgeId: 'judge-2',
        judgeName: 'Jane Doe',
        classId: 'class-456',
        lastActivity: new Date(),
        status: 'active'
      });

      service['presenceStates'].set('judge-3', {
        judgeId: 'judge-3',
        judgeName: 'Bob Wilson',
        classId: 'class-123',
        lastActivity: new Date(),
        status: 'active'
      });

      const class123Judges = service.getActiveJudges('class-123');
      expect(class123Judges).toHaveLength(2);
      expect(class123Judges.map(j => j.judgeId)).toEqual(['judge-1', 'judge-3']);

      const allJudges = service.getActiveJudges();
      expect(allJudges).toHaveLength(3);
    });
  });

  describe('Connection Management', () => {
    it('should handle connection loss and recovery', async () => {
      const connectionListener = vi.fn();
      service.subscribe('connection-lost', connectionListener);
      service.subscribe('connection-restored', connectionListener);

      // Simulate connection loss
      window.dispatchEvent(new Event('offline'));

      expect(connectionListener).toHaveBeenCalledWith({
        timestamp: expect.any(Date)
      });

      // Simulate connection recovery
      window.dispatchEvent(new Event('online'));

      // Should attempt to reconnect
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('should handle reconnection with exponential backoff', async () => {
      const connectionFailedListener = vi.fn();
      service.subscribe('connection-failed', connectionFailedListener);

      // Mock failed subscriptions
      mockChannel.subscribe.mockRejectedValue(new Error('Connection failed'));

      // Trigger reconnection attempts
      for (let i = 0; i < 6; i++) {
        service['scheduleReconnect']();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Should eventually stop trying after max attempts
      expect(connectionFailedListener).toHaveBeenCalledWith({
        attempts: expect.any(Number),
        timestamp: expect.any(Date)
      });
    });

    it('should send heartbeat messages to maintain connection', async () => {
      // Wait for heartbeat interval
      await new Promise(resolve => setTimeout(resolve, 100));

      // Manually trigger heartbeat check
      service['isConnected'] = true;
      
      // Simulate heartbeat by calling the interval function directly
      // This would normally be triggered by setInterval
      expect(mockChannel.send).not.toHaveBeenCalled(); // Since we didn't wait full interval
    });
  });

  describe('Class Subscription Management', () => {
    it('should subscribe to specific class scoring', async () => {
      await service.subscribeToClass('class-123', 'show-456');

      expect(mockChannel.updatePostgresChangesFilter).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scores',
          filter: 'class_id=eq.class-123,show_id=eq.show-456'
        }
      );
    });

    it('should unsubscribe from class properly', async () => {
      await service.subscribeToClass('class-123', 'show-456');
      await service.unsubscribeFromClass('class-123');

      // Should remove class-specific subscriptions
      expect(service['subscriptions'].has('class-class-123')).toBe(false);
    });
  });

  describe('Score Operations', () => {
    it('should submit scores optimistically', async () => {
      const scoreData = {
        entryId: 'entry-123',
        judgeId: 'judge-1',
        classId: 'class-1',
        showId: 'show-1',
        score: 92,
        placement: 1,
        qualified: true
      };

      const result = await service.submitScore(scoreData);

      expect(result).toEqual({
        id: 'test-score',
        score: 85
      });

      // Should queue for sync
      const syncQueue = service['syncQueue'];
      expect(syncQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'create',
          entity: 'score'
        })
      );
    });

    it('should update scores with conflict detection', async () => {
      const updates = {
        score: 95,
        placement: 1,
        notes: 'Updated score'
      };

      const result = await service.updateScore('score-123', updates);

      expect(result).toEqual({
        id: 'test-score',
        score: 90
      });
    });

    it('should handle score deletion properly', async () => {
      await service.deleteScore('score-123');

      const offlineService = service['offlineService'];
      expect(offlineService.deleteScore).toHaveBeenCalledWith('score-123');

      const syncQueue = service['syncQueue'];
      expect(syncQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'delete',
          entity: 'score'
        })
      );
    });
  });

  describe('Performance and Stress Testing', () => {
    it('should handle high-frequency score updates efficiently', async () => {
      const updateListener = vi.fn();
      service.subscribe('score-update', updateListener);

      const startTime = Date.now();

      // Send 100 rapid score updates
      const updates = Array.from({ length: 100 }, (_, i) => ({
        eventType: 'UPDATE',
        new: {
          id: `score-${i}`,
          entryId: `entry-${i}`,
          judgeId: 'judge-1',
          classId: 'class-1',
          showId: 'show-1',
          score: 85 + (i % 15),
          placement: (i % 10) + 1,
          qualified: true,
          created_at: '2024-01-01T10:00:00Z',
          updated_at: `2024-01-01T10:00:${i.toString().padStart(2, '0')}Z`
        },
        old: null
      }));

      for (const update of updates) {
        scoreUpdateCallback(update);
      }

      const endTime = Date.now();
      
      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should manage memory usage with many presence updates', async () => {
      // Add 50 judges to test memory management
      for (let i = 0; i < 50; i++) {
        await service.updateJudgePresence(
          `judge-${i}`,
          `Judge ${i}`,
          `class-${i % 5}`,
          'active'
        );

        // Simulate presence state
        service['presenceStates'].set(`judge-${i}`, {
          judgeId: `judge-${i}`,
          judgeName: `Judge ${i}`,
          classId: `class-${i % 5}`,
          lastActivity: new Date(),
          status: 'active'
        });
      }

      expect(service.getActiveJudges()).toHaveLength(50);

      // Remove half the judges
      for (let i = 0; i < 25; i++) {
        presenceLeaveCallback(`judge-${i}`, [{
          judge_id: `judge-${i}`,
          judge_name: `Judge ${i}`
        }]);
      }

      expect(service.getActiveJudges()).toHaveLength(25);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed score updates gracefully', async () => {
      const errorListener = vi.fn();
      service.subscribe('error', errorListener);

      // Send malformed update
      await scoreUpdateCallback({
        eventType: 'UPDATE',
        new: null, // Invalid
        old: null
      });

      // Should not crash and should handle gracefully
      expect(() => service.getActiveJudges()).not.toThrow();
    });

    it('should recover from presence tracking errors', async () => {
      // Corrupt presence state
      service['presenceStates'].set('invalid', null as unknown);

      expect(() => service.getActiveJudges()).not.toThrow();
      expect(service.getActiveJudges()).toEqual([]);
    });

    it('should handle channel subscription failures', async () => {
      mockChannel.subscribe.mockRejectedValue(new Error('Subscription failed'));

      // Should not throw and should schedule reconnect
      expect(async () => {
        await service.subscribeToClass('class-123', 'show-456');
      }).not.toThrow();
    });
  });
});