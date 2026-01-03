import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RealtimeScoringService } from '../../../services/realtime/RealtimeScoringService';
import { PresenceService } from '../../../services/collaboration/PresenceService';
import { OptimisticUIService } from '../../../services/optimistic/OptimisticUIService';
import { ConflictResolver } from '../../../services/conflict/ConflictResolver';
import { User } from '../../../types/user-types';

interface TestUser extends User {
  role: string;
  permissions?: string[];
}

// Mock external dependencies
vi.mock('@/lib/supabase-client', () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      track: vi.fn(),
      untrack: vi.fn(),
      send: vi.fn(),
      presenceState: vi.fn().mockReturnValue({})
    })
  }
}));

vi.mock('../../../services/offline/OfflineScoringService', () => ({
  OfflineScoringService: {
    getInstance: vi.fn().mockReturnValue({
      updateScoreCache: vi.fn(),
      saveScore: vi.fn(),
      updateScore: vi.fn(),
      deleteScore: vi.fn()
    })
  }
}));

vi.mock('../../../services/scoring/PlacementCalculatorService', () => ({
  PlacementCalculatorService: {
    getInstance: vi.fn().mockReturnValue({
      calculatePlacements: vi.fn().mockResolvedValue([])
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

describe('Realtime Collaboration Workflows - E2E Phase 4', () => {
  let scenario: {
    judges: TestUser[];
    secretaries: TestUser[];
    exhibitors: TestUser[];
    services: {
      realtime: RealtimeScoringService;
      presence: PresenceService;
      optimistic: OptimisticUIService;
      conflicts: ConflictResolver;
    };
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create test personas
    scenario = {
      judges: [
        { id: 'judge-1', name: 'Sarah Wilson', role: 'head_judge', experience: 'senior' },
        { id: 'judge-2', name: 'Mike Johnson', role: 'judge', experience: 'intermediate' },
        { id: 'judge-3', name: 'Lisa Chen', role: 'judge', experience: 'junior' }
      ],
      secretaries: [
        { id: 'secretary-1', name: 'Emily Davis', role: 'secretary', department: 'entries' },
        { id: 'secretary-2', name: 'Tom Brown', role: 'secretary', department: 'results' }
      ],
      exhibitors: [
        { id: 'exhibitor-1', name: 'Jane Smith', role: 'exhibitor', dogCount: 3 },
        { id: 'exhibitor-2', name: 'Bob Taylor', role: 'exhibitor', dogCount: 1 }
      ],
      services: {
        realtime: RealtimeScoringService.getInstance(),
        presence: PresenceService.getInstance(),
        optimistic: OptimisticUIService.getInstance(),
        conflicts: new ConflictResolver()
      }
    };

    // Initialize all users
    const allUsers = [...scenario.judges, ...scenario.secretaries, ...scenario.exhibitors];
    for (const user of allUsers) {
      await scenario.services.presence.initialize({
        id: user.id,
        name: user.name,
        email: `${user.id}@example.com`,
        role: user.role,
        status: 'online'
      });
    }
  });

  afterEach(async () => {
    await scenario.services.realtime.disconnect();
    await scenario.services.presence.cleanup();
    scenario.services.optimistic.clearCompletedOperations();
  });

  describe('Complete Show Day Workflow', () => {
    it('should handle complete judging workflow from setup to results', async () => {
      const showId = 'regional-championship-2024';
      const classId = 'novice-a-standard';
      
      // === PHASE 1: Show Setup ===
      console.log('🏁 Starting show day workflow...');
      
      // Secretary sets up the show
      await scenario.services.presence.updateActivity('editing', 'Setting up show classes');
      await scenario.services.presence.updateLocation('/shows/setup', showId, 'show');

      // Head judge reviews setup
      const headJudge = scenario.judges[0];
      await scenario.services.presence.updateActivity('viewing', 'Reviewing class setup');
      await scenario.services.presence.updateLocation('/shows/review', showId, 'show');

      // === PHASE 2: Class Preparation ===
      console.log('📋 Preparing class for judging...');
      
      // Judge subscribes to class
      await scenario.services.realtime.subscribeToClass(classId, showId);
      await scenario.services.presence.updateLocation('/scoring/class', classId, 'show');
      await scenario.services.presence.updateActivity('judging', 'Starting Novice A Standard');

      // === PHASE 3: Concurrent Scoring ===
      console.log('⚖️ Beginning scoring phase...');
      
      const entries = Array.from({ length: 15 }, (_, i) => ({
        id: `entry-${i + 1}`,
        dogName: `Dog ${i + 1}`,
        handlerName: `Handler ${i + 1}`,
        armband: i + 1
      }));

      // Primary judge scores entries 1-10
      const primaryJudge = scenario.judges[1];
      await scenario.services.presence.updateActivity('scoring', 'Entries 1-10');
      
      const primaryScores = [];
      for (let i = 0; i < 10; i++) {
        const score = {
          entryId: entries[i].id,
          judgeId: primaryJudge.id,
          classId,
          showId,
          score: 85 + Math.random() * 10,
          placement: 0, // Will be calculated
          qualified: Math.random() > 0.3,
          notes: `Entry ${i + 1} performance notes`
        };
        
        const operationId = await scenario.services.optimistic.applyOptimisticUpdate({
          type: 'create',
          entityType: 'score',
          entityId: `score-${score.entryId}`,
          payload: score,
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 50)); // Simulate network
            return { id: `score-${score.entryId}`, ...score };
          }
        });
        
        primaryScores.push({ ...score, operationId });
      }

      // Secondary judge scores entries 11-15
      const secondaryJudge = scenario.judges[2];
      await scenario.services.presence.updateActivity('scoring', 'Entries 11-15');
      
      const secondaryScores = [];
      for (let i = 10; i < 15; i++) {
        const score = {
          entryId: entries[i].id,
          judgeId: secondaryJudge.id,
          classId,
          showId,
          score: 80 + Math.random() * 15,
          placement: 0,
          qualified: Math.random() > 0.2,
          notes: `Entry ${i + 1} evaluation`
        };
        
        const operationId = await scenario.services.optimistic.applyOptimisticUpdate({
          type: 'create',
          entityType: 'score',
          entityId: `score-${score.entryId}`,
          payload: score,
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 75)); // Simulate network
            return { id: `score-${score.entryId}`, ...score };
          }
        });
        
        secondaryScores.push({ ...score, operationId });
      }

      // === PHASE 4: Conflict Resolution ===
      console.log('🔄 Handling scoring conflicts...');
      
      // Simulate a scoring conflict - two judges score the same entry
      const conflictEntry = entries[5];
      const conflictScore = {
        entryId: conflictEntry.id,
        judgeId: secondaryJudge.id, // Different judge
        classId,
        showId,
        score: 92, // Different score
        placement: 1,
        qualified: true,
        notes: 'Outstanding performance - deserves higher placement'
      };

      // This should trigger conflict detection
      const conflict = await scenario.services.conflicts.detectConflicts(
        conflictScore,
        primaryScores.find(s => s.entryId === conflictEntry.id)!,
        null
      );

      if (conflict) {
        console.log('⚠️ Conflict detected - escalating to head judge');
        
        // Head judge resolves conflict
        const resolution = await scenario.services.conflicts.resolveConflict(
          conflict,
          {
            userId: headJudge.id,
            userRole: 'head_judge',
            userPermissions: ['score', 'override'],
            timestamp: new Date(),
            deviceId: 'judge-tablet-1'
          },
          'user_hierarchy'
        );

        expect(resolution.strategy).toBe('user_hierarchy');
        expect(resolution.automatic).toBe(true);
      }

      // === PHASE 5: Real-time Updates ===
      console.log('📡 Processing real-time updates...');
      
      // Simulate real-time score updates being received
      const realtimeUpdates: unknown[] = [];
      const updateCallback = vi.fn((update: unknown) => {
        realtimeUpdates.push(update);
      });
      
      scenario.services.realtime.subscribe('score-update', updateCallback);
      scenario.services.realtime.subscribe('placement-update', updateCallback);

      // Wait for all optimistic updates to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // === PHASE 6: Placement Calculation ===
      console.log('🏆 Calculating final placements...');
      
      // Head judge reviews and finalizes placements
      await scenario.services.presence.updateActivity('reviewing', 'Finalizing placements');
      
      const allScores = [...primaryScores, ...secondaryScores];
      const qualifiedScores = allScores.filter(s => s.qualified);
      
      // Sort by score for placement calculation
      qualifiedScores.sort((a, b) => b.score - a.score);
      
      // Update placements
      for (let i = 0; i < qualifiedScores.length; i++) {
        const placementUpdate = {
          score: qualifiedScores[i].score,
          placement: i + 1
        };
        
        await scenario.services.optimistic.applyOptimisticUpdate({
          type: 'update',
          entityType: 'score',
          entityId: `score-${qualifiedScores[i].entryId}`,
          payload: placementUpdate,
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 30));
            return { ...qualifiedScores[i], ...placementUpdate };
          }
        });
      }

      // === PHASE 7: Results Publication ===
      console.log('📢 Publishing results...');
      
      // Secretary publishes results
      await scenario.services.presence.updateActivity('editing', 'Publishing class results');
      await scenario.services.presence.updateLocation('/results/publish', classId, 'show');

      // Exhibitors view results
      for (let i = 0; i < scenario.exhibitors.length; i++) {
        await scenario.services.presence.updateActivity('viewing', 'Checking results');
        await scenario.services.presence.updateLocation('/results/view', classId, 'show');
      }

      // === VERIFICATION ===
      console.log('✅ Verifying workflow completion...');
      
      // Verify all users are tracked
      const activeUsers = scenario.services.presence.getActiveUsers();
      expect(activeUsers.length).toBe(scenario.judges.length + scenario.secretaries.length + scenario.exhibitors.length);

      // Verify scoring activities
      const scoringUsers = activeUsers.filter(user => 
        user.activity?.type === 'scoring' || user.activity?.type === 'reviewing'
      );
      expect(scoringUsers.length).toBeGreaterThan(0);

      // Verify all scores were processed
      const pendingOperations = scenario.services.optimistic.getPendingOperations();
      expect(pendingOperations.length).toBeLessThan(5); // Some might still be processing

      console.log('🎉 Show day workflow completed successfully!');
    });
  });

  describe('Multi-Ring Competition Scenario', () => {
    it('should handle multiple concurrent rings with judge rotation', async () => {
      const rings = ['ring-a', 'ring-b', 'ring-c'];
      const classes = [
        { id: 'class-novice-a', ring: 'ring-a', judge: scenario.judges[0] },
        { id: 'class-open-a', ring: 'ring-b', judge: scenario.judges[1] },
        { id: 'class-utility', ring: 'ring-c', judge: scenario.judges[2] }
      ];

      console.log('🎪 Starting multi-ring competition...');

      // === SETUP PHASE ===
      // Each judge goes to their assigned ring
      for (const classInfo of classes) {
        await scenario.services.presence.updateActivity('setup', `Preparing ${classInfo.id}`);
        await scenario.services.presence.updateLocation(`/rings/${classInfo.ring}`, classInfo.id, 'show');
        await scenario.services.realtime.subscribeToClass(classInfo.id, 'multi-ring-show');
      }

      // === CONCURRENT JUDGING ===
      console.log('⚖️ Beginning concurrent judging...');
      
      const judingPromises = classes.map(async (classInfo, classIndex) => {
        const entryCount = 8 + classIndex * 2; // Different entry counts
        const scores = [];
        
        for (let i = 0; i < entryCount; i++) {
          const score = {
            entryId: `${classInfo.id}-entry-${i + 1}`,
            judgeId: classInfo.judge.id,
            classId: classInfo.id,
            showId: 'multi-ring-show',
            score: 80 + Math.random() * 15,
            placement: 0,
            qualified: Math.random() > 0.25
          };

          const operationId = await scenario.services.optimistic.applyOptimisticUpdate({
            type: 'create',
            entityType: 'score',
            entityId: `score-${score.entryId}`,
            payload: score,
            execute: async () => {
              // Simulate varying network conditions per ring
              const delay = 50 + (classIndex * 25);
              await new Promise(resolve => setTimeout(resolve, delay));
              return { id: `score-${score.entryId}`, ...score };
            }
          });

          scores.push({ ...score, operationId });
          
          // Stagger scoring to simulate real timing
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        return { classInfo, scores };
      });

      const ringResults = await Promise.all(judingPromises);

      // === JUDGE ROTATION ===
      console.log('🔄 Handling judge rotation...');
      
      // After first class, judges rotate
      const rotatedAssignments = [
        { class: classes[0], newJudge: scenario.judges[1] },
        { class: classes[1], newJudge: scenario.judges[2] },
        { class: classes[2], newJudge: scenario.judges[0] }
      ];

      for (const assignment of rotatedAssignments) {
        // Original judge signs off
        await scenario.services.presence.updateActivity('completed', `Finished ${assignment.class.id}`);
        
        // New judge takes over
        await scenario.services.presence.updateActivity('reviewing', `Taking over ${assignment.class.id}`);
        await scenario.services.presence.updateLocation(`/rings/${assignment.class.ring}`, assignment.class.id, 'show');
      }

      // === CONFLICT HANDLING ACROSS RINGS ===
      console.log('🔧 Managing cross-ring conflicts...');
      
      // Simulate a scoring dispute that requires head judge intervention
      const disputeScore = ringResults[0].scores[0];
      
      // Head judge reviews disputed score
      await scenario.services.presence.updateActivity('reviewing', 'Resolving scoring dispute');
      
      const reviewedScore = {
        ...disputeScore,
        score: disputeScore.score + 2,
        notes: 'Adjusted by head judge after review'
      };

      await scenario.services.optimistic.applyOptimisticUpdate({
        type: 'update',
        entityType: 'score',
        entityId: `score-${disputeScore.entryId}`,
        payload: reviewedScore,
        execute: async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return reviewedScore;
        }
      });

      // === VERIFICATION ===
      console.log('✅ Verifying multi-ring competition...');
      
      // Verify all rings have activity
      const activeUsersByRing = rings.map(ring => 
        scenario.services.presence.getActiveUsersOnPage(`/rings/${ring}`)
      );
      
      activeUsersByRing.forEach(users => {
        expect(users.length).toBeGreaterThan(0);
      });

      // Verify scoring across all classes
      const totalScores = ringResults.reduce((sum, result) => sum + result.scores.length, 0);
      expect(totalScores).toBeGreaterThan(20);

      console.log('🏁 Multi-ring competition completed successfully!');
    });
  });

  describe('Network Disruption Recovery', () => {
    it('should handle network failures and recovery gracefully', async () => {
      const judge = scenario.judges[0];
      const classId = 'network-test-class';
      const showId = 'network-test-show';

      console.log('🌐 Testing network disruption scenarios...');

      // === INITIAL SETUP ===
      await scenario.services.realtime.subscribeToClass(classId, showId);
      await scenario.services.presence.updateActivity('scoring', 'Network resilience test');

      // === PHASE 1: Normal Operation ===
      console.log('✅ Phase 1: Normal network operation');
      
      const normalScores = [];
      for (let i = 0; i < 3; i++) {
        const score = {
          entryId: `network-entry-${i + 1}`,
          judgeId: judge.id,
          classId,
          showId,
          score: 85 + i * 2,
          placement: i + 1,
          qualified: true
        };

        const operationId = await scenario.services.optimistic.applyOptimisticUpdate({
          type: 'create',
          entityType: 'score',
          entityId: `score-${score.entryId}`,
          payload: score,
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return { id: `score-${score.entryId}`, ...score };
          }
        });

        normalScores.push({ ...score, operationId });
      }

      // Wait for normal operations to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // === PHASE 2: Network Disruption ===
      console.log('❌ Phase 2: Simulating network failure');
      
      // Mock network failure
      const failingScores = [];
      for (let i = 3; i < 6; i++) {
        const score = {
          entryId: `network-entry-${i + 1}`,
          judgeId: judge.id,
          classId,
          showId,
          score: 85 + i * 2,
          placement: i + 1,
          qualified: true
        };

        const operationId = await scenario.services.optimistic.applyOptimisticUpdate({
          type: 'create',
          entityType: 'score',
          entityId: `score-${score.entryId}`,
          payload: score,
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            throw new Error('Network timeout'); // Simulate failure
          },
          maxRetries: 2
        });

        failingScores.push({ ...score, operationId });
      }

      // Simulate going offline
      window.dispatchEvent(new Event('offline'));
      await scenario.services.presence.updatePresence({ status: 'away' });

      // Wait for failure handling
      await new Promise(resolve => setTimeout(resolve, 500));

      // === PHASE 3: Offline Operation ===
      console.log('📴 Phase 3: Offline operation mode');
      
      const offlineScores = [];
      for (let i = 6; i < 8; i++) {
        const score = {
          entryId: `network-entry-${i + 1}`,
          judgeId: judge.id,
          classId,
          showId,
          score: 85 + i * 2,
          placement: i + 1,
          qualified: true
        };

        // These should be queued for later sync
        const operationId = await scenario.services.optimistic.applyOptimisticUpdate({
          type: 'create',
          entityType: 'score',
          entityId: `score-${score.entryId}`,
          payload: score,
          execute: async () => {
            // In offline mode, this would queue the operation
            return { id: `score-${score.entryId}`, ...score, _offline: true };
          }
        });

        offlineScores.push({ ...score, operationId });
      }

      // === PHASE 4: Network Recovery ===
      console.log('🔄 Phase 4: Network recovery and sync');
      
      // Simulate coming back online
      window.dispatchEvent(new Event('online'));
      await scenario.services.presence.updatePresence({ status: 'online' });

      // Recovery operations should succeed
      const recoveryScores = [];
      for (let i = 8; i < 10; i++) {
        const score = {
          entryId: `network-entry-${i + 1}`,
          judgeId: judge.id,
          classId,
          showId,
          score: 85 + i * 2,
          placement: i + 1,
          qualified: true
        };

        const operationId = await scenario.services.optimistic.applyOptimisticUpdate({
          type: 'create',
          entityType: 'score',
          entityId: `score-${score.entryId}`,
          payload: score,
          execute: async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return { id: `score-${score.entryId}`, ...score };
          }
        });

        recoveryScores.push({ ...score, operationId });
      }

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      // === VERIFICATION ===
      console.log('✅ Verifying network disruption recovery...');
      
      // Check that operations are in expected states
      const pendingOperations = scenario.services.optimistic.getPendingOperations();
      
      // Should have some operations that failed and need retry
      expect(pendingOperations.length).toBeGreaterThan(0);
      
      // Normal scores should be confirmed
      // Failed scores should be marked for retry
      // Offline scores should be queued
      // Recovery scores should be processing/confirmed

      // Verify presence updates reflected network status
      expect(scenario.services.presence.updatePresence).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'away' })
      );
      expect(scenario.services.presence.updatePresence).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'online' })
      );

      console.log('🎉 Network disruption recovery test completed!');
    });
  });

  describe('Large-Scale Competition Simulation', () => {
    it('should handle championship-level competition with 200+ entries', async () => {
      const championshipId = 'national-championship-2024';
      const judgeCount = 8;
      const entriesPerClass = 25;
      const classCount = 10;

      console.log('🏆 Starting large-scale championship simulation...');

      // === SETUP PHASE ===
      console.log('📋 Setting up championship...');
      
      // Add additional judges for large event
      const additionalJudges = Array.from({ length: judgeCount - scenario.judges.length }, (_, i) => ({
        id: `championship-judge-${i + 1}`,
        name: `Championship Judge ${i + 1}`,
        role: 'judge',
        experience: 'senior'
      }));

      const allJudges = [...scenario.judges, ...additionalJudges];

      // Initialize additional judges
      for (const judge of additionalJudges) {
        await scenario.services.presence.initialize({
          id: judge.id,
          name: judge.name,
          email: `${judge.id}@championship.com`,
          role: 'judge',
          status: 'online'
        });
      }

      // === CONCURRENT JUDGING ACROSS MULTIPLE CLASSES ===
      console.log('⚖️ Beginning large-scale concurrent judging...');
      
      const classPromises = Array.from({ length: classCount }, async (_, classIndex) => {
        const classId = `championship-class-${classIndex + 1}`;
        const assignedJudge = allJudges[classIndex % allJudges.length];
        
        // Judge setup
        await scenario.services.presence.updateActivity('judging', `Class ${classIndex + 1}`);
        await scenario.services.presence.updateLocation(`/championship/class-${classIndex + 1}`, classId, 'show');
        await scenario.services.realtime.subscribeToClass(classId, championshipId);

        // Score all entries in this class
        const scores = [];
        for (let entryIndex = 0; entryIndex < entriesPerClass; entryIndex++) {
          const score = {
            entryId: `${classId}-entry-${entryIndex + 1}`,
            judgeId: assignedJudge.id,
            classId,
            showId: championshipId,
            score: 75 + Math.random() * 20, // More score variation for championship
            placement: 0, // Will be calculated
            qualified: Math.random() > 0.15, // Higher qualification rate
            notes: `Championship entry ${entryIndex + 1} evaluation`
          };

          const operationId = await scenario.services.optimistic.applyOptimisticUpdate({
            type: 'create',
            entityType: 'score',
            entityId: `score-${score.entryId}`,
            payload: score,
            execute: async () => {
              // Simulate varying network conditions
              const delay = 30 + Math.random() * 100;
              await new Promise(resolve => setTimeout(resolve, delay));
              return { id: `score-${score.entryId}`, ...score };
            }
          });

          scores.push({ ...score, operationId });
          
          // Small delay between scores to simulate real timing
          await new Promise(resolve => setTimeout(resolve, 20));
        }

        return { classId, classIndex, scores, judge: assignedJudge };
      });

      const startTime = performance.now();
      const allClassResults = await Promise.all(classPromises);
      const endTime = performance.now();

      const totalTime = endTime - startTime;
      const totalEntries = classCount * entriesPerClass;
      const entriesPerSecond = totalEntries / (totalTime / 1000);

      // === CONFLICT RESOLUTION AT SCALE ===
      console.log('🔧 Handling conflicts across all classes...');
      
      // Simulate some conflicts across different classes
      const conflicts = [];
      for (let i = 0; i < 10; i++) {
        const classResult = allClassResults[i % allClassResults.length];
        const conflictingScore = classResult.scores[i % classResult.scores.length];
        
        const conflict = {
          id: `championship-conflict-${i}`,
          conflictType: 'field_conflict',
          priority: i % 3 === 0 ? 'high' : 'medium',
          localEntity: conflictingScore,
          remoteEntity: { ...conflictingScore, score: conflictingScore.score + 3 },
          details: [{
            field: 'score',
            localValue: conflictingScore.score,
            remoteValue: conflictingScore.score + 3
          }]
        };
        
        conflicts.push(conflict);
      }

      // Resolve conflicts in batch
      const conflictStartTime = performance.now();
      const resolutions = await scenario.services.conflicts.batchResolveConflicts(
        conflicts,
        {
          userId: allJudges[0].id, // Head judge
          userRole: 'head_judge',
          userPermissions: ['score', 'override'],
          timestamp: new Date(),
          deviceId: 'championship-tablet'
        },
        'field_merge'
      );
      const conflictEndTime = performance.now();

      const conflictResolutionTime = conflictEndTime - conflictStartTime;

      // === FINAL PLACEMENTS AND RESULTS ===
      console.log('🏆 Calculating championship placements...');
      
      const placementPromises = allClassResults.map(async (classResult) => {
        const qualifiedScores = classResult.scores.filter(s => s.qualified);
        qualifiedScores.sort((a, b) => b.score - a.score);
        
        const placementUpdates = qualifiedScores.map((score, index) => ({
          ...score,
          placement: index + 1
        }));

        // Update placements optimistically
        const updatePromises = placementUpdates.map(async (score) => {
          return scenario.services.optimistic.applyOptimisticUpdate({
            type: 'update',
            entityType: 'score',
            entityId: `score-${score.entryId}`,
            payload: { placement: score.placement },
            execute: async () => {
              await new Promise(resolve => setTimeout(resolve, 25));
              return score;
            }
          });
        });

        await Promise.all(updatePromises);
        return placementUpdates;
      });

      const finalPlacements = await Promise.all(placementPromises);

      // === VERIFICATION AND METRICS ===
      console.log('📊 Analyzing championship performance...');
      
      // Performance metrics
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
      expect(entriesPerSecond).toBeGreaterThan(50); // Should handle 50+ entries per second
      expect(conflictResolutionTime).toBeLessThan(1000); // Conflicts resolved quickly

      // Data integrity
      expect(allClassResults).toHaveLength(classCount);
      expect(resolutions).toHaveLength(conflicts.length);
      expect(finalPlacements.flat().length).toBeGreaterThan(totalEntries * 0.8); // Most entries qualified

      // Presence tracking
      const activeUsers = scenario.services.presence.getActiveUsers();
      expect(activeUsers.length).toBe(allJudges.length + scenario.secretaries.length + scenario.exhibitors.length);

      // Operation status
      const pendingOperations = scenario.services.optimistic.getPendingOperations();
      const pendingPercentage = (pendingOperations.length / totalEntries) * 100;
      expect(pendingPercentage).toBeLessThan(10); // Less than 10% pending

      console.log(`🎉 Championship simulation completed!`);
      console.log(`📈 Performance metrics:`);
      console.log(`   - Total entries: ${totalEntries}`);
      console.log(`   - Processing time: ${totalTime.toFixed(0)}ms`);
      console.log(`   - Entries per second: ${entriesPerSecond.toFixed(1)}`);
      console.log(`   - Conflicts resolved: ${resolutions.length} in ${conflictResolutionTime.toFixed(0)}ms`);
      console.log(`   - Pending operations: ${pendingOperations.length} (${pendingPercentage.toFixed(1)}%)`);
    });
  });
});