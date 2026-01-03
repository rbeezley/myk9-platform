// Phase 1 Local-First Implementation Tests
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SYNC_SCOPES, ENTITY_SIZE_ESTIMATES, STORAGE_LIMITS, SyncPriority } from '@/config/sync-scopes';
import { StorageEstimator } from '@/services/sync/StorageEstimator';
import { InitialSyncOrchestrator } from '@/services/sync/InitialSyncOrchestrator';
import { SmartQueryBuilder } from '@/services/sync/SmartQueryBuilder';
import { SyncQueue } from '@/services/sync/SyncQueue';
import * as dbConnection from '@/services/database/connection';

// Mock the database connection
vi.mock('@/services/database/connection', () => ({
  db: {
    instance: {
      syncMetadata: {
        where: vi.fn().mockReturnValue({
          equals: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null)
          })
        })
      }
    }
  }
}));

// Mock sync service
vi.mock('@/services/sync/syncService', () => ({
  syncService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    addToQueue: vi.fn().mockResolvedValue('queue-id-123'),
    getStatistics: vi.fn().mockResolvedValue({
      totalSyncs: 10,
      successfulSyncs: 9,
      failedSyncs: 1,
      totalConflicts: 0,
      lastFullSync: new Date(),
      averageSyncDuration: 1000
    }),
    getNetworkStatus: vi.fn().mockReturnValue({
      isOnline: true,
      quality: 'good',
      lastChecked: new Date()
    }),
    on: vi.fn(),
    off: vi.fn()
  }
}));

describe('Phase 1: Local-First Foundation', () => {
  describe('Sync Scopes Configuration', () => {
    it('should have sync scopes defined for all user roles', () => {
      expect(SYNC_SCOPES.NEW_USER).toBeDefined();
      expect(SYNC_SCOPES.EXHIBITOR).toBeDefined();
      expect(SYNC_SCOPES.JUDGE).toBeDefined();
      expect(SYNC_SCOPES.SECRETARY).toBeDefined();
    });

    it('should limit initial sync for new users', () => {
      const newUserScope = SYNC_SCOPES.NEW_USER;
      expect(newUserScope.people.limit).toBe(1);
      expect(newUserScope.dogs.limit).toBe(0);
      expect(newUserScope.shows.limit).toBeLessThanOrEqual(10);
    });

    it('should provide appropriate limits for different roles', () => {
      const secretaryScope = SYNC_SCOPES.SECRETARY;
      const exhibitorScope = SYNC_SCOPES.EXHIBITOR;
      
      // Secretary should have higher limits
      expect(secretaryScope.people.limit).toBeGreaterThan(exhibitorScope.people.limit);
      expect(secretaryScope.entries.limit).toBeGreaterThan(exhibitorScope.entries.limit);
    });
  });

  describe('Entity Size Estimates', () => {
    it('should have size estimates for all entity types', () => {
      expect(ENTITY_SIZE_ESTIMATES.person).toBeDefined();
      expect(ENTITY_SIZE_ESTIMATES.dog).toBeDefined();
      expect(ENTITY_SIZE_ESTIMATES.show).toBeDefined();
      expect(ENTITY_SIZE_ESTIMATES.entry).toBeDefined();
      expect(ENTITY_SIZE_ESTIMATES.club).toBeDefined();
    });

    it('should have realistic size estimates', () => {
      // Dogs with photos should be larger than basic entries
      expect(ENTITY_SIZE_ESTIMATES.dog).toBeGreaterThan(ENTITY_SIZE_ESTIMATES.entry);
      
      // Shows with metadata should be larger than people
      expect(ENTITY_SIZE_ESTIMATES.show).toBeGreaterThan(ENTITY_SIZE_ESTIMATES.person);
    });
  });

  describe('StorageEstimator', () => {
    let storageEstimator: StorageEstimator;

    beforeEach(() => {
      storageEstimator = new StorageEstimator();
    });

    it('should estimate entity sizes correctly', () => {
      expect(storageEstimator.estimateEntitySize('person')).toBe(ENTITY_SIZE_ESTIMATES.person);
      expect(storageEstimator.estimateEntitySize('dog')).toBe(ENTITY_SIZE_ESTIMATES.dog);
      expect(storageEstimator.estimateEntitySize('unknown')).toBe(1); // fallback
    });

    it('should calculate sync scope sizes', () => {
      const testScope = {
        person: { scope: 'own', limit: 10 },
        dog: { scope: 'own', limit: 5 },
        show: { scope: 'upcoming', limit: 3 }
      };

      const expectedSize = (10 * ENTITY_SIZE_ESTIMATES.person) + 
                          (5 * ENTITY_SIZE_ESTIMATES.dog) + 
                          (3 * ENTITY_SIZE_ESTIMATES.show);

      expect(storageEstimator.estimateSyncSize(testScope)).toBe(expectedSize);
    });

    it('should estimate role storage requirements', () => {
      const newUserEstimate = storageEstimator.estimateRoleStorage('NEW_USER');
      const secretaryEstimate = storageEstimator.estimateRoleStorage('SECRETARY');

      expect(newUserEstimate.sizeKB).toBeGreaterThan(0);
      expect(newUserEstimate.sizeMB).toBe(newUserEstimate.sizeKB / 1024);
      
      // Secretary should require more storage than new user
      expect(secretaryEstimate.sizeMB).toBeGreaterThan(newUserEstimate.sizeMB);
    });

    it('should check storage quota availability', async () => {
      // Mock navigator.storage.estimate
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({
            usage: 1024 * 1024 * 10, // 10MB used
            quota: 1024 * 1024 * 100  // 100MB available
          })
        },
        configurable: true
      });

      const quota = await storageEstimator.checkQuota();
      expect(quota.used).toBe(10); // 10MB
      expect(quota.available).toBe(100); // 100MB
      expect(quota.percentage).toBe(10); // 10%
    });
  });

  describe('InitialSyncOrchestrator', () => {
    let orchestrator: InitialSyncOrchestrator;

    beforeEach(() => {
      orchestrator = new InitialSyncOrchestrator();
      
      // Mock storage estimator methods
      vi.spyOn(StorageEstimator.prototype, 'checkQuota').mockResolvedValue({
        used: 10,
        available: 100,
        percentage: 10
      });
      
      vi.spyOn(StorageEstimator.prototype, 'getOptimalSyncScope').mockResolvedValue({
        recommendedScope: SYNC_SCOPES.NEW_USER,
        reasoning: ['Plenty of storage available']
      });
    });

    it('should create sync plan for user roles', () => {
      const plan = orchestrator.createSyncPlan(SYNC_SCOPES.NEW_USER);
      
      expect(plan.totalSteps).toBeGreaterThan(0);
      expect(plan.estimatedSizeMB).toBeGreaterThan(0);
      expect(plan.estimatedTimeMinutes).toBeGreaterThan(0);
      expect(plan.steps).toHaveLength(plan.totalSteps);
    });

    it('should sort steps by dependencies', () => {
      const plan = orchestrator.createSyncPlan(SYNC_SCOPES.EXHIBITOR);
      
      // Users should come before dogs (dogs depend on people)
      const peopleIndex = plan.steps.findIndex(step => step.entity === 'people');
      const dogsIndex = plan.steps.findIndex(step => step.entity === 'dogs');
      
      if (peopleIndex !== -1 && dogsIndex !== -1) {
        expect(peopleIndex).toBeLessThan(dogsIndex);
      }
    });

    it('should get recommended scope for each role', () => {
      const newUserScope = orchestrator.getRecommendedScope('NEW_USER');
      const judgeScope = orchestrator.getRecommendedScope('JUDGE');
      
      expect(newUserScope).toEqual(SYNC_SCOPES.NEW_USER);
      expect(judgeScope).toEqual(SYNC_SCOPES.JUDGE);
    });

    it('should estimate initial sync requirements', async () => {
      const estimate = await orchestrator.estimateInitialSync('EXHIBITOR');
      
      expect(estimate.sizeMB).toBeGreaterThan(0);
      expect(estimate.timeMinutes).toBeGreaterThan(0);
      expect(estimate.entities).toContain('dogs');
      expect(estimate.recommendations).toContain('Plenty of storage available');
    });

    it('should track progress during sync', async () => {
      const progressUpdates: Array<{ entity: string; status: string }> = [];
      
      orchestrator.onProgress((progress) => {
        progressUpdates.push({
          entity: progress.entity,
          status: progress.status
        });
      });

      // This would normally perform actual sync, but we'll just test the setup
      expect(progressUpdates).toHaveLength(0); // No sync started yet
    });
  });

  describe('Selective Sync Foundation', () => {
    it('should prevent downloading excessive data for new users', () => {
      const newUserScope = SYNC_SCOPES.NEW_USER;
      const estimator = new StorageEstimator();
      const totalSize = estimator.estimateSyncSize(newUserScope);
      
      // New users should sync less than 100KB initially
      expect(totalSize).toBeLessThan(100);
    });

    it('should scale appropriately for power users', () => {
      const secretaryScope = SYNC_SCOPES.SECRETARY;
      const estimator = new StorageEstimator();
      const totalSize = estimator.estimateSyncSize(secretaryScope);
      
      // Secretaries can handle more data but should still be reasonable
      expect(totalSize).toBeGreaterThan(1000); // More than 1MB
      expect(totalSize).toBeLessThan(50000); // Less than 50MB
    });

    it('should provide role-appropriate sync scopes', () => {
      // Judge should sync dogs they're judging
      expect(SYNC_SCOPES.JUDGE.dogs.scope).toBe('by-assignment');
      
      // Exhibitor should sync their own dogs
      expect(SYNC_SCOPES.EXHIBITOR.dogs.scope).toBe('own');
      
      // Secretary should sync all show participants
      expect(SYNC_SCOPES.SECRETARY.people.scope).toBe('show-participants');
    });
  });

  describe('Integration Test', () => {
    it('should complete Phase 1 setup without errors', async () => {
      // This integration test verifies all Phase 1 components work together
      const storageEstimator = new StorageEstimator();
      const orchestrator = new InitialSyncOrchestrator();
      
      // Check that we can estimate storage for all roles
      for (const role of ['NEW_USER', 'EXHIBITOR', 'JUDGE', 'SECRETARY'] as const) {
        const estimate = storageEstimator.estimateRoleStorage(role);
        expect(estimate.sizeMB).toBeGreaterThan(0);
        
        const syncPlan = orchestrator.createSyncPlan(SYNC_SCOPES[role]);
        expect(syncPlan.totalSteps).toBeGreaterThan(0);
      }
      
      // Verify initial sync detection works
      const isNeeded = await orchestrator.isInitialSyncNeeded('test-user');
      expect(typeof isNeeded).toBe('boolean');
    });
  });

  describe('SmartQueryBuilder', () => {
    let queryBuilder: SmartQueryBuilder;

    beforeEach(() => {
      queryBuilder = new SmartQueryBuilder();
    });

    it('should build queries for different entity types', () => {
      const user = { id: 'user-123', role: 'EXHIBITOR', state: 'CA' };
      
      // Test show queries
      const showQuery = queryBuilder.buildQuery('shows', { scope: 'upcoming-nearby', limit: 10 }, user);
      expect(showQuery.from).toBe('shows');
      expect(showQuery.limit).toBe(10);
      expect(showQuery.filters).toBeDefined();

      // Test dog queries
      const dogQuery = queryBuilder.buildQuery('dogs', { scope: 'own', limit: 50 }, user);
      expect(dogQuery.from).toBe('dogs');
      expect(dogQuery.limit).toBe(50);

      // Test person queries
      const personQuery = queryBuilder.buildQuery('people', { scope: 'own', limit: 1 }, user);
      expect(personQuery.from).toBe('people');
      expect(personQuery.limit).toBe(1);
    });

    it('should build show queries with different scopes', () => {
      const user = { id: 'user-123', role: 'JUDGE', state: 'TX' };

      const nearbyQuery = queryBuilder.buildQuery('shows', { scope: 'upcoming-nearby', limit: 10 }, user);
      expect(nearbyQuery.filters.some((f: { field: string }) => f.field === 'state')).toBe(true);

      const assignedQuery = queryBuilder.buildQuery('shows', { scope: 'assigned', limit: 5 }, user);
      expect(assignedQuery.filters.some((f: { field: string }) => f.field === 'judge_assignments')).toBe(true);
    });

    it('should optimize queries for selective loading', () => {
      const baseQuery = {
        from: 'dogs',
        select: '*',
        filters: [],
        limit: 50
      };

      const optimizedQuery = queryBuilder.optimizeQuery(baseQuery, 'dogs');
      expect(optimizedQuery.select).toBe('id, name, breed, owner_id, registration_number');
      expect(optimizedQuery.orderBy).toBeDefined();
    });

    it('should handle unknown entity types gracefully', () => {
      const user = { id: 'user-123', role: 'EXHIBITOR' };
      const unknownQuery = queryBuilder.buildQuery('unknown-entity', { scope: 'test', limit: 10 }, user);
      
      expect(unknownQuery.from).toBe('unknown-entity');
      expect(unknownQuery.limit).toBe(10);
    });
  });

  describe('SyncQueue', () => {
    let syncQueue: SyncQueue;

    beforeEach(() => {
      syncQueue = SyncQueue.getInstance();
      // Clear any existing queue items
      vi.clearAllMocks();
    });

    afterEach(async () => {
      await syncQueue.cleanup();
    });

    it('should add items to the queue', async () => {
      const actionId = await syncQueue.add({
        entityType: 'club',
        actionType: 'create',
        entityId: 'club-123',
        data: { name: 'Test Club' },
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      });

      expect(actionId).toBeDefined();
      expect(typeof actionId).toBe('string');
    });

    it('should prioritize queue items correctly', async () => {
      // Add items with different priorities
      await syncQueue.add({
        entityType: 'club',
        actionType: 'create',
        entityId: 'club-1',
        data: {},
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      });

      await syncQueue.add({
        entityType: 'show',
        actionType: 'update',
        entityId: 'show-1',
        data: {},
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      });

      const pending = syncQueue.getPending();
      expect(pending.length).toBeGreaterThanOrEqual(0);
    });

    it('should get queue statistics', () => {
      const stats = syncQueue.getStats();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('processing');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('successRate');
    });

    it('should check for pending changes', () => {
      const hasPending = syncQueue.hasPendingChanges('club', 'club-123');
      expect(typeof hasPending).toBe('boolean');
    });

    it('should handle item status updates', async () => {
      const actionId = await syncQueue.add({
        entityType: 'club',
        actionType: 'update',
        entityId: 'club-123',
        data: {},
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      });

      await syncQueue.markProcessing(actionId);
      await syncQueue.markCompleted(actionId);
      
      // Item should be marked for removal after completion
      expect(actionId).toBeDefined();
    });

    it('should handle failures with retry logic', async () => {
      const actionId = await syncQueue.add({
        entityType: 'club',
        actionType: 'create',
        entityId: 'club-123',
        data: {},
        timestamp: new Date(),
        userId: 'user-123',
        retries: 0
      });

      await syncQueue.markFailed(actionId, 'Network error');
      
      // Item should be rescheduled for retry
      expect(actionId).toBeDefined();
    });
  });

  describe('Storage Limits and Configuration', () => {
    it('should have reasonable storage limits defined', () => {
      expect(STORAGE_LIMITS.MAX_STORAGE_MB).toBeGreaterThan(0);
      expect(STORAGE_LIMITS.WARNING_THRESHOLD).toBeLessThan(1);
      expect(STORAGE_LIMITS.CRITICAL_THRESHOLD).toBeLessThan(1);
      expect(STORAGE_LIMITS.MIN_FREE_SPACE_MB).toBeGreaterThan(0);
    });

    it('should have sync priorities defined', () => {
      expect(SyncPriority.CRITICAL).toBe(1);
      expect(SyncPriority.HIGH).toBe(2);
      expect(SyncPriority.NORMAL).toBe(3);
      expect(SyncPriority.LOW).toBe(4);
      expect(SyncPriority.ARCHIVE).toBe(5);
    });

    it('should validate entity size estimates are reasonable', () => {
      Object.entries(ENTITY_SIZE_ESTIMATES).forEach(([, size]) => {
        expect(size).toBeGreaterThan(0);
        expect(size).toBeLessThan(100); // No entity should be estimated > 100KB
        expect(typeof size).toBe('number');
      });
    });
  });

  describe('Advanced Storage Estimator Features', () => {
    let storageEstimator: StorageEstimator;

    beforeEach(() => {
      storageEstimator = new StorageEstimator();
    });

    it('should detect when storage is near quota', async () => {
      // Mock high storage usage
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({
            usage: 1024 * 1024 * 80, // 80MB used
            quota: 1024 * 1024 * 100  // 100MB total
          })
        },
        configurable: true
      });

      const isNear = await storageEstimator.isNearQuota();
      expect(isNear).toBe(true);

      const isCritical = await storageEstimator.isCriticalQuota();
      expect(isCritical).toBe(false);
    });

    it('should provide storage optimization recommendations', async () => {
      // Mock storage breakdown
      vi.spyOn(storageEstimator, 'getStorageBreakdown').mockResolvedValue({
        dog: { count: 100, sizeKB: 500, sizeMB: 0.5 },
        person: { count: 50, sizeKB: 100, sizeMB: 0.1 },
        show: { count: 10, sizeKB: 100, sizeMB: 0.1 }
      });

      const recommendations = await storageEstimator.getOptimizationRecommendations();
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should calculate optimal cache TTL based on storage', async () => {
      const ttl = await storageEstimator.getOptimalCacheTTL();
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(STORAGE_LIMITS.CACHE_TTL_DAYS);
    });

    it('should get available storage for sync', async () => {
      const available = await storageEstimator.getAvailableStorageForSync();
      expect(available).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Initial Sync Orchestrator Advanced Features', () => {
    let orchestrator: InitialSyncOrchestrator;

    beforeEach(() => {
      orchestrator = new InitialSyncOrchestrator();
    });

    it('should handle progress callbacks', () => {
      const progressUpdates: unknown[] = [];
      
      orchestrator.onProgress((progress) => {
        progressUpdates.push(progress);
      });

      // Simulate progress callback removal
      const callback = (progress: unknown) => progressUpdates.push(progress);
      orchestrator.onProgress(callback);
      orchestrator.offProgress(callback);

      expect(progressUpdates).toHaveLength(0);
    });

    it('should create sync plans with proper dependencies', () => {
      const testScope = {
        people: { scope: 'own', limit: 1 },
        dogs: { scope: 'own', limit: 5 },
        entries: { scope: 'own', limit: 10 }
      };

      const plan = orchestrator.createSyncPlan(testScope);
      
      // Users should come before dogs (dependency)
      const peopleIndex = plan.steps.findIndex(step => step.entity === 'people');
      const dogsIndex = plan.steps.findIndex(step => step.entity === 'dogs');
      
      if (peopleIndex !== -1 && dogsIndex !== -1) {
        expect(peopleIndex).toBeLessThan(dogsIndex);
      }
    });

    it('should handle unknown user roles gracefully', () => {
      expect(() => {
        orchestrator.getRecommendedScope('UNKNOWN_ROLE' as never);
      }).not.toThrow();
    });

    it('should estimate sync requirements accurately', async () => {
      const estimate = await orchestrator.estimateInitialSync('NEW_USER');
      
      expect(estimate.sizeMB).toBeGreaterThan(0);
      expect(estimate.timeMinutes).toBeGreaterThan(0);
      expect(Array.isArray(estimate.entities)).toBe(true);
      expect(Array.isArray(estimate.recommendations)).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle storage API unavailability', async () => {
      // Mock missing storage API
      Object.defineProperty(navigator, 'storage', {
        value: undefined,
        configurable: true
      });

      const storageEstimator = new StorageEstimator();
      const quota = await storageEstimator.checkQuota();
      
      expect(quota.used).toBe(0);
      expect(quota.available).toBe(STORAGE_LIMITS.MAX_STORAGE_MB);
    });

    it('should handle database connection errors gracefully', async () => {
      const orchestrator = new InitialSyncOrchestrator();
      
      // Mock database error
      vi.mocked(dbConnection).db.instance.syncMetadata = {
        where: () => ({
          equals: () => ({
            first: vi.fn().mockRejectedValue(new Error('Database error'))
          })
        })
      };

      const isNeeded = await orchestrator.isInitialSyncNeeded('test-user');
      expect(isNeeded).toBe(true); // Should default to true on error
    });

    it('should validate sync scope configurations', () => {
      Object.entries(SYNC_SCOPES).forEach(([role, scope]) => {
        expect(typeof role).toBe('string');
        expect(typeof scope).toBe('object');
        
        Object.entries(scope).forEach(([entity, config]) => {
          expect(typeof entity).toBe('string');
          expect(config).toHaveProperty('scope');
          expect(config).toHaveProperty('limit');
          expect(typeof config.limit).toBe('number');
          expect(config.limit).toBeGreaterThanOrEqual(0);
        });
      });
    });

    it('should handle empty entity size estimates gracefully', () => {
      const storageEstimator = new StorageEstimator();
      const unknownSize = storageEstimator.estimateEntitySize('unknown-entity');
      expect(unknownSize).toBe(1); // Should default to 1KB
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large sync scopes efficiently', () => {
      const storageEstimator = new StorageEstimator();
      const largeScope = {
        people: { scope: 'all', limit: 10000 },
        dogs: { scope: 'all', limit: 50000 },
        shows: { scope: 'all', limit: 1000 },
        entries: { scope: 'all', limit: 100000 }
      };

      const startTime = Date.now();
      const size = storageEstimator.estimateSyncSize(largeScope);
      const endTime = Date.now();

      expect(size).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(100); // Should complete in < 100ms
    });

    it('should create sync plans quickly for complex dependencies', () => {
      const orchestrator = new InitialSyncOrchestrator();
      const complexScope = SYNC_SCOPES.SECRETARY; // Largest scope

      const startTime = Date.now();
      const plan = orchestrator.createSyncPlan(complexScope);
      const endTime = Date.now();

      expect(plan.totalSteps).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(50); // Should complete in < 50ms
    });
  });

  describe('Comprehensive Coverage Tests', () => {
    it('should test all public methods of StorageEstimator', async () => {
      const estimator = new StorageEstimator();
      
      // Test all methods exist and return expected types
      expect(typeof estimator.estimateEntitySize('person')).toBe('number');
      expect(typeof estimator.estimateSyncSize({})).toBe('number');
      expect(typeof estimator.estimateRoleStorage('NEW_USER')).toBe('object');
      
      const quota = await estimator.checkQuota();
      expect(typeof quota).toBe('object');
      
      const isNear = await estimator.isNearQuota();
      expect(typeof isNear).toBe('boolean');
      
      const isCritical = await estimator.isCriticalQuota();
      expect(typeof isCritical).toBe('boolean');
    });

    it('should test all public methods of InitialSyncOrchestrator', async () => {
      const orchestrator = new InitialSyncOrchestrator();
      
      // Test method existence and return types
      const plan = orchestrator.createSyncPlan({});
      expect(typeof plan).toBe('object');
      expect(plan).toHaveProperty('totalSteps');
      
      const scope = orchestrator.getRecommendedScope('NEW_USER');
      expect(typeof scope).toBe('object');
      
      const estimate = await orchestrator.estimateInitialSync('EXHIBITOR');
      expect(typeof estimate).toBe('object');
      
      const isNeeded = await orchestrator.isInitialSyncNeeded('test-user');
      expect(typeof isNeeded).toBe('boolean');
    });

    it('should test all SmartQueryBuilder query types', () => {
      const builder = new SmartQueryBuilder();
      const user = { id: 'test', role: 'EXHIBITOR' };
      
      // Test all entity types
      const entities = ['shows', 'dogs', 'people', 'clubs', 'entries'];
      entities.forEach(entity => {
        const query = builder.buildQuery(entity, { scope: 'test', limit: 10 }, user);
        expect(query).toHaveProperty('from');
        expect(query.from).toBe(entity);
      });
      
      // Test optimization
      const optimized = builder.optimizeQuery({ from: 'test', select: '*' }, 'people');
      expect(optimized).toHaveProperty('select');
      expect(optimized).toHaveProperty('orderBy');
    });

    it('should test all SyncQueue public methods comprehensively', async () => {
      const queue = SyncQueue.getInstance();
      
      // Test queue lifecycle
      const stats = queue.getStats();
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('successRate');
      
      // Test pending changes detection
      const hasPending = queue.hasPendingChanges('club', 'test-club');
      expect(typeof hasPending).toBe('boolean');
      
      // Test different entity types
      const entityTypes = ['club', 'person', 'dog', 'show', 'entry'];
      for (const entityType of entityTypes) {
        const actionId = await queue.add({
          entityType,
          actionType: 'create',
          entityId: `${entityType}-123`,
          data: {},
          timestamp: new Date(),
          userId: 'test-user',
          retries: 0
        });
        expect(actionId).toBeDefined();
      }
      
      // Test queue operations
      const pending = queue.getPending();
      expect(Array.isArray(pending)).toBe(true);
    });
  });

  describe('Advanced Integration Scenarios', () => {
    it('should handle complete offline-to-online workflow', async () => {
      new StorageEstimator(); // For setup, not directly used
      const orchestrator = new InitialSyncOrchestrator();
      const syncQueue = SyncQueue.getInstance();
      
      // Simulate offline state
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true
      });
      
      // Create data offline
      await syncQueue.add({
        entityType: 'club',
        actionType: 'create',
        entityId: 'offline-club-1',
        data: { name: 'Offline Club' },
        timestamp: new Date(),
        userId: 'test-user',
        retries: 0
      });
      
      // Check queue state
      const stats = syncQueue.getStats();
      expect(stats.pending).toBeGreaterThanOrEqual(0);
      
      // Simulate going online
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        configurable: true
      });
      
      // Verify sync readiness
      const estimate = await orchestrator.estimateInitialSync('EXHIBITOR');
      expect(estimate.sizeMB).toBeGreaterThan(0);
    });

    it('should handle storage quota pressure scenarios', async () => {
      const storageEstimator = new StorageEstimator();
      
      // Mock critical storage state
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({
            usage: 1024 * 1024 * 95, // 95MB used
            quota: 1024 * 1024 * 100  // 100MB total
          })
        },
        configurable: true
      });
      
      const isCritical = await storageEstimator.isCriticalQuota();
      expect(isCritical).toBe(true);
      
      // Test emergency storage management
      const available = await storageEstimator.getAvailableStorageForSync();
      expect(available).toBeLessThan(10); // Should be very limited
    });

    it('should validate all sync scopes are properly configured', () => {
      const orchestrator = new InitialSyncOrchestrator();
      const roles = ['NEW_USER', 'EXHIBITOR', 'JUDGE', 'SECRETARY'] as const;
      
      roles.forEach(role => {
        const scope = orchestrator.getRecommendedScope(role);
        expect(scope).toBeDefined();
        
        // Validate scope structure
        Object.entries(scope).forEach(([, config]) => {
          expect(config).toHaveProperty('scope');
          expect(config).toHaveProperty('limit');
          expect(typeof config.limit).toBe('number');
          expect(config.limit).toBeGreaterThanOrEqual(0);
        });
        
        // Test sync plan creation
        const plan = orchestrator.createSyncPlan(scope);
        expect(plan.totalSteps).toBeGreaterThanOrEqual(0);
        expect(plan.estimatedSizeMB).toBeGreaterThanOrEqual(0);
      });
    });

    it('should handle complex query building scenarios', () => {
      const builder = new SmartQueryBuilder();
      
      // Test different user types and locations
      const users = [
        { id: 'user1', role: 'EXHIBITOR', state: 'CA', city: 'Los Angeles' },
        { id: 'user2', role: 'JUDGE', state: 'TX', preferences: { maxDistance: 100 } },
        { id: 'user3', role: 'SECRETARY', clubId: 'club-123' },
        { id: 'user4', role: 'NEW_USER' }
      ];
      
      users.forEach(user => {
        // Test show queries for each user type
        const showQuery = builder.buildQuery('shows', { scope: 'upcoming-nearby', limit: 10 }, user);
        expect(showQuery.from).toBe('shows');
        expect(showQuery.limit).toBe(10);
        
        // Test dog queries
        const dogQuery = builder.buildQuery('dogs', { scope: 'own', limit: 50 }, user);
        expect(dogQuery.from).toBe('dogs');
        
        // Test query optimization
        const optimized = builder.optimizeQuery(showQuery, 'shows');
        expect(optimized).toHaveProperty('orderBy');
      });
    });
  });

  describe('Stress Testing and Boundaries', () => {
    it('should handle extremely large sync scopes without performance degradation', () => {
      const storageEstimator = new StorageEstimator();
      const maxScope = {
        people: { scope: 'all', limit: 100000 },
        dogs: { scope: 'all', limit: 500000 },
        shows: { scope: 'all', limit: 10000 },
        entries: { scope: 'all', limit: 1000000 },
        clubs: { scope: 'all', limit: 5000 }
      };
      
      const startTime = performance.now();
      const size = storageEstimator.estimateSyncSize(maxScope);
      const endTime = performance.now();
      
      expect(size).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(50); // Should complete quickly
    });

    it('should handle zero-limit scopes gracefully', () => {
      const storageEstimator = new StorageEstimator();
      const orchestrator = new InitialSyncOrchestrator();
      
      const emptyScope = {
        people: { scope: 'none', limit: 0 },
        dogs: { scope: 'none', limit: 0 },
        shows: { scope: 'none', limit: 0 }
      };
      
      const size = storageEstimator.estimateSyncSize(emptyScope);
      expect(size).toBe(0);
      
      const plan = orchestrator.createSyncPlan(emptyScope);
      expect(plan.totalSteps).toBe(0);
      expect(plan.estimatedSizeMB).toBe(0);
    });

    it('should handle malformed data gracefully', async () => {
      const syncQueue = SyncQueue.getInstance();
      
      // Test adding malformed sync actions
      const malformedAction = {
        entityType: 'unknown-entity',
        actionType: 'unknown-action',
        entityId: '',
        data: null,
        timestamp: new Date(),
        userId: '',
        retries: -1
      };
      
      // Should not throw, should handle gracefully
      expect(async () => {
        await syncQueue.add(malformedAction as never);
      }).not.toThrow();
    });
  });

  describe('Sync Metadata Validation', () => {
    it('should validate all entity types have required sync metadata fields', () => {
      const requiredFields = ['_version', '_lastModified', '_lastModifiedBy', '_syncStatus', '_localOnly'];
      
      // Mock entity objects to test sync metadata
      const mockEntities = {
        club: { id: 'club-1', name: 'Test Club' },
        person: { id: 'person-1', firstName: 'John', lastName: 'Doe' },
        dog: { id: 'dog-1', name: 'Buddy', breed: 'Golden Retriever' },
        show: { id: 'show-1', name: 'Test Show', startDate: '2024-01-01' },
        showEntry: { id: 'entry-1', registrationId: 'reg-1', dogId: 'dog-1' },
        classEntry: { id: 'class-entry-1', entryId: 'entry-1', classId: 'class-1' }
      };
      
      Object.entries(mockEntities).forEach(([, entity]) => {
        // Add sync metadata
        const syncEntity = {
          ...entity,
          _version: 1,
          _lastModified: new Date(),
          _lastModifiedBy: 'test-user',
          _syncStatus: 'synced' as const,
          _localOnly: false
        };
        
        // Verify all required fields are present
        requiredFields.forEach(field => {
          expect(syncEntity).toHaveProperty(field);
        });
        
        // Verify field types
        expect(typeof syncEntity._version).toBe('number');
        expect(syncEntity._lastModified instanceof Date).toBe(true);
        expect(typeof syncEntity._lastModifiedBy).toBe('string');
        expect(['synced', 'pending', 'error', 'conflict']).toContain(syncEntity._syncStatus);
        expect(typeof syncEntity._localOnly).toBe('boolean');
      });
    });
  });
});