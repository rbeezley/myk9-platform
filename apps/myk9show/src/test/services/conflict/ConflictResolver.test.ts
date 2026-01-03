import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ConflictResolver, 
  ConflictType, 
  ConflictPriority, 
  ResolutionStrategy,
  ConflictDetails,
  ConflictResolutionContext
} from '../../../services/conflict/ConflictResolver';
import { SyncMetadata } from '../../../types/sync-types';

// Mock entities for testing
interface TestEntity extends SyncMetadata {
  id: string;
  name: string;
  status: string;
  score?: number;
  notes?: string;
  tags?: string[];
}

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;
  let localEntity: TestEntity;
  let remoteEntity: TestEntity;
  let baseEntity: TestEntity;

  beforeEach(() => {
    resolver = new ConflictResolver();
    
    baseEntity = {
      id: 'test-1',
      name: 'Test Entity',
      status: 'active',
      score: 100,
      notes: 'Original notes',
      tags: ['tag1', 'tag2'],
      _version: 1,
      _lastModified: '2024-01-01T10:00:00Z',
      _syncStatus: 'synced',
      _deleted: false
    };

    localEntity = {
      ...baseEntity,
      name: 'Test Entity Updated',
      score: 150,
      notes: 'Local notes update',
      _version: 2,
      _lastModified: '2024-01-01T11:00:00Z'
    };

    remoteEntity = {
      ...baseEntity,
      status: 'completed',
      score: 120,
      tags: ['tag1', 'tag2', 'tag3'],
      _version: 2,
      _lastModified: '2024-01-01T11:30:00Z'
    };
  });

  describe('detectConflicts', () => {
    it('should detect no conflict when versions match', async () => {
      const sameVersionRemote = { ...remoteEntity, _version: 1 };
      const conflict = await resolver.detectConflicts(localEntity, sameVersionRemote, baseEntity);
      expect(conflict).toBeNull();
    });

    it('should detect field conflicts', async () => {
      const conflict = await resolver.detectConflicts(localEntity, remoteEntity, baseEntity);
      
      expect(conflict).toBeTruthy();
      expect(conflict!.conflictType).toBe(ConflictType.FIELD_CONFLICT);
      expect(conflict!.details).toHaveLength(2); // score and name vs status/tags
      expect(conflict!.priority).toBeGreaterThan(ConflictPriority.LOW);
    });

    it('should detect structural conflicts', async () => {
      const structuralRemote = {
        ...remoteEntity,
        score: 'invalid-score-type' as unknown as number
      };
      
      const conflict = await resolver.detectConflicts(localEntity, structuralRemote, baseEntity);
      
      expect(conflict).toBeTruthy();
      expect(conflict!.conflictType).toBe(ConflictType.STRUCTURAL_CONFLICT);
    });

    it('should detect deleted entity conflicts', async () => {
      const deletedRemote = {
        ...remoteEntity,
        notes: null
      };
      
      const conflict = await resolver.detectConflicts(localEntity, deletedRemote, baseEntity);
      
      expect(conflict).toBeTruthy();
      expect(conflict!.details.some(d => d.conflictType === ConflictType.DELETED_ENTITY)).toBe(true);
    });
  });

  describe('resolveConflict', () => {
    let conflict: ConflictDetails;
    let context: ConflictResolutionContext;

    beforeEach(async () => {
      conflict = await resolver.detectConflicts(localEntity, remoteEntity, baseEntity);
      context = {
        userId: 'user-1',
        userRole: 'user' as const,
        userPermissions: [],
        timestamp: new Date(),
        deviceId: 'test-device'
      };
    });

    it('should resolve using last-write-wins strategy', async () => {
      const resolution = await resolver.resolveConflict(
        conflict!,
        context,
        ResolutionStrategy.LAST_WRITE_WINS
      );

      expect(resolution.strategy).toBe(ResolutionStrategy.LAST_WRITE_WINS);
      expect(resolution.resolvedEntity._lastModified).toBe(remoteEntity._lastModified);
      expect(resolution.automatic).toBe(true);
    });

    it('should resolve using field merge strategy', async () => {
      const resolution = await resolver.resolveConflict(
        conflict!,
        context,
        ResolutionStrategy.FIELD_MERGE
      );

      expect(resolution.strategy).toBe(ResolutionStrategy.FIELD_MERGE);
      expect(resolution.mergedFields).toBeDefined();
      expect(resolution.resolvedEntity.name).toBe(localEntity.name); // Local change
      expect(resolution.resolvedEntity.status).toBe(remoteEntity.status); // Remote change
    });

    it('should require manual resolution for critical conflicts', async () => {
      const criticalConflict = {
        ...conflict!,
        priority: ConflictPriority.CRITICAL
      };

      const resolution = await resolver.resolveConflict(
        criticalConflict,
        context,
        ResolutionStrategy.LAST_WRITE_WINS
      );

      expect(resolution.strategy).toBe(ResolutionStrategy.MANUAL_REQUIRED);
      expect(resolution.automatic).toBe(false);
    });
  });

  describe('batchResolveConflicts', () => {
    it('should resolve multiple conflicts efficiently', async () => {
      const conflicts = [];
      
      // Create multiple test conflicts
      for (let i = 0; i < 5; i++) {
        const local = { ...localEntity, id: `test-${i}`, name: `Local ${i}` };
        const remote = { ...remoteEntity, id: `test-${i}`, status: `status-${i}` };
        const base = { ...baseEntity, id: `test-${i}` };
        
        const conflict = await resolver.detectConflicts(local, remote, base);
        if (conflict) conflicts.push(conflict);
      }

      const context: ConflictResolutionContext = {
        userId: 'user-1',
        userRole: 'user' as const,
        userPermissions: [],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolutions = await resolver.batchResolveConflicts(
        conflicts,
        context,
        ResolutionStrategy.FIELD_MERGE
      );

      expect(resolutions).toHaveLength(conflicts.length);
      expect(resolutions.every(r => r.strategy === ResolutionStrategy.FIELD_MERGE)).toBe(true);
    });
  });

  describe('business rules', () => {
    it('should apply show status progression rule', async () => {
      const showLocal = {
        id: 'show-1',
        showDate: '2024-01-01',
        venue: 'Test Venue',
        status: 'in_progress',
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending' as const,
        _deleted: false
      };

      const showRemote = {
        ...showLocal,
        status: 'draft', // Trying to go backwards
        _lastModified: '2024-01-01T11:30:00Z'
      };

      const conflict = await resolver.detectConflicts(showLocal, showRemote);
      if (!conflict) throw new Error('Expected conflict');

      const context: ConflictResolutionContext = {
        userId: 'user-1',
        userRole: 'user' as const,
        userPermissions: [],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        conflict,
        context,
        ResolutionStrategy.BUSINESS_RULE_PRIORITY
      );

      expect(resolution.strategy).toBe(ResolutionStrategy.BUSINESS_RULE_PRIORITY);
      expect(resolution.resolvedEntity.status).toBe('in_progress'); // Should keep forward status
    });

    it('should apply judge score authority rule', async () => {
      const scoreLocal = {
        id: 'score-1',
        entryId: 'entry-1',
        judgeId: 'judge-1',
        score: 85,
        placement: 2,
        qualified: true,
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending' as const,
        _deleted: false,
        _modifiedBy: { role: 'exhibitor' as const }
      };

      const scoreRemote = {
        ...scoreLocal,
        score: 92,
        placement: 1,
        _lastModified: '2024-01-01T11:30:00Z',
        _modifiedBy: { role: 'judge' as const }
      };

      const conflict = await resolver.detectConflicts(scoreLocal, scoreRemote);
      if (!conflict) throw new Error('Expected conflict');

      const context: ConflictResolutionContext = {
        userId: 'judge-1',
        userRole: 'judge' as const,
        userPermissions: ['score'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        conflict,
        context,
        ResolutionStrategy.BUSINESS_RULE_PRIORITY
      );

      expect(resolution.strategy).toBe(ResolutionStrategy.BUSINESS_RULE_PRIORITY);
      expect(resolution.resolvedEntity.score).toBe(92); // Judge score wins
    });
  });

  describe('title accumulation rule', () => {
    it('should merge titles instead of overwriting', async () => {
      const dogLocal = {
        id: 'dog-1',
        breed: 'Golden Retriever',
        registrationNumber: 'ABC123',
        titles: ['CD', 'CDX'],
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending' as const,
        _deleted: false
      };

      const dogRemote = {
        ...dogLocal,
        titles: ['CD', 'UD'],
        _lastModified: '2024-01-01T11:30:00Z'
      };

      const conflict = await resolver.detectConflicts(dogLocal, dogRemote);
      if (!conflict) throw new Error('Expected conflict');

      const context: ConflictResolutionContext = {
        userId: 'user-1',
        userRole: 'user' as const,
        userPermissions: [],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        conflict,
        context,
        ResolutionStrategy.BUSINESS_RULE_PRIORITY
      );

      expect(resolution.strategy).toBe(ResolutionStrategy.BUSINESS_RULE_PRIORITY);
      expect(resolution.resolvedEntity.titles).toEqual(
        expect.arrayContaining(['CD', 'CDX', 'UD'])
      );
      expect(resolution.resolvedEntity.titles).toHaveLength(3);
    });
  });

  describe('user hierarchy resolution', () => {
    it('should prefer admin over regular user', async () => {
      const conflict = await resolver.detectConflicts(localEntity, remoteEntity, baseEntity);
      if (!conflict) throw new Error('Expected conflict');

      // Simulate admin user vs regular user
      const modifiedConflict = {
        ...conflict,
        localEntity: { ...localEntity, _modifiedBy: { role: 'admin' as const } },
        remoteEntity: { ...remoteEntity, _modifiedBy: { role: 'user' as const } }
      };

      const context: ConflictResolutionContext = {
        userId: 'admin-1',
        userRole: 'admin' as const,
        userPermissions: ['admin'],
        timestamp: new Date(),
        deviceId: 'test-device'
      };

      const resolution = await resolver.resolveConflict(
        modifiedConflict,
        context,
        ResolutionStrategy.USER_HIERARCHY
      );

      expect(resolution.strategy).toBe(ResolutionStrategy.USER_HIERARCHY);
      expect(resolution.resolvedEntity.name).toBe(localEntity.name); // Admin change wins
    });
  });

  describe('getConflictHistory', () => {
    it('should return filtered conflict history', async () => {
      // Create and resolve a few conflicts
      const conflicts = [];
      for (let i = 0; i < 3; i++) {
        const local = { ...localEntity, id: `test-${i}` };
        const remote = { ...remoteEntity, id: `test-${i}` };
        const conflict = await resolver.detectConflicts(local, remote, baseEntity);
        if (conflict) {
          conflicts.push(conflict);
          await resolver.resolveConflict(conflict, {
            userId: 'user-1',
            userRole: 'user' as const,
            userPermissions: [],
            timestamp: new Date(),
            deviceId: 'test-device'
          });
        }
      }

      const history = resolver.getConflictHistory();
      expect(history.length).toBeGreaterThan(0);

      const filteredHistory = resolver.getConflictHistory('unknown', undefined, 2);
      expect(filteredHistory.length).toBeLessThanOrEqual(2);
    });
  });
});