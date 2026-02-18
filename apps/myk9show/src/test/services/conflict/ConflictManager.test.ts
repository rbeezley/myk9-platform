import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// TODO: fix - ../../../services/conflict/ConflictManager does not exist locally (lives in @myk9/replication)
vi.mock('../../../services/conflict/ConflictManager', () => ({
  ConflictManager: vi.fn(),
  ConflictEventType: {},
}));
vi.mock('../../../services/conflict/ConflictResolver', () => ({
  ConflictPriority: {},
  ResolutionStrategy: {},
}));

import {
  ConflictManager,
  ConflictEventType,
  ConflictEvent,
} from '../../../services/conflict/ConflictManager';
import { ConflictPriority, ResolutionStrategy } from '../../../services/conflict/ConflictResolver';
import { SyncMetadata } from '../../../types/sync-types';

// Mock entities for testing
interface TestShow extends SyncMetadata {
  id: string;
  name: string;
  showDate: string;
  venue: string;
  status: string;
}

interface TestRegistration extends SyncMetadata {
  id: string;
  showId: string;
  dogId: string;
  status: string;
  paymentStatus: string;
}

// TODO: fix - local ConflictManager service does not exist (lives in @myk9/replication); skip until source is added
describe.skip('ConflictManager', () => {
  let manager: ConflictManager;
  let eventsSpy: vi.Mock;
  let capturedEvents: ConflictEvent[];

  beforeEach(() => {
    capturedEvents = [];
    eventsSpy = vi.fn((event: ConflictEvent) => {
      capturedEvents.push(event);
    });

    manager = ConflictManager.getInstance({
      enableAutoResolution: true,
      maxAutoResolutionPriority: ConflictPriority.HIGH,
      batchSize: 5,
      retryAttempts: 2,
      retryDelay: 100,
    });

    // Subscribe to all events for testing
    [
      'conflict_detected',
      'conflict_resolved',
      'conflict_failed',
      'manual_resolution_required',
    ].forEach(type => {
      manager.addEventListener(type as ConflictEventType, eventsSpy);
    });
  });

  afterEach(() => {
    // Clean up event listeners
    [
      'conflict_detected',
      'conflict_resolved',
      'conflict_failed',
      'manual_resolution_required',
    ].forEach(type => {
      manager.removeEventListener(type as ConflictEventType, eventsSpy);
    });
  });

  describe('handleSyncConflict', () => {
    it('should handle simple show conflicts with auto-resolution', async () => {
      const localShow: TestShow = {
        id: 'show-1',
        name: 'Local Show Name',
        showDate: '2024-06-15',
        venue: 'Local Venue',
        status: 'draft',
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending',
        _deleted: false,
      };

      const remoteShow: TestShow = {
        id: 'show-1',
        name: 'Remote Show Name',
        showDate: '2024-06-15',
        venue: 'Remote Venue',
        status: 'published',
        _version: 2,
        _lastModified: '2024-01-01T11:30:00Z',
        _syncStatus: 'synced',
        _deleted: false,
      };

      const context = {
        userId: 'user-1',
        userRole: 'secretary',
        userPermissions: ['show_edit'],
        timestamp: new Date(),
        deviceId: 'test-device',
      };

      const result = await manager.handleSyncConflict(localShow, remoteShow, undefined, context);

      expect(result.hasConflict).toBe(true);
      expect(result.requiresManualResolution).toBe(false); // Should auto-resolve
      expect(result.resolvedEntity).toBeDefined();
      expect(result.resolvedEntity!.status).toBe('published'); // Business rule: status progression
    });

    it('should require manual resolution for critical conflicts', async () => {
      const localReg: TestRegistration = {
        id: 'reg-1',
        showId: 'show-1',
        dogId: 'dog-1',
        status: 'pending',
        paymentStatus: 'paid',
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending',
        _deleted: false,
      };

      const remoteReg: TestRegistration = {
        id: 'reg-1',
        showId: 'show-1',
        dogId: 'dog-1',
        status: 'confirmed',
        paymentStatus: 'pending',
        _version: 2,
        _lastModified: '2024-01-01T11:30:00Z',
        _syncStatus: 'synced',
        _deleted: false,
      };

      const context = {
        userId: 'user-1',
        userRole: 'exhibitor',
        userPermissions: ['entry_create'],
        timestamp: new Date(),
        deviceId: 'test-device',
      };

      const result = await manager.handleSyncConflict(localReg, remoteReg, undefined, context);

      expect(result.hasConflict).toBe(true);
      expect(result.requiresManualResolution).toBe(true); // Registration status lock rule
      expect(capturedEvents.some(e => e.type === 'manual_resolution_required')).toBe(true);
    });

    it('should emit conflict detected events', async () => {
      const localShow: TestShow = {
        id: 'show-2',
        name: 'Show A',
        showDate: '2024-06-15',
        venue: 'Venue A',
        status: 'draft',
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending',
        _deleted: false,
      };

      const remoteShow: TestShow = {
        ...localShow,
        name: 'Show B',
        venue: 'Venue B',
        _lastModified: '2024-01-01T11:30:00Z',
      };

      const context = {
        userId: 'user-1',
        userRole: 'user',
        userPermissions: [],
        timestamp: new Date(),
        deviceId: 'test-device',
      };

      await manager.handleSyncConflict(localShow, remoteShow, undefined, context);

      expect(capturedEvents.some(e => e.type === 'conflict_detected')).toBe(true);
      const detectedEvent = capturedEvents.find(e => e.type === 'conflict_detected');
      expect(detectedEvent?.entityType).toBe('show');
      expect(detectedEvent?.entityId).toBe('show-2');
    });
  });

  describe('resolveConflictManually', () => {
    it('should resolve conflict with custom strategy', async () => {
      // First create a conflict
      const localShow: TestShow = {
        id: 'show-3',
        name: 'Local Name',
        showDate: '2024-06-15',
        venue: 'Local Venue',
        status: 'draft',
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending',
        _deleted: false,
      };

      const remoteShow: TestShow = {
        ...localShow,
        name: 'Remote Name',
        venue: 'Remote Venue',
        _lastModified: '2024-01-01T11:30:00Z',
      };

      const context = {
        userId: 'user-1',
        userRole: 'secretary',
        userPermissions: ['show_edit'],
        timestamp: new Date(),
        deviceId: 'test-device',
      };

      const conflictResult = await manager.handleSyncConflict(
        localShow,
        remoteShow,
        undefined,
        context
      );

      if (conflictResult.requiresManualResolution && conflictResult.conflict) {
        const resolution = await manager.resolveConflictManually(
          conflictResult.conflict.id,
          ResolutionStrategy.FIELD_MERGE,
          context
        );

        expect(resolution.strategy).toBe(ResolutionStrategy.FIELD_MERGE);
        expect(resolution.automatic).toBe(false);
        expect(resolution.resolvedBy).toBe('user-1');
        expect(capturedEvents.some(e => e.type === 'conflict_resolved')).toBe(true);
      }
    });

    it('should handle custom resolution data', async () => {
      const localShow: TestShow = {
        id: 'show-4',
        name: 'Local Name',
        showDate: '2024-06-15',
        venue: 'Local Venue',
        status: 'draft',
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending',
        _deleted: false,
      };

      const remoteShow: TestShow = {
        ...localShow,
        name: 'Remote Name',
        _lastModified: '2024-01-01T11:30:00Z',
      };

      const context = {
        userId: 'admin-1',
        userRole: 'admin',
        userPermissions: ['admin'],
        timestamp: new Date(),
        deviceId: 'test-device',
      };

      // Force manual resolution
      manager = ConflictManager.getInstance({
        enableAutoResolution: false,
        maxAutoResolutionPriority: ConflictPriority.LOW,
      });

      const conflictResult = await manager.handleSyncConflict(
        localShow,
        remoteShow,
        undefined,
        context
      );

      if (conflictResult.conflict) {
        const customResolution = {
          name: 'Admin Decided Name',
          venue: 'Admin Venue',
        };

        const resolution = await manager.resolveConflictManually(
          conflictResult.conflict.id,
          ResolutionStrategy.CUSTOM_MERGE,
          context,
          customResolution
        );

        expect(resolution.resolvedEntity.name).toBe('Admin Decided Name');
        expect(resolution.resolvedEntity.venue).toBe('Admin Venue');
      }
    });
  });

  describe('batchProcessConflicts', () => {
    it('should process multiple conflicts in batches', async () => {
      const entityPairs = [];

      // Create 8 entity pairs to test batching (batch size is 5)
      for (let i = 0; i < 8; i++) {
        const local: TestShow = {
          id: `show-${i}`,
          name: `Local Show ${i}`,
          showDate: '2024-06-15',
          venue: `Local Venue ${i}`,
          status: 'draft',
          _version: 2,
          _lastModified: '2024-01-01T11:00:00Z',
          _syncStatus: 'pending',
          _deleted: false,
        };

        const remote: TestShow = {
          ...local,
          name: `Remote Show ${i}`,
          venue: `Remote Venue ${i}`,
          _lastModified: '2024-01-01T11:30:00Z',
        };

        entityPairs.push({ local, remote });
      }

      const context = {
        userId: 'user-1',
        userRole: 'user',
        userPermissions: [],
        timestamp: new Date(),
        deviceId: 'test-device',
      };

      const results = await manager.batchProcessConflicts(entityPairs, context);

      expect(results).toHaveLength(8);
      expect(results.every(r => r.hasConflict)).toBe(true);

      // Check that events were emitted for all conflicts
      const detectedEvents = capturedEvents.filter(e => e.type === 'conflict_detected');
      expect(detectedEvents.length).toBe(8);
    });
  });

  describe('conflict statistics', () => {
    it('should track conflict statistics accurately', async () => {
      const initialStats = manager.getConflictStats();
      const initialTotal = initialStats.totalConflicts;

      // Create a few conflicts
      for (let i = 0; i < 3; i++) {
        const local: TestShow = {
          id: `show-stats-${i}`,
          name: `Local Show ${i}`,
          showDate: '2024-06-15',
          venue: `Local Venue ${i}`,
          status: 'draft',
          _version: 2,
          _lastModified: '2024-01-01T11:00:00Z',
          _syncStatus: 'pending',
          _deleted: false,
        };

        const remote: TestShow = {
          ...local,
          name: `Remote Show ${i}`,
          _lastModified: '2024-01-01T11:30:00Z',
        };

        const context = {
          userId: 'user-1',
          userRole: 'user',
          userPermissions: [],
          timestamp: new Date(),
          deviceId: 'test-device',
        };

        await manager.handleSyncConflict(local, remote, undefined, context);
      }

      const finalStats = manager.getConflictStats();
      expect(finalStats.totalConflicts).toBeGreaterThan(initialTotal);
      expect(finalStats.conflictsByEntity['show']).toBeGreaterThan(0);
    });
  });

  describe('event management', () => {
    it('should properly add and remove event listeners', () => {
      const testHandler = vi.fn();

      manager.addEventListener('conflict_detected', testHandler);
      manager.addEventListener('conflict_resolved', testHandler);

      // Create a simple conflict to trigger events
      // Context would be used for conflict resolution

      // Remove one listener
      manager.removeEventListener('conflict_detected', testHandler);

      // The removed listener should not be called, but the other should
      expect(testHandler).not.toHaveBeenCalled();
    });
  });

  describe('pending conflicts management', () => {
    it('should retrieve pending conflicts with filters', async () => {
      // Create conflicts of different types
      const showLocal: TestShow = {
        id: 'show-pending-1',
        name: 'Show Name',
        showDate: '2024-06-15',
        venue: 'Venue',
        status: 'draft',
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending',
        _deleted: false,
      };

      const showRemote: TestShow = {
        ...showLocal,
        status: 'published',
        _lastModified: '2024-01-01T11:30:00Z',
      };

      const regLocal: TestRegistration = {
        id: 'reg-pending-1',
        showId: 'show-1',
        dogId: 'dog-1',
        status: 'pending',
        paymentStatus: 'paid',
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending',
        _deleted: false,
      };

      const regRemote: TestRegistration = {
        ...regLocal,
        paymentStatus: 'pending',
        _lastModified: '2024-01-01T11:30:00Z',
      };

      const context = {
        userId: 'user-1',
        userRole: 'user',
        userPermissions: [],
        timestamp: new Date(),
        deviceId: 'test-device',
      };

      // Disable auto-resolution to keep conflicts pending
      manager = ConflictManager.getInstance({ enableAutoResolution: false });

      await manager.handleSyncConflict(showLocal, showRemote, undefined, context);
      await manager.handleSyncConflict(regLocal, regRemote, undefined, context);

      const allPending = manager.getPendingConflicts();
      expect(allPending.length).toBeGreaterThanOrEqual(2);

      const showPending = manager.getPendingConflicts('show');
      expect(showPending.length).toBeGreaterThanOrEqual(1);
      expect(showPending.every(c => c.entityType === 'show')).toBe(true);

      const highPriorityPending = manager.getPendingConflicts(undefined, ConflictPriority.HIGH);
      expect(highPriorityPending.every(c => c.priority === ConflictPriority.HIGH)).toBe(true);
    });
  });

  describe('conflict cleanup', () => {
    it('should clear resolved conflicts', async () => {
      const local: TestShow = {
        id: 'show-cleanup-1',
        name: 'Local Name',
        showDate: '2024-06-15',
        venue: 'Local Venue',
        status: 'draft',
        _version: 2,
        _lastModified: '2024-01-01T11:00:00Z',
        _syncStatus: 'pending',
        _deleted: false,
      };

      const remote: TestShow = {
        ...local,
        name: 'Remote Name',
        _lastModified: '2024-01-01T11:30:00Z',
      };

      const context = {
        userId: 'user-1',
        userRole: 'user',
        userPermissions: [],
        timestamp: new Date(),
        deviceId: 'test-device',
      };

      const result = await manager.handleSyncConflict(local, remote, undefined, context);

      // Should auto-resolve
      expect(result.requiresManualResolution).toBe(false);

      // Clear resolved conflicts
      manager.clearResolvedConflicts();

      const history = manager.getResolutionHistory();
      expect(history.length).toBe(0);
    });
  });
});
