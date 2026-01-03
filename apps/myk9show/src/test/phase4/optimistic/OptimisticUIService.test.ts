import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OptimisticUIService } from '../../../services/optimistic/OptimisticUIService';
import { OptimisticUpdate } from '../../../types/optimistic-types';

// Mock stores
const mockDogStore = {
  getById: vi.fn(),
  optimisticCreate: vi.fn(),
  optimisticUpdate: vi.fn(),
  optimisticDelete: vi.fn(),
  update: vi.fn(),
  restore: vi.fn()
};

const mockScoreStore = {
  getById: vi.fn(),
  optimisticCreate: vi.fn(),
  optimisticUpdate: vi.fn(),
  optimisticDelete: vi.fn(),
  update: vi.fn(),
  restore: vi.fn()
};

describe('OptimisticUIService - Phase 4 Tests', () => {
  let service: OptimisticUIService;
  let mockExecute: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = OptimisticUIService.getInstance();
    
    // Mock store access
    service['getStoreForEntityType'] = vi.fn().mockImplementation((entityType: string) => {
      switch (entityType) {
        case 'dog': return mockDogStore;
        case 'score': return mockScoreStore;
        default: return null;
      }
    });

    mockExecute = vi.fn();
  });

  afterEach(() => {
    service.clearCompletedOperations();
  });

  describe('Optimistic Updates', () => {
    it('should apply optimistic update immediately and confirm success', async () => {
      const mockResult = { id: 'dog-1', name: 'Updated Rex', score: 95 };
      mockExecute.mockResolvedValue(mockResult);
      
      mockDogStore.getById.mockReturnValue({ 
        id: 'dog-1', 
        name: 'Rex', 
        score: 85 
      });

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { name: 'Updated Rex', score: 95 },
        execute: mockExecute,
        rollbackStrategy: 'automatic',
        maxRetries: 3
      };

      const operationId = await service.applyOptimisticUpdate(update);

      // Should apply update immediately
      expect(mockDogStore.optimisticUpdate).toHaveBeenCalledWith(
        'dog-1',
        { name: 'Updated Rex', score: 95 }
      );

      // Wait for background execution
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should execute the actual operation
      expect(mockExecute).toHaveBeenCalled();
      
      // Operation should be confirmed
      const operation = service['pendingOperations'].get(operationId);
      expect(operation?.status).toBe('confirmed');
    });

    it('should rollback optimistic update on failure', async () => {
      const mockError = new Error('Server error');
      mockExecute.mockRejectedValue(mockError);
      
      const originalData = { id: 'dog-1', name: 'Rex', score: 85 };
      mockDogStore.getById.mockReturnValue(originalData);

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { name: 'Updated Rex', score: 95 },
        execute: mockExecute,
        rollbackStrategy: 'automatic',
        maxRetries: 1
      };

      const rollbackListener = vi.fn();
      service.on('rollbackCompleted', rollbackListener);

      const operationId = await service.applyOptimisticUpdate(update);

      // Wait for background execution and rollback
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should attempt rollback
      expect(rollbackListener).toHaveBeenCalledWith(
        expect.objectContaining({ operationId })
      );

      // Operation should be rolled back
      const operation = service['pendingOperations'].get(operationId);
      expect(operation?.status).toBe('rolled_back');
    });

    it('should retry failed operations with exponential backoff', async () => {
      let callCount = 0;
      mockExecute.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Network error');
        }
        return Promise.resolve({ id: 'dog-1', name: 'Updated Rex' });
      });

      mockDogStore.getById.mockReturnValue({ id: 'dog-1', name: 'Rex' });

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { name: 'Updated Rex' },
        execute: mockExecute,
        rollbackStrategy: 'automatic',
        maxRetries: 3
      };

      const retryListener = vi.fn();
      service.on('operationRetrying', retryListener);

      const operationId = await service.applyOptimisticUpdate(update);

      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should have retried
      expect(retryListener).toHaveBeenCalled();
      expect(callCount).toBe(3);

      // Should eventually succeed
      const operation = service['pendingOperations'].get(operationId);
      expect(operation?.status).toBe('confirmed');
    });
  });

  describe('Conflict Detection and Resolution', () => {
    it('should detect version conflicts and handle appropriately', async () => {
      const serverResult = { 
        id: 'dog-1', 
        name: 'Server Rex', 
        version: 5 
      };
      
      const currentState = { 
        id: 'dog-1', 
        name: 'Local Rex', 
        version: 3 
      };

      mockExecute.mockResolvedValue(serverResult);
      mockDogStore.getById.mockReturnValue(currentState);

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { name: 'Local Rex' },
        execute: mockExecute
      };

      const conflictListener = vi.fn();
      service.on('conflictDetected', conflictListener);

      const operationId = await service.applyOptimisticUpdate(update);

      // Wait for conflict detection
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(conflictListener).toHaveBeenCalledWith(
        expect.objectContaining({
          operationId,
          conflicts: expect.arrayContaining([
            expect.objectContaining({
              type: 'version_mismatch',
              local: 3,
              server: 5
            })
          ])
        })
      );
    });

    it('should detect field-level conflicts', async () => {
      const serverResult = { 
        id: 'score-1', 
        score: 88,
        notes: 'Server notes'
      };

      mockExecute.mockResolvedValue(serverResult);
      mockScoreStore.getById.mockReturnValue({ 
        id: 'score-1', 
        score: 85,
        notes: 'Local notes'
      });

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'score',
        entityId: 'score-1',
        payload: { score: 92, notes: 'Local notes' },
        execute: mockExecute
      };

      const conflictListener = vi.fn();
      service.on('conflictDetected', conflictListener);

      await service.applyOptimisticUpdate(update);

      // Wait for conflict detection
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(conflictListener).toHaveBeenCalledWith(
        expect.objectContaining({
          conflicts: expect.arrayContaining([
            expect.objectContaining({
              type: 'field_conflict',
              field: 'score',
              local: 92,
              server: 88
            })
          ])
        })
      );
    });

    it('should resolve conflicts using registered handlers', async () => {
      // Register a conflict handler
      service.registerConflictHandler('score', () => ({
        strategy: 'local_wins' as const,
        mergedData: null
      }));

      const serverResult = { 
        id: 'score-1', 
        score: 88
      };

      mockExecute.mockResolvedValue(serverResult);
      mockScoreStore.getById.mockReturnValue({ 
        id: 'score-1', 
        score: 85
      });

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'score',
        entityId: 'score-1',
        payload: { score: 92 },
        execute: mockExecute
      };

      const operationId = await service.applyOptimisticUpdate(update);

      // Wait for conflict resolution
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should keep local version (local_wins strategy)
      const operation = service['pendingOperations'].get(operationId);
      expect(operation?.status).toBe('confirmed');
    });
  });

  describe('Batch Operations', () => {
    it('should handle multiple simultaneous optimistic updates', async () => {
      const updates = Array.from({ length: 5 }, (_, i) => ({
        type: 'update' as const,
        entityType: 'dog',
        entityId: `dog-${i}`,
        payload: { name: `Dog ${i}` },
        execute: vi.fn().mockResolvedValue({ id: `dog-${i}`, name: `Dog ${i}` })
      }));

      mockDogStore.getById.mockImplementation((id) => ({ 
        id, 
        name: 'Original Name' 
      }));

      const promises = updates.map(update => 
        service.applyOptimisticUpdate(update)
      );

      const operationIds = await Promise.all(promises);

      expect(operationIds).toHaveLength(5);
      expect(service.getPendingOperations()).toHaveLength(5);

      // Wait for all operations to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // All should be confirmed
      operationIds.forEach(id => {
        const operation = service['pendingOperations'].get(id);
        expect(operation?.status).toBe('confirmed');
      });
    });

    it('should maintain operation order in batch processing', async () => {
      const results: string[] = [];
      
      const createUpdate = (id: string, delay: number) => ({
        type: 'update' as const,
        entityType: 'dog',
        entityId: id,
        payload: { name: `Dog ${id}` },
        execute: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, delay));
          results.push(id);
          return { id, name: `Dog ${id}` };
        })
      });

      mockDogStore.getById.mockImplementation((id) => ({ id, name: 'Original' }));

      // Create updates with different delays
      const updates = [
        createUpdate('1', 100),
        createUpdate('2', 50),
        createUpdate('3', 75)
      ];

      const promises = updates.map(update => 
        service.applyOptimisticUpdate(update)
      );

      await Promise.all(promises);

      // Wait for all executions
      await new Promise(resolve => setTimeout(resolve, 200));

      // Results should be in execution order (by delay)
      expect(results).toEqual(['2', '3', '1']);
    });
  });

  describe('Custom Rollback Strategies', () => {
    it('should use custom rollback strategy when registered', async () => {
      const customRollback = vi.fn();
      
      service.registerRollbackStrategy('custom', {
        name: 'custom',
        rollback: customRollback
      });

      mockExecute.mockRejectedValue(new Error('Test error'));
      mockDogStore.getById.mockReturnValue({ id: 'dog-1', name: 'Rex' });

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { name: 'Updated Rex' },
        execute: mockExecute,
        rollbackStrategy: 'custom',
        maxRetries: 1
      };

      await service.applyOptimisticUpdate(update);

      // Wait for rollback
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(customRollback).toHaveBeenCalled();
    });

    it('should use soft delete strategy correctly', async () => {
      mockExecute.mockRejectedValue(new Error('Delete failed'));
      mockDogStore.getById.mockReturnValue({ 
        id: 'dog-1', 
        name: 'Rex',
        deleted: false
      });

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'delete',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { deleted: true },
        execute: mockExecute,
        rollbackStrategy: 'soft_delete',
        maxRetries: 1
      };

      await service.applyOptimisticUpdate(update);

      // Wait for rollback
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(mockDogStore.update).toHaveBeenCalledWith(
        'dog-1',
        { deleted: false }
      );
    });

    it('should queue operations when using queue strategy', async () => {
      mockExecute.mockRejectedValue(new Error('Queued operation'));
      mockDogStore.getById.mockReturnValue({ id: 'dog-1', name: 'Rex' });

      const queueListener = vi.fn();
      service.on('operationQueued', queueListener);

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { name: 'Updated Rex' },
        execute: mockExecute,
        rollbackStrategy: 'queue',
        maxRetries: 1
      };

      await service.applyOptimisticUpdate(update);

      // Wait for queueing
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(queueListener).toHaveBeenCalled();
      expect(service['operationQueue']).toHaveLength(1);
    });
  });

  describe('Operation Management', () => {
    it('should track pending operations correctly', async () => {
      mockDogStore.getById.mockReturnValue({ id: 'dog-1', name: 'Rex' });

      const update1: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { name: 'Updated Rex 1' },
        execute: vi.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({}), 1000))
        )
      };

      const update2: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-2',
        payload: { name: 'Updated Rex 2' },
        execute: vi.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({}), 1000))
        )
      };

      await service.applyOptimisticUpdate(update1);
      await service.applyOptimisticUpdate(update2);

      expect(service.getPendingOperations()).toHaveLength(2);
      expect(service.hasPendingOperations('dog', 'dog-1')).toBe(true);
      expect(service.hasPendingOperations('dog', 'dog-3')).toBe(false);
    });

    it('should allow undoing recently confirmed operations', async () => {
      const mockResult = { id: 'dog-1', name: 'Updated Rex' };
      mockExecute.mockResolvedValue(mockResult);
      mockDogStore.getById.mockReturnValue({ id: 'dog-1', name: 'Rex' });

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { name: 'Updated Rex' },
        execute: mockExecute
      };

      const undoListener = vi.fn();
      service.on('operationUndone', undoListener);

      const operationId = await service.applyOptimisticUpdate(update);

      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 200));

      // Undo the operation
      await service.undoOperation(operationId);

      expect(undoListener).toHaveBeenCalledWith({ operationId });
      expect(mockDogStore.restore).toHaveBeenCalled();
    });

    it('should clean up completed operations automatically', async () => {
      const mockResult = { id: 'dog-1', name: 'Updated Rex' };
      mockExecute.mockResolvedValue(mockResult);
      mockDogStore.getById.mockReturnValue({ id: 'dog-1', name: 'Rex' });

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { name: 'Updated Rex' },
        execute: mockExecute
      };

      await service.applyOptimisticUpdate(update);

      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 200));

      const initialSize = service['pendingOperations'].size;

      service.clearCompletedOperations();

      // Should remove confirmed operations
      expect(service['pendingOperations'].size).toBeLessThan(initialSize);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle immediate failures gracefully', async () => {
      mockDogStore.optimisticUpdate.mockRejectedValue(new Error('Store error'));

      const update: OptimisticUpdate<Record<string, unknown>> = {
        type: 'update',
        entityType: 'dog',
        entityId: 'dog-1',
        payload: { name: 'Updated Rex' },
        execute: mockExecute
      };

      await expect(service.applyOptimisticUpdate(update)).rejects.toThrow('Store error');
    });

    it('should handle stale operations cleanup', async () => {
      // Create an old operation
      const oldOperation = {
        id: 'old-op',
        type: 'update' as const,
        entityType: 'dog',
        entityId: 'dog-1',
        timestamp: Date.now() - 400000, // 6+ minutes old
        status: 'pending' as const,
        payload: {},
        rollbackStrategy: 'automatic' as const,
        retryCount: 0,
        maxRetries: 3
      };

      service['pendingOperations'].set('old-op', oldOperation);

      const rollbackListener = vi.fn();
      service.on('rollbackCompleted', rollbackListener);

      // Trigger stale operation check
      await service['checkPendingOperations']();

      expect(rollbackListener).toHaveBeenCalledWith(
        expect.objectContaining({ operationId: 'old-op' })
      );
    });

    it('should handle network state changes', async () => {
      const offlineListener = vi.fn();
      service.on('offlineModeActivated', offlineListener);

      // Simulate going offline
      window.dispatchEvent(new Event('offline'));

      expect(offlineListener).toHaveBeenCalled();

      // Operations should still be tracked
      expect(service.getPendingOperations()).toEqual([]);
    });
  });

  describe('Performance Testing', () => {
    it('should handle many concurrent operations efficiently', async () => {
      const operationCount = 50;
      const startTime = Date.now();

      mockDogStore.getById.mockImplementation((id) => ({ 
        id, 
        name: 'Original' 
      }));

      const updates = Array.from({ length: operationCount }, (_, i) => ({
        type: 'update' as const,
        entityType: 'dog',
        entityId: `dog-${i}`,
        payload: { name: `Dog ${i}` },
        execute: vi.fn().mockResolvedValue({ id: `dog-${i}`, name: `Dog ${i}` })
      }));

      const promises = updates.map(update => 
        service.applyOptimisticUpdate(update)
      );

      const operationIds = await Promise.all(promises);
      const endTime = Date.now();

      expect(operationIds).toHaveLength(operationCount);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete quickly

      // Wait for background processing
      await new Promise(resolve => setTimeout(resolve, 300));

      // Check that operations completed
      const completedCount = operationIds.filter(id => {
        const op = service['pendingOperations'].get(id);
        return op?.status === 'confirmed';
      }).length;

      expect(completedCount).toBeGreaterThan(operationCount * 0.8); // Most should complete
    });
  });
});