import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  ConflictResolver, 
  ConflictType, 
  ConflictPriority, 
  ResolutionStrategy 
} from '../../../services/conflict/ConflictResolver';
import { SyncMetadata } from '../../../types/sync-types';

// Mock entities for comprehensive testing
interface TestScore extends SyncMetadata {
  id: string;
  entryId: string;
  judgeId: string;
  score: number;
  placement: number;
  qualified: boolean;
  notes?: string;
}

interface TestShow extends SyncMetadata {
  id: string;
  name: string;
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
  startDate: string;
  venue: string;
  entryCount: number;
}

interface TestDog extends SyncMetadata {
  id: string;
  name: string;
  breed: string;
  titles: string[];
  owner: string;
  registrationNumber: string;
}

describe('ConflictResolver - Comprehensive Phase 4 Tests', () => {
  let resolver: ConflictResolver;
  
  beforeEach(() => {
    resolver = new ConflictResolver();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any pending operations
    resolver.clearHistory();
  });

  describe('Multi-User Simultaneous Scoring Conflicts', () => {
    it('should handle multiple judges scoring same entry simultaneously', async () => {
      const baseScore: TestScore = {
        id: 'score-1',
        entryId: 'entry-123',
        judgeId: 'judge-1',
        score: 85,
        placement: 3,
        qualified: true,
        _version: 1,
        _lastModified: '2024-01-01T10:00:00Z',
        _syncStatus: 'synced',
        _deleted: false
      };

      // Judge 1 updates score
      const judge1Score = {
        ...baseScore,
        score: 92,
        placement: 1,
        notes: 'Excellent performance',
        _version: 2,
        _lastModified: '2024-01-01T10:01:00Z',
        _modifiedBy: { userId: 'judge-1', role: 'judge' }
      };

      // Judge 2 updates score (different judge, same entry)
      const judge2Score = {
        ...baseScore,
        judgeId: 'judge-2',
        score: 88,
        placement: 2,
        notes: 'Good form, minor deduction',
        _version: 2,
        _lastModified: '2024-01-01T10:01:30Z',
        _modifiedBy: { userId: 'judge-2', role: 'judge' }
      };

      const conflict = await resolver.detectConflicts(judge1Score, judge2Score, baseScore);
      
      expect(conflict).toBeTruthy();
      expect(conflict!.conflictType).toBe(ConflictType.CONCURRENT_MODIFICATION);
      expect(conflict!.priority).toBe(ConflictPriority.HIGH);
      
      // Should have multiple conflicting fields
      expect(conflict!.details.length).toBeGreaterThan(0);
      
      // Authority-based resolution - judge with higher authority wins
      const context = {
        userId: 'judge-1',
        userRole: 'judge',
        userPermissions: ['score'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        conflict!,
        context,
        ResolutionStrategy.USER_HIERARCHY
      );

      expect(resolution.strategy).toBe(ResolutionStrategy.USER_HIERARCHY);
      expect(resolution.automatic).toBe(true);
    });

    it('should prioritize head judge over associate judge', async () => {
      const baseScore: TestScore = {
        id: 'score-1',
        entryId: 'entry-123',
        judgeId: 'head-judge',
        score: 85,
        placement: 3,
        qualified: true,
        _version: 1,
        _lastModified: '2024-01-01T10:00:00Z',
        _syncStatus: 'synced',
        _deleted: false
      };

      const headJudgeScore = {
        ...baseScore,
        score: 95,
        placement: 1,
        _version: 2,
        _lastModified: '2024-01-01T10:02:00Z',
        _modifiedBy: { userId: 'head-judge', role: 'head_judge' }
      };

      const associateScore = {
        ...baseScore,
        judgeId: 'associate-judge',
        score: 78,
        placement: 4,
        _version: 2,
        _lastModified: '2024-01-01T10:01:45Z',
        _modifiedBy: { userId: 'associate-judge', role: 'judge' }
      };

      const conflict = await resolver.detectConflicts(headJudgeScore, associateScore, baseScore);
      
      const context = {
        userId: 'head-judge',
        userRole: 'head_judge',
        userPermissions: ['score', 'override'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        conflict!,
        context,
        ResolutionStrategy.BUSINESS_RULE_PRIORITY
      );

      expect(resolution.resolvedEntity.score).toBe(95); // Head judge wins
      expect(resolution.resolvedEntity.placement).toBe(1);
    });

    it('should handle tie-breaking rules for identical scores', async () => {
      const baseScore: TestScore = {
        id: 'score-1',
        entryId: 'entry-123',
        judgeId: 'judge-1',
        score: 90,
        placement: 2,
        qualified: true,
        _version: 1,
        _lastModified: '2024-01-01T10:00:00Z',
        _syncStatus: 'synced',
        _deleted: false
      };

      // Two identical scores from different judges
      const judge1Score = {
        ...baseScore,
        notes: 'Excellent run, minor handling error',
        _version: 2,
        _lastModified: '2024-01-01T10:01:00Z',
        _modifiedBy: { userId: 'judge-1', role: 'judge' }
      };

      const judge2Score = {
        ...baseScore,
        judgeId: 'judge-2',
        notes: 'Great performance, could improve speed',
        _version: 2,
        _lastModified: '2024-01-01T10:01:15Z',
        _modifiedBy: { userId: 'judge-2', role: 'judge' }
      };

      const conflict = await resolver.detectConflicts(judge1Score, judge2Score, baseScore);
      
      // Should require manual resolution for tie-breaking
      expect(conflict!.priority).toBe(ConflictPriority.CRITICAL);
      
      const context = {
        userId: 'admin-1',
        userRole: 'admin',
        userPermissions: ['admin'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        conflict!,
        context,
        ResolutionStrategy.MANUAL_REQUIRED
      );

      expect(resolution.strategy).toBe(ResolutionStrategy.MANUAL_REQUIRED);
      expect(resolution.automatic).toBe(false);
    });
  });

  describe('Show Status Progression Business Rules', () => {
    it('should prevent show status regression', async () => {
      const baseShow: TestShow = {
        id: 'show-1',
        name: 'Regional Championship',
        status: 'in_progress',
        startDate: '2024-01-15',
        venue: 'Convention Center',
        entryCount: 150,
        _version: 3,
        _lastModified: '2024-01-01T10:00:00Z',
        _syncStatus: 'synced',
        _deleted: false
      };

      // Attempt to regress from in_progress to draft
      const localShow = {
        ...baseShow,
        entryCount: 152,
        _version: 4,
        _lastModified: '2024-01-01T11:00:00Z',
        _modifiedBy: { userId: 'secretary-1', role: 'secretary' }
      };

      const remoteShow = {
        ...baseShow,
        status: 'draft' as const, // Invalid regression
        _version: 4,
        _lastModified: '2024-01-01T11:30:00Z',
        _modifiedBy: { userId: 'user-1', role: 'user' }
      };

      const conflict = await resolver.detectConflicts(localShow, remoteShow, baseShow);
      
      expect(conflict).toBeTruthy();
      expect(conflict!.conflictType).toBe(ConflictType.BUSINESS_RULE_VIOLATION);
      
      const context = {
        userId: 'secretary-1',
        userRole: 'secretary',
        userPermissions: ['manage_shows'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        conflict!,
        context,
        ResolutionStrategy.BUSINESS_RULE_PRIORITY
      );

      expect(resolution.resolvedEntity.status).toBe('in_progress'); // Maintains progression
      expect(resolution.resolvedEntity.entryCount).toBe(152); // Keeps valid changes
    });

    it('should allow valid show status progression', async () => {
      const baseShow: TestShow = {
        id: 'show-1',
        name: 'Regional Championship',
        status: 'open',
        startDate: '2024-01-15',
        venue: 'Convention Center',
        entryCount: 150,
        _version: 2,
        _lastModified: '2024-01-01T10:00:00Z',
        _syncStatus: 'synced',
        _deleted: false
      };

      const localShow = {
        ...baseShow,
        entryCount: 175, // Entry increase
        _version: 3,
        _lastModified: '2024-01-01T11:00:00Z'
      };

      const remoteShow = {
        ...baseShow,
        status: 'in_progress' as const, // Valid progression
        _version: 3,
        _lastModified: '2024-01-01T11:15:00Z'
      };

      const conflict = await resolver.detectConflicts(localShow, remoteShow, baseShow);
      
      const context = {
        userId: 'admin-1',
        userRole: 'admin',
        userPermissions: ['admin'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        conflict!,
        context,
        ResolutionStrategy.FIELD_MERGE
      );

      expect(resolution.resolvedEntity.status).toBe('in_progress'); // Accepts progression
      expect(resolution.resolvedEntity.entryCount).toBe(175); // Merges entry count
    });
  });

  describe('Dog Title Accumulation Rules', () => {
    it('should merge titles instead of overwriting', async () => {
      const baseDog: TestDog = {
        id: 'dog-1',
        name: 'Champion Rex',
        breed: 'Golden Retriever',
        titles: ['CD', 'CDX'],
        owner: 'John Smith',
        registrationNumber: 'GR123456',
        _version: 1,
        _lastModified: '2024-01-01T10:00:00Z',
        _syncStatus: 'synced',
        _deleted: false
      };

      // Local update adds UD title
      const localDog = {
        ...baseDog,
        titles: ['CD', 'CDX', 'UD'],
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z'
      };

      // Remote update adds UDX title
      const remoteDog = {
        ...baseDog,
        titles: ['CD', 'CDX', 'UDX'],
        _version: 2,
        _lastModified: '2024-01-01T11:30:00Z'
      };

      const conflict = await resolver.detectConflicts(localDog, remoteDog, baseDog);
      
      const context = {
        userId: 'owner-1',
        userRole: 'exhibitor',
        userPermissions: ['manage_dogs'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        conflict!,
        context,
        ResolutionStrategy.BUSINESS_RULE_PRIORITY
      );

      // Should contain all unique titles
      expect(resolution.resolvedEntity.titles).toEqual(
        expect.arrayContaining(['CD', 'CDX', 'UD', 'UDX'])
      );
      expect(resolution.resolvedEntity.titles).toHaveLength(4);
      expect(new Set(resolution.resolvedEntity.titles).size).toBe(4); // No duplicates
    });

    it('should handle title chronology rules', async () => {
      const baseDog: TestDog = {
        id: 'dog-1',
        name: 'Champion Rex',
        breed: 'Golden Retriever',
        titles: [],
        owner: 'John Smith',
        registrationNumber: 'GR123456',
        _version: 1,
        _lastModified: '2024-01-01T10:00:00Z',
        _syncStatus: 'synced',
        _deleted: false
      };

      // Attempt to add advanced title without prerequisites
      const localDog = {
        ...baseDog,
        titles: ['UDX'], // Missing CD, CDX prerequisites
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z'
      };

      const remoteDog = {
        ...baseDog,
        titles: ['CD'], // Proper progression
        _version: 2,
        _lastModified: '2024-01-01T11:30:00Z'
      };

      const conflict = await resolver.detectConflicts(localDog, remoteDog, baseDog);
      
      expect(conflict!.conflictType).toBe(ConflictType.BUSINESS_RULE_VIOLATION);
      
      const context = {
        userId: 'admin-1',
        userRole: 'admin',
        userPermissions: ['admin'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        conflict!,
        context,
        ResolutionStrategy.BUSINESS_RULE_PRIORITY
      );

      // Should maintain proper progression
      expect(resolution.resolvedEntity.titles).toEqual(['CD']);
    });
  });

  describe('Batch Conflict Resolution', () => {
    it('should resolve multiple conflicts efficiently', async () => {
      const conflicts = [];
      const baseTime = '2024-01-01T10:00:00Z';
      
      // Create 10 scoring conflicts
      for (let i = 0; i < 10; i++) {
        const baseScore: TestScore = {
          id: `score-${i}`,
          entryId: `entry-${i}`,
          judgeId: 'judge-1',
          score: 85 + i,
          placement: i + 1,
          qualified: true,
          _version: 1,
          _lastModified: baseTime,
          _syncStatus: 'synced',
          _deleted: false
        };

        const localScore = {
          ...baseScore,
          score: 90 + i,
          notes: `Local update ${i}`,
          _version: 2,
          _lastModified: '2024-01-01T11:00:00Z'
        };

        const remoteScore = {
          ...baseScore,
          score: 88 + i,
          notes: `Remote update ${i}`,
          _version: 2,
          _lastModified: '2024-01-01T11:30:00Z'
        };

        const conflict = await resolver.detectConflicts(localScore, remoteScore, baseScore);
        if (conflict) conflicts.push(conflict);
      }

      expect(conflicts).toHaveLength(10);

      const context = {
        userId: 'admin-1',
        userRole: 'admin',
        userPermissions: ['admin'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const startTime = Date.now();
      const resolutions = await resolver.batchResolveConflicts(
        conflicts,
        context,
        ResolutionStrategy.LAST_WRITE_WINS
      );
      const endTime = Date.now();

      expect(resolutions).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      
      // All should use last-write-wins
      resolutions.forEach(resolution => {
        expect(resolution.strategy).toBe(ResolutionStrategy.LAST_WRITE_WINS);
        expect(resolution.automatic).toBe(true);
      });
    });

    it('should handle mixed priority conflicts in batch', async () => {
      const conflicts = [];
      
      // High priority conflict
      const criticalConflict = await resolver.detectConflicts(
        { 
          id: 'critical-1', 
          judgeId: 'judge-1', 
          score: 95,
          entryId: 'entry-1',
          placement: 1,
          qualified: true,
          _version: 2,
          _lastModified: '2024-01-01T11:00:00Z',
          _syncStatus: 'pending',
          _deleted: false
        },
        { 
          id: 'critical-1', 
          judgeId: 'judge-2', 
          score: 92,
          entryId: 'entry-1',
          placement: 1,
          qualified: true,
          _version: 2,
          _lastModified: '2024-01-01T11:30:00Z',
          _syncStatus: 'pending',
          _deleted: false
        }
      );
      
      if (criticalConflict) {
        criticalConflict.priority = ConflictPriority.CRITICAL;
        conflicts.push(criticalConflict);
      }

      // Low priority conflicts
      for (let i = 0; i < 3; i++) {
        const lowConflict = await resolver.detectConflicts(
          { 
            id: `low-${i}`, 
            judgeId: 'judge-1', 
            score: 80 + i,
            entryId: `entry-${i + 10}`,
            placement: i + 5,
            qualified: true,
            _version: 2,
            _lastModified: '2024-01-01T11:00:00Z',
            _syncStatus: 'pending',
            _deleted: false
          },
          { 
            id: `low-${i}`, 
            judgeId: 'judge-1', 
            score: 82 + i,
            entryId: `entry-${i + 10}`,
            placement: i + 5,
            qualified: true,
            _version: 2,
            _lastModified: '2024-01-01T11:30:00Z',
            _syncStatus: 'pending',
            _deleted: false
          }
        );
        
        if (lowConflict) {
          lowConflict.priority = ConflictPriority.LOW;
          conflicts.push(lowConflict);
        }
      }

      const context = {
        userId: 'admin-1',
        userRole: 'admin',
        userPermissions: ['admin'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolutions = await resolver.batchResolveConflicts(
        conflicts,
        context,
        ResolutionStrategy.FIELD_MERGE
      );

      // Critical conflicts should require manual resolution
      const criticalResolutions = resolutions.filter(r => 
        conflicts.find(c => c.id === r.conflictId)?.priority === ConflictPriority.CRITICAL
      );
      
      criticalResolutions.forEach(resolution => {
        expect(resolution.strategy).toBe(ResolutionStrategy.MANUAL_REQUIRED);
      });

      // Low priority should be resolved automatically
      const lowResolutions = resolutions.filter(r => 
        conflicts.find(c => c.id === r.conflictId)?.priority === ConflictPriority.LOW
      );

      lowResolutions.forEach(resolution => {
        expect(resolution.automatic).toBe(true);
      });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large-scale conflict detection efficiently', async () => {
      const startTime = Date.now();
      
      // Generate 100 potential conflicts
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const baseEntity = {
          id: `entity-${i}`,
          name: `Entity ${i}`,
          value: i * 10,
          _version: 1,
          _lastModified: '2024-01-01T10:00:00Z',
          _syncStatus: 'synced' as const,
          _deleted: false
        };

        const localEntity = {
          ...baseEntity,
          value: (i * 10) + 5,
          _version: 2,
          _lastModified: '2024-01-01T11:00:00Z'
        };

        const remoteEntity = {
          ...baseEntity,
          value: (i * 10) + 3,
          _version: 2,
          _lastModified: '2024-01-01T11:30:00Z'
        };

        promises.push(resolver.detectConflicts(localEntity, remoteEntity, baseEntity));
      }

      const conflicts = await Promise.all(promises);
      const endTime = Date.now();

      const validConflicts = conflicts.filter(c => c !== null);
      
      expect(validConflicts.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should maintain performance with concurrent conflict detection', async () => {
      const concurrentPromises = [];
      
      // Run 20 concurrent conflict detection operations
      for (let i = 0; i < 20; i++) {
        const promise = (async () => {
          const conflicts = [];
          
          for (let j = 0; j < 10; j++) {
            const conflict = await resolver.detectConflicts(
              { 
                id: `concurrent-${i}-${j}`, 
                value: j + i,
                _version: 2,
                _lastModified: '2024-01-01T11:00:00Z',
                _syncStatus: 'pending',
                _deleted: false
              },
              { 
                id: `concurrent-${i}-${j}`, 
                value: j + i + 1,
                _version: 2,
                _lastModified: '2024-01-01T11:30:00Z',
                _syncStatus: 'pending',
                _deleted: false
              }
            );
            
            if (conflict) conflicts.push(conflict);
          }
          
          return conflicts.length;
        })();
        
        concurrentPromises.push(promise);
      }

      const startTime = Date.now();
      const results = await Promise.all(concurrentPromises);
      const endTime = Date.now();

      expect(results.every(count => typeof count === 'number')).toBe(true);
      expect(endTime - startTime).toBeLessThan(3000); // Should handle concurrency well
    });
  });

  describe('Conflict History and Analytics', () => {
    it('should track conflict resolution history', async () => {
      // Create and resolve several conflicts
      for (let i = 0; i < 5; i++) {
        const conflict = await resolver.detectConflicts(
          { 
            id: `history-${i}`, 
            value: i,
            _version: 2,
            _lastModified: '2024-01-01T11:00:00Z',
            _syncStatus: 'pending',
            _deleted: false
          },
          { 
            id: `history-${i}`, 
            value: i + 10,
            _version: 2,
            _lastModified: '2024-01-01T11:30:00Z',
            _syncStatus: 'pending',
            _deleted: false
          }
        );

        if (conflict) {
          await resolver.resolveConflict(conflict, {
            userId: 'test-user',
            userRole: 'user',
            userPermissions: [],
            timestamp: new Date(),
            deviceId: 'test-device'
          });
        }
      }

      const history = resolver.getConflictHistory();
      expect(history.length).toBe(5);
      
      // Check history contains resolution details
      history.forEach(record => {
        expect(record).toHaveProperty('conflictId');
        expect(record).toHaveProperty('resolvedAt');
        expect(record).toHaveProperty('strategy');
        expect(record).toHaveProperty('automatic');
      });
    });

    it('should provide conflict statistics', async () => {
      // Generate various types of conflicts
      const conflictTypes = [ConflictType.FIELD_CONFLICT, ConflictType.CONCURRENT_MODIFICATION];
      const strategies = [ResolutionStrategy.LAST_WRITE_WINS, ResolutionStrategy.FIELD_MERGE];

      for (let i = 0; i < 6; i++) {
        const conflict = await resolver.detectConflicts(
          { 
            id: `stats-${i}`, 
            value: i,
            _version: 2,
            _lastModified: '2024-01-01T11:00:00Z',
            _syncStatus: 'pending',
            _deleted: false
          },
          { 
            id: `stats-${i}`, 
            value: i + 1,
            _version: 2,
            _lastModified: '2024-01-01T11:30:00Z',
            _syncStatus: 'pending',
            _deleted: false
          }
        );

        if (conflict) {
          conflict.conflictType = conflictTypes[i % conflictTypes.length];
          
          await resolver.resolveConflict(conflict, {
            userId: 'test-user',
            userRole: 'user',
            userPermissions: [],
            timestamp: new Date(),
            deviceId: 'test-device'
          }, strategies[i % strategies.length]);
        }
      }

      const stats = resolver.getConflictStatistics();
      
      expect(stats.totalConflicts).toBe(6);
      expect(stats.resolvedConflicts).toBe(6);
      expect(stats.averageResolutionTime).toBeGreaterThan(0);
      expect(stats.strategyUsage).toHaveProperty(ResolutionStrategy.LAST_WRITE_WINS);
      expect(stats.strategyUsage).toHaveProperty(ResolutionStrategy.FIELD_MERGE);
    });
  });
});