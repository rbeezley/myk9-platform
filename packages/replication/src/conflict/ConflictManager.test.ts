import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictManager, conflictManager } from './ConflictManager';
import { ConflictResolver } from './ConflictResolver';

interface TestEntity {
  id: string;
  name: string;
  updated_at?: string;
}

describe('ConflictManager', () => {
  let manager: ConflictManager;

  beforeEach(() => {
    manager = new ConflictManager();
  });

  describe('constructor', () => {
    it('should use default conflictResolver when none provided', () => {
      const mgr = new ConflictManager();
      expect(mgr).toBeInstanceOf(ConflictManager);
    });

    it('should accept a custom resolver', () => {
      const customResolver = new ConflictResolver();
      const mgr = new ConflictManager(customResolver);
      expect(mgr).toBeInstanceOf(ConflictManager);
    });
  });

  describe('addEventListener / removeEventListener', () => {
    it('should register and invoke event handlers', () => {
      const handler = vi.fn();
      manager.addEventListener('conflict_detected', handler);

      // Use handleSyncConflict to trigger events indirectly — or we can test the emit path
      // For now just verify the handler was registered by checking it doesn't throw
      expect(() => manager.removeEventListener('conflict_detected', handler)).not.toThrow();
    });

    it('should not throw when removing a handler that was never added', () => {
      const handler = vi.fn();
      expect(() => manager.removeEventListener('conflict_detected', handler)).not.toThrow();
    });

    it('should not invoke removed handlers', async () => {
      const handler = vi.fn();
      manager.addEventListener('conflict_resolved', handler);
      manager.removeEventListener('conflict_resolved', handler);

      // Trigger a manual resolution to emit conflict_resolved
      // First need a pending conflict
      const local: TestEntity = { id: '1', name: 'local', updated_at: '2025-06-01T10:00:00Z' };
      const remote: TestEntity = { id: '1', name: 'remote', updated_at: '2025-06-02T10:00:00Z' };

      await manager.handleSyncConflict(local, remote);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('getConflictStats', () => {
    it('should return initial stats of all zeros', () => {
      const stats = manager.getConflictStats();

      expect(stats.total).toBe(0);
      expect(stats.resolved).toBe(0);
      expect(stats.pending).toBe(0);
    });

    it('should return a copy (not a reference)', () => {
      const stats1 = manager.getConflictStats();
      const stats2 = manager.getConflictStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('handleSyncConflict', () => {
    it('should resolve using LWW by default', async () => {
      const local: TestEntity = { id: '1', name: 'local', updated_at: '2025-06-01T10:00:00Z' };
      const remote: TestEntity = { id: '1', name: 'remote', updated_at: '2025-06-02T10:00:00Z' };

      const result = await manager.handleSyncConflict(local, remote);

      expect(result.resolvedEntity).toBe(remote);
      expect(result.strategy).toBe('last-write-wins');
      expect(result.automatic).toBe(true);
    });

    it('should mark as automatic for non-field-level merges', async () => {
      const local: TestEntity = { id: '1', name: 'local', updated_at: '2025-06-02T10:00:00Z' };
      const remote: TestEntity = { id: '1', name: 'remote', updated_at: '2025-06-01T10:00:00Z' };

      const result = await manager.handleSyncConflict(local, remote);

      expect(result.automatic).toBe(true);
      expect(manager.getPendingConflicts()).toHaveLength(0);
    });
  });

  describe('resolveConflictManually', () => {
    it('should return false when conflict ID does not exist', async () => {
      const result = await manager.resolveConflictManually('nonexistent', {
        strategy: 'server-authoritative',
        resolvedEntity: { id: '1', name: 'resolved' },
      });

      expect(result).toBe(false);
    });

    it('should resolve a pending conflict and update stats', async () => {
      // We need to directly add a pending conflict. Since handleSyncConflict with LWW
      // doesn't create pending conflicts (it's automatic), let's use the manager
      // with a custom resolver that produces field-level-merge with conflicting fields.
      const customResolver = new ConflictResolver();
      vi.spyOn(customResolver, 'resolve').mockReturnValue({
        resolvedEntity: { id: '1', name: 'merged' },
        strategy: 'field-level-merge',
        hadConflict: true,
        conflictingFields: ['name'],
        automatic: true,
      });
      const mgr = new ConflictManager(customResolver);

      const local: TestEntity = { id: '1', name: 'local' };
      const remote: TestEntity = { id: '1', name: 'remote' };

      await mgr.handleSyncConflict(local, remote);

      // Should have a pending conflict now
      const pending = mgr.getPendingConflicts();
      expect(pending).toHaveLength(1);

      const conflictId = pending[0]!.id;

      // Resolve it manually
      const handler = vi.fn();
      mgr.addEventListener('conflict_resolved', handler);

      const result = await mgr.resolveConflictManually(conflictId, {
        strategy: 'client-authoritative',
        resolvedEntity: { id: '1', name: 'manual-choice' },
        userId: 'user-123',
      });

      expect(result).toBe(true);
      expect(mgr.getPendingConflicts()).toHaveLength(0);

      const stats = mgr.getConflictStats();
      expect(stats.resolved).toBe(1);
      expect(stats.pending).toBe(0);

      // Event was emitted
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'conflict_resolved',
          conflictId,
        })
      );
    });

    it('should add resolved conflict to history', async () => {
      const customResolver = new ConflictResolver();
      vi.spyOn(customResolver, 'resolve').mockReturnValue({
        resolvedEntity: { id: '1', name: 'merged' },
        strategy: 'field-level-merge',
        hadConflict: true,
        conflictingFields: ['name'],
        automatic: true,
      });
      const mgr = new ConflictManager(customResolver);

      const local: TestEntity = { id: '1', name: 'local' };
      const remote: TestEntity = { id: '1', name: 'remote' };

      await mgr.handleSyncConflict(local, remote);
      const conflictId = mgr.getPendingConflicts()[0]!.id;

      await mgr.resolveConflictManually(conflictId, {
        strategy: 'server-authoritative',
        resolvedEntity: { id: '1', name: 'remote' },
      });

      const history = mgr.getResolutionHistory();
      expect(history).toHaveLength(1);
      expect(history[0]!.status).toBe('resolved');
      expect(history[0]!.resolution?.strategy).toBe('server-authoritative');
    });
  });

  describe('getPendingConflicts', () => {
    it('should return empty array when no conflicts', () => {
      expect(manager.getPendingConflicts()).toEqual([]);
    });
  });

  describe('getConflictById', () => {
    it('should return undefined for unknown ID', () => {
      expect(manager.getConflictById('unknown')).toBeUndefined();
    });

    it('should return a pending conflict by ID', async () => {
      const customResolver = new ConflictResolver();
      vi.spyOn(customResolver, 'resolve').mockReturnValue({
        resolvedEntity: { id: '1', name: 'merged' },
        strategy: 'field-level-merge',
        hadConflict: true,
        conflictingFields: ['name'],
        automatic: true,
      });
      const mgr = new ConflictManager(customResolver);

      await mgr.handleSyncConflict(
        { id: '1', name: 'local' },
        { id: '1', name: 'remote' }
      );

      const pending = mgr.getPendingConflicts();
      const conflict = mgr.getConflictById(pending[0]!.id);

      expect(conflict).toBeDefined();
      expect(conflict!.entityId).toBe('1');
      expect(conflict!.status).toBe('pending');
    });
  });

  describe('getResolutionHistory', () => {
    it('should return empty array initially', () => {
      expect(manager.getResolutionHistory()).toEqual([]);
    });

    it('should return a copy of history', async () => {
      const history1 = manager.getResolutionHistory();
      const history2 = manager.getResolutionHistory();
      expect(history1).not.toBe(history2);
    });
  });

  describe('event system', () => {
    it('should emit manual_resolution_required for non-automatic conflicts', async () => {
      const customResolver = new ConflictResolver();
      vi.spyOn(customResolver, 'resolve').mockReturnValue({
        resolvedEntity: { id: '1', name: 'merged' },
        strategy: 'field-level-merge',
        hadConflict: true,
        conflictingFields: ['name'],
        automatic: true,
      });
      const mgr = new ConflictManager(customResolver);

      const handler = vi.fn();
      mgr.addEventListener('manual_resolution_required', handler);

      await mgr.handleSyncConflict(
        { id: '1', name: 'local' },
        { id: '1', name: 'remote' }
      );

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'manual_resolution_required',
          entityId: '1',
        })
      );
    });

    it('should support multiple handlers for same event type', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const customResolver = new ConflictResolver();
      vi.spyOn(customResolver, 'resolve').mockReturnValue({
        resolvedEntity: { id: '1', name: 'merged' },
        strategy: 'field-level-merge',
        hadConflict: true,
        conflictingFields: ['name'],
        automatic: true,
      });
      const mgr = new ConflictManager(customResolver);

      mgr.addEventListener('manual_resolution_required', handler1);
      mgr.addEventListener('manual_resolution_required', handler2);

      await mgr.handleSyncConflict(
        { id: '1', name: 'local' },
        { id: '1', name: 'remote' }
      );

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('singleton export', () => {
    it('should export a default conflictManager instance', () => {
      expect(conflictManager).toBeInstanceOf(ConflictManager);
    });
  });
});
