import { EventEmitter } from 'events';
import { logger } from '@/services/LoggingService';
import {
  OptimisticOperation, 
  RollbackStrategy,
  OptimisticUpdate,
  ConflictResolution
} from '@/types/optimistic-types';

export class OptimisticUIService extends EventEmitter {
  private static instance: OptimisticUIService;
  private pendingOperations: Map<string, OptimisticOperation> = new Map();
  private stateSnapshots: Map<string, unknown> = new Map();
  private rollbackStrategies: Map<string, RollbackStrategy> = new Map();
  private operationQueue: OptimisticOperation[] = [];
  private conflictHandlers: Map<string, (conflicts: unknown[]) => ConflictResolution> = new Map();

  private constructor() {
    super();
    this.initializeService();
  }

  static getInstance(): OptimisticUIService {
    if (!OptimisticUIService.instance) {
      OptimisticUIService.instance = new OptimisticUIService();
    }
    return OptimisticUIService.instance;
  }

  private initializeService() {
    // Set up default rollback strategies
    this.registerDefaultStrategies();
    
    // Listen for network status changes
    window.addEventListener('online', () => this.processQueuedOperations());
    window.addEventListener('offline', () => this.handleOfflineMode());
    
    // Set up periodic sync check
    setInterval(() => this.checkPendingOperations(), 5000);
  }

  /**
   * Apply an optimistic update to the UI
   */
  async applyOptimisticUpdate<T>(update: OptimisticUpdate<T>): Promise<string> {
    const operationId = this.generateOperationId();
    
    // Capture current state for potential rollback
    const snapshot = await this.captureStateSnapshot(update.entityType, update.entityId);
    this.stateSnapshots.set(operationId, snapshot);
    
    // Create operation record
    const operation: OptimisticOperation = {
      id: operationId,
      type: update.type,
      entityType: update.entityType,
      entityId: update.entityId,
      timestamp: Date.now(),
      status: 'pending',
      payload: update.payload,
      rollbackStrategy: update.rollbackStrategy || 'automatic',
      retryCount: 0,
      maxRetries: update.maxRetries || 3
    };
    
    this.pendingOperations.set(operationId, operation);
    
    // Apply the optimistic update immediately
    try {
      await this.applyUpdate(update);
      this.emit('optimisticUpdate', { operationId, update });
      
      // Execute the actual operation in the background
      this.executeBackgroundOperation(operation, update);
      
      return operationId;
    } catch (error) {
      // Immediate failure - rollback right away
      await this.rollbackOperation(operationId, error);
      throw error;
    }
  }

  /**
   * Execute the actual operation in the background
   */
  private async executeBackgroundOperation(
    operation: OptimisticOperation,
    update: OptimisticUpdate<unknown>
  ) {
    try {
      // Add slight delay to show optimistic UI effect
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Execute the actual operation
      const result = await update.execute();
      
      // Check for conflicts
      const conflicts = await this.detectConflicts(operation, result);
      if (conflicts.length > 0) {
        await this.handleConflicts(operation, conflicts);
      } else {
        await this.confirmOperation(operation.id, result);
      }
    } catch (error) {
      await this.handleOperationFailure(operation, error);
    }
  }

  /**
   * Confirm a successful operation
   */
  private async confirmOperation(operationId: string, result: unknown) {
    const operation = this.pendingOperations.get(operationId);
    if (!operation) return;
    
    operation.status = 'confirmed';
    operation.result = result;
    
    // Clean up snapshot after successful confirmation
    setTimeout(() => {
      this.stateSnapshots.delete(operationId);
      this.pendingOperations.delete(operationId);
    }, 30000); // Keep for 30 seconds for undo functionality
    
    this.emit('operationConfirmed', { operationId, result });
  }

  /**
   * Handle operation failure
   */
  private async handleOperationFailure(operation: OptimisticOperation, error: unknown) {
    operation.status = 'failed';
    operation.error = error;
    operation.retryCount++;
    
    // Check if we should retry
    if (operation.retryCount < operation.maxRetries && this.shouldRetry(error)) {
      operation.status = 'retrying';
      this.emit('operationRetrying', { 
        operationId: operation.id, 
        attempt: operation.retryCount 
      });
      
      // Exponential backoff
      const delay = Math.pow(2, operation.retryCount) * 1000;
      setTimeout(() => {
        this.retryOperation(operation);
      }, delay);
    } else {
      // Max retries reached or non-retryable error
      await this.rollbackOperation(operation.id, error);
    }
  }

  /**
   * Rollback an optimistic update
   */
  async rollbackOperation(operationId: string, error?: unknown): Promise<void> {
    const operation = this.pendingOperations.get(operationId);
    const snapshot = this.stateSnapshots.get(operationId);
    
    if (!operation || !snapshot) return;
    
    operation.status = 'rolling_back';
    this.emit('rollbackStarted', { operationId, error });
    
    try {
      const strategy = this.rollbackStrategies.get(operation.rollbackStrategy);
      if (strategy) {
        await strategy.rollback(snapshot, operation);
      } else {
        // Default rollback - restore snapshot
        await this.restoreSnapshot(operation.entityType, operation.entityId, snapshot);
      }
      
      operation.status = 'rolled_back';
      this.emit('rollbackCompleted', { operationId });
      
      // Clean up
      this.pendingOperations.delete(operationId);
      this.stateSnapshots.delete(operationId);
    } catch (rollbackError) {
      logger.error('Rollback failed:', 'services', {}, rollbackError as Error);
      operation.status = 'rollback_failed';
      this.emit('rollbackFailed', { operationId, error: rollbackError });
    }
  }

  /**
   * Detect conflicts between optimistic and actual state
   */
  private async detectConflicts(
    operation: OptimisticOperation, 
    serverResult: unknown
  ): Promise<unknown[]> {
    const conflicts = [];
    const currentState = await this.getCurrentState(operation.entityType, operation.entityId);
    
    // Simple conflict detection - can be enhanced based on entity type
    const serverData = serverResult as Record<string, unknown>;
    const localData = currentState as Record<string, unknown>;
    
    if (serverData.version && localData.version && 
        serverData.version !== localData.version) {
      conflicts.push({
        type: 'version_mismatch',
        local: localData.version,
        server: serverData.version
      });
    }
    
    // Check for field-level conflicts
    if (operation.type === 'update' && operation.payload && typeof operation.payload === 'object') {
      const payload = operation.payload as Record<string, unknown>;
      for (const key in payload) {
        if (serverData[key] !== undefined && 
            serverData[key] !== payload[key]) {
          conflicts.push({
            type: 'field_conflict',
            field: key,
            local: payload[key],
            server: serverData[key]
          });
        }
      }
    }
    
    return conflicts;
  }

  /**
   * Handle detected conflicts
   */
  private async handleConflicts(operation: OptimisticOperation, conflicts: unknown[]) {
    const handler = this.conflictHandlers.get(operation.entityType);
    
    if (handler) {
      const resolution = handler(conflicts);
      
      switch (resolution.strategy) {
        case 'local_wins':
          // Keep optimistic update
          await this.confirmOperation(operation.id, operation.payload);
          break;
          
        case 'server_wins':
          // Rollback to server state
          await this.rollbackOperation(operation.id);
          break;
          
        case 'merge':
          // Apply merge resolution
          await this.applyMergeResolution(operation, resolution.mergedData);
          break;
          
        case 'user_choice':
          // Emit event for user to resolve
          this.emit('conflictDetected', { 
            operationId: operation.id, 
            conflicts,
            operation 
          });
          break;
      }
    } else {
      // Default: server wins
      await this.rollbackOperation(operation.id);
    }
  }

  /**
   * Undo a recently confirmed operation
   */
  async undoOperation(operationId: string): Promise<void> {
    const operation = this.pendingOperations.get(operationId);
    const snapshot = this.stateSnapshots.get(operationId);
    
    if (!operation || !snapshot || operation.status !== 'confirmed') {
      throw new Error('Cannot undo operation');
    }
    
    await this.rollbackOperation(operationId);
    this.emit('operationUndone', { operationId });
  }

  /**
   * Get all pending operations
   */
  getPendingOperations(): OptimisticOperation[] {
    return Array.from(this.pendingOperations.values())
      .filter(op => op.status === 'pending' || op.status === 'retrying');
  }

  /**
   * Check if there are pending operations for an entity
   */
  hasPendingOperations(entityType: string, entityId: string): boolean {
    return Array.from(this.pendingOperations.values()).some(
      op => op.entityType === entityType && op.entityId === entityId && 
            (op.status === 'pending' || op.status === 'retrying')
    );
  }

  /**
   * Register a custom rollback strategy
   */
  registerRollbackStrategy(name: string, strategy: RollbackStrategy) {
    this.rollbackStrategies.set(name, strategy);
  }

  /**
   * Register a conflict handler for an entity type
   */
  registerConflictHandler(
    entityType: string, 
    handler: (conflicts: unknown[]) => ConflictResolution
  ) {
    this.conflictHandlers.set(entityType, handler);
  }

  /**
   * Clear all completed operations
   */
  clearCompletedOperations() {
    const completed = Array.from(this.pendingOperations.entries())
      .filter(([, op]) => op.status === 'confirmed' || op.status === 'rolled_back');
    
    completed.forEach(([id]) => {
      this.pendingOperations.delete(id);
      this.stateSnapshots.delete(id);
    });
  }

  // Helper methods
  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async captureStateSnapshot(entityType: string, entityId: string): Promise<unknown> {
    // This would integrate with your stores to capture current state
    const store = this.getStoreForEntityType(entityType);
    if (!store) return null;
    
    if ('getById' in store && typeof store.getById === 'function') {
      return store.getById(entityId);
    }
    return null;
  }

  private async getCurrentState(entityType: string, entityId: string): Promise<unknown> {
    const store = this.getStoreForEntityType(entityType);
    if (!store) return null;
    
    if ('getById' in store && typeof store.getById === 'function') {
      return store.getById(entityId);
    }
    return null;
  }

  private async restoreSnapshot(entityType: string, entityId: string, snapshot: unknown) {
    const store = this.getStoreForEntityType(entityType);
    if (!store) return;
    
    if ('restore' in store && typeof store.restore === 'function') {
      await store.restore(entityId, snapshot);
    }
  }

  private async applyUpdate(update: OptimisticUpdate<unknown>) {
    const store = this.getStoreForEntityType(update.entityType);
    if (!store) return;
    
    switch (update.type) {
      case 'create':
        if ('optimisticCreate' in store && typeof store.optimisticCreate === 'function') {
          await store.optimisticCreate(update.payload);
        }
        break;
      case 'update':
        if ('optimisticUpdate' in store && typeof store.optimisticUpdate === 'function') {
          await store.optimisticUpdate(update.entityId, update.payload);
        }
        break;
      case 'delete':
        if ('optimisticDelete' in store && typeof store.optimisticDelete === 'function') {
          await store.optimisticDelete(update.entityId);
        }
        break;
    }
  }

  private async applyMergeResolution(operation: OptimisticOperation, mergedData: unknown) {
    const store = this.getStoreForEntityType(operation.entityType);
    if (!store) return;
    
    if ('update' in store && typeof store.update === 'function') {
      await store.update(operation.entityId, mergedData);
    }
    await this.confirmOperation(operation.id, mergedData);
  }

  private getStoreForEntityType(entityType: string): Record<string, unknown> | null {
    // This would map entity types to their respective stores
    // Integration point with your existing stores
    // For now, return null as stores would be injected
    const storeMap: Record<string, Record<string, unknown> | null> = {
      'dog': null,
      'person': null,
      'show': null,
      'entry': null,
      'score': null
    };
    
    return storeMap[entityType] || null;
  }

  private shouldRetry(error: unknown): boolean {
    // Network errors and temporary failures should be retried
    const err = error as Record<string, unknown>;
    if (err.code === 'NETWORK_ERROR' || 
        err.code === 'TIMEOUT' ||
        (err.status as number) >= 500) {
      return true;
    }
    return false;
  }

  private async processQueuedOperations() {
    const pending = this.getPendingOperations();
    for (const operation of pending) {
      if (operation.status === 'pending') {
        // Retry the operation
        this.retryOperation(operation);
      }
    }
  }

  private async retryOperation(operation: OptimisticOperation) {
    // Re-execute the operation
    const update = this.recreateUpdateFromOperation();
    if (update) {
      await this.executeBackgroundOperation(operation, update);
    }
  }

  private recreateUpdateFromOperation(): OptimisticUpdate<unknown> | null {
    // This would recreate the update object from the operation
    // Implementation depends on how you store the original update
    return null;
  }

  private handleOfflineMode() {
    this.emit('offlineModeActivated');
  }

  private registerDefaultStrategies() {
    // Automatic rollback strategy
    this.registerRollbackStrategy('automatic', {
      name: 'automatic',
      rollback: async (snapshot, operation) => {
        await this.restoreSnapshot(operation.entityType, operation.entityId, snapshot);
      }
    });
    
    // Soft delete strategy
    this.registerRollbackStrategy('soft_delete', {
      name: 'soft_delete',
      rollback: async (_snapshot, operation) => {
        const store = this.getStoreForEntityType(operation.entityType);
        if (store && 'update' in store && typeof store.update === 'function') {
          await store.update(operation.entityId, { deleted: false });
        }
      }
    });
    
    // Queue for later strategy
    this.registerRollbackStrategy('queue', {
      name: 'queue',
      rollback: async (_snapshot, operation) => {
        this.operationQueue.push(operation);
        this.emit('operationQueued', { operationId: operation.id });
      }
    });
  }

  private async checkPendingOperations() {
    const pending = this.getPendingOperations();
    const now = Date.now();
    
    for (const operation of pending) {
      // Check for stale operations (older than 5 minutes)
      if (now - operation.timestamp > 300000) {
        await this.rollbackOperation(operation.id, new Error('Operation timeout'));
      }
    }
  }
}

export const optimisticUI = OptimisticUIService.getInstance();