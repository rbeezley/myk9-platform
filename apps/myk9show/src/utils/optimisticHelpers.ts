import { optimisticUI } from '@/services/optimistic/OptimisticUIService';
import { OptimisticUpdate, ConflictResolution } from '@/types/optimistic-types';
import { logger } from '@/services/LoggingService';

// Utility functions for common optimistic UI patterns

/**
 * Create an optimistic entry with validation
 */
export const createOptimisticEntry = async (
  entryData: Record<string, unknown>,
  validationRules: (data: Record<string, unknown>) => string[] | null,
  saveFunction: () => Promise<unknown>
) => {
  // Validate before applying optimistic update
  const errors = validationRules(entryData);
  if (errors && errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  const update: OptimisticUpdate = {
    type: 'create',
    entityType: 'entry',
    entityId: entryData.id as string,
    payload: entryData,
    execute: saveFunction,
    rollbackStrategy: 'automatic',
    maxRetries: 2
  };

  return await optimisticUI.applyOptimisticUpdate(update);
};

/**
 * Update score with immediate feedback
 */
export const updateOptimisticScore = async (
  scoreId: string,
  newScore: number,
  saveFunction: () => Promise<unknown>
) => {
  const update: OptimisticUpdate = {
    type: 'update',
    entityType: 'score',
    entityId: scoreId,
    payload: { score: newScore, updatedAt: new Date() },
    execute: saveFunction,
    rollbackStrategy: 'automatic',
    maxRetries: 5 // Scores are critical
  };

  return await optimisticUI.applyOptimisticUpdate(update);
};

/**
 * Batch update multiple entries
 */
export const batchUpdateEntries = async (
  entries: Array<{ id: string; updates: Record<string, unknown> }>,
  saveFunction: () => Promise<unknown>
) => {
  const operationIds: string[] = [];

  for (const entry of entries) {
    const update: OptimisticUpdate = {
      type: 'update',
      entityType: 'entry',
      entityId: entry.id,
      payload: entry.updates,
      execute: async () => {
        // For batch operations, we only execute once for all
        if (operationIds.length === entries.length) {
          return await saveFunction();
        }
        return Promise.resolve();
      },
      rollbackStrategy: 'queue',
      maxRetries: 3
    };

    const operationId = await optimisticUI.applyOptimisticUpdate(update);
    operationIds.push(operationId);
  }

  return operationIds;
};

/**
 * Soft delete with undo option
 */
export const softDeleteWithUndo = async (
  entityType: string,
  entityId: string,
  saveFunction: () => Promise<unknown>
) => {
  const update: OptimisticUpdate = {
    type: 'update',
    entityType,
    entityId,
    payload: { deleted: true, deletedAt: new Date() },
    execute: saveFunction,
    rollbackStrategy: 'soft_delete',
    maxRetries: 2
  };

  return await optimisticUI.applyOptimisticUpdate(update);
};

/**
 * Handle form submission with optimistic updates
 */
export const optimisticFormSubmit = async <T>(
  entityType: string,
  entityId: string,
  formData: T,
  isNew: boolean,
  saveFunction: () => Promise<unknown>,
  validationFunction?: (data: T) => string[] | null
) => {
  // Validate if validator provided
  if (validationFunction) {
    const errors = validationFunction(formData);
    if (errors && errors.length > 0) {
      throw new Error(`Validation failed: ${errors.join(', ')}`);
    }
  }

  const update: OptimisticUpdate<T> = {
    type: isNew ? 'create' : 'update',
    entityType,
    entityId,
    payload: formData,
    execute: saveFunction,
    rollbackStrategy: 'automatic',
    maxRetries: 3
  };

  return await optimisticUI.applyOptimisticUpdate(update);
};

/**
 * Handle file upload with progress
 */
export const optimisticFileUpload = async (
  entityType: string,
  entityId: string,
  file: File,
  uploadFunction: (file: File, progressCallback: (progress: number) => void) => Promise<unknown>
) => {
  // Create temporary URL for immediate preview
  const tempUrl = URL.createObjectURL(file);
  
  const update: OptimisticUpdate = {
    type: 'update',
    entityType,
    entityId,
    payload: { 
      fileUrl: tempUrl,
      fileName: file.name,
      fileSize: file.size,
      uploading: true 
    },
    execute: async () => {
      try {
        const result = await uploadFunction(file, (progress) => {
          // Emit progress events
          optimisticUI.emit('uploadProgress', { 
            entityId, 
            progress, 
            fileName: file.name 
          });
        });
        
        // Clean up temp URL
        URL.revokeObjectURL(tempUrl);
        
        return result;
      } catch (error) {
        URL.revokeObjectURL(tempUrl);
        throw error;
      }
    },
    rollbackStrategy: 'automatic',
    maxRetries: 2
  };

  return await optimisticUI.applyOptimisticUpdate(update);
};

/**
 * Handle status changes with conflict resolution
 */
export const optimisticStatusChange = async (
  entityType: string,
  entityId: string,
  newStatus: string,
  saveFunction: () => Promise<unknown>,
  conflictResolver?: (conflicts: unknown[]) => ConflictResolution
) => {
  const update: OptimisticUpdate = {
    type: 'update',
    entityType,
    entityId,
    payload: { 
      status: newStatus, 
      statusUpdatedAt: new Date(),
      statusUpdatedBy: 'current_user' // Replace with actual user
    },
    execute: saveFunction,
    rollbackStrategy: 'automatic',
    maxRetries: 3
  };

  // Register conflict handler if provided
  if (conflictResolver) {
    const typedResolver = (conflicts: unknown[]): ConflictResolution => {
      return conflictResolver(conflicts);
    };
    optimisticUI.registerConflictHandler(entityType, typedResolver);
  }

  return await optimisticUI.applyOptimisticUpdate(update);
};

/**
 * Retry failed operations
 */
export const retryFailedOperations = async (entityTypeFilter?: string) => {
  void entityTypeFilter; // Suppress unused parameter warning
  const pendingOps = optimisticUI.getPendingOperations();
  const failedOps = pendingOps.filter(op => {
    void op; // Suppress unused variable warning
    return false; // Placeholder logic since getPendingOperations is not implemented
  });

  const retryPromises = failedOps.map(async (op) => {
    try {
      // Reset retry count and status
      op.retryCount = 0;
      op.status = 'pending';
      
      // This would need to be implemented in the service
      // await optimisticUI.retryOperation(op);
    } catch (error) {
      logger.error(`Failed to retry operation ${op.id}:`, 'utils', {}, error as Error);
    }
  });

  return await Promise.allSettled(retryPromises);
};

/**
 * Get operation summary for debugging
 */
export const getOperationSummary = () => {
  const operations = optimisticUI.getPendingOperations();
  
  const summary = operations.reduce((acc, op) => {
    acc.total++;
    acc.byStatus[op.status] = (acc.byStatus[op.status] || 0) + 1;
    acc.byEntityType[op.entityType] = (acc.byEntityType[op.entityType] || 0) + 1;
    
    // Type guard for operation with timestamp
    const opWithTimestamp = op as { timestamp: number };
    if (!acc.oldestOperation || opWithTimestamp.timestamp < (acc.oldestOperation as { timestamp: number }).timestamp) {
      acc.oldestOperation = op;
    }
    
    return acc;
  }, {
    total: 0,
    byStatus: {} as Record<string, number>,
    byEntityType: {} as Record<string, number>,
    oldestOperation: null as unknown
  });

  return summary;
};

/**
 * Clean up old operations
 */
export const cleanupOldOperations = (maxAge: number = 300000) => { // 5 minutes
  const now = Date.now();
  const operations = optimisticUI.getPendingOperations();
  
  const oldOperations = operations.filter(op => 
    (now - op.timestamp) > maxAge &&
    (op.status === 'confirmed' || op.status === 'rolled_back')
  );

  oldOperations.forEach(operation => {
    void operation; // Suppress unused parameter warning
    // This would need to be implemented in the service
    // optimisticUI.removeOperation(operation.id);
  });

  return oldOperations.length;
};

/**
 * Export current state for debugging
 */
export const exportOptimisticState = () => {
  const operations = optimisticUI.getPendingOperations();
  const summary = getOperationSummary();
  
  return {
    timestamp: new Date().toISOString(),
    summary,
    operations: operations.map(op => ({
      id: op.id,
      type: op.type,
      entityType: op.entityType,
      entityId: op.entityId,
      status: op.status,
      timestamp: new Date(op.timestamp).toISOString(),
      retryCount: op.retryCount,
      error: op.error ? {
        message: (op.error as { message: string }).message,
        code: (op.error as { code: string }).code
      } : null
    }))
  };
};