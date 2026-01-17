import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { logger } from '@/services/LoggingService';

export interface OptimisticUpdate<T> {
  id: string;
  optimisticData: T;
  originalData: T;
  timestamp: number;
  type: string;
  action: () => Promise<unknown>;
  rollbackAction?: () => void;
  onSuccess?: (result: unknown) => void;
  onError?: (error: unknown) => void;
}

export interface OptimisticUpdatesConfig {
  /** Timeout for requests in milliseconds (default: 30000 = 30 seconds) */
  requestTimeout?: number;
  /** Maximum number of concurrent optimistic updates (default: 10) */
  maxConcurrentUpdates?: number;
  /** Auto-retry failed requests (default: true) */
  autoRetry?: boolean;
  /** Number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Show toast notifications for successes and errors (default: true) */
  showNotifications?: boolean;
  /** Debug logging (default: false) */
  debug?: boolean;
}

const DEFAULT_CONFIG: Required<OptimisticUpdatesConfig> = {
  requestTimeout: 30000,
  maxConcurrentUpdates: 10,
  autoRetry: true,
  maxRetries: 3,
  showNotifications: true,
  debug: false
};

/**
 * Hook for managing optimistic updates with automatic rollback on failure
 */
export function useOptimisticUpdates<T>(
  initialData: T,
  config: OptimisticUpdatesConfig = {}
) {
  const {
    requestTimeout,
    maxConcurrentUpdates,
    autoRetry,
    maxRetries,
    showNotifications,
    debug
  } = { ...DEFAULT_CONFIG, ...config };

  const [data, setData] = useState<T>(initialData);
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, OptimisticUpdate<T>>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [hasOptimisticChanges, setHasOptimisticChanges] = useState(false);

  const pendingUpdatesRef = useRef(pendingUpdates);

  // Keep pendingUpdatesRef in sync via useEffect
  useEffect(() => {
    pendingUpdatesRef.current = pendingUpdates;
  }, [pendingUpdates]);

  // Ref to enable self-reference in executeOptimisticUpdate for retry logic
  const executeOptimisticUpdateRef = useRef<typeof executeOptimisticUpdate>(null!);

  const log = useCallback((message: string, ...args: unknown[]) => {
    if (debug) {
      logger.debug(`[OptimisticUpdates] ${message}`, 'hooks', { data: args });
    }
  }, [debug]);

  // Generate unique ID for updates
  const generateUpdateId = useCallback(() => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Apply optimistic update immediately
  const applyOptimisticUpdate = useCallback((
    updateId: string,
    optimisticData: T,
    originalData: T,
    type: string,
    action: () => Promise<unknown>,
    options?: {
      rollbackAction?: () => void;
      onSuccess?: (result: unknown) => void;
      onError?: (error: unknown) => void;
    }
  ) => {
    const update: OptimisticUpdate<T> = {
      id: updateId,
      optimisticData,
      originalData,
      timestamp: Date.now(),
      type,
      action,
      rollbackAction: options?.rollbackAction,
      onSuccess: options?.onSuccess,
      onError: options?.onError
    };

    // Update UI immediately with optimistic data
    setData(optimisticData);
    
    // Track pending update
    setPendingUpdates(prev => {
      const newUpdates = new Map(prev);
      newUpdates.set(updateId, update);
      return newUpdates;
    });

    setHasOptimisticChanges(true);
    setIsLoading(true);

    log('Applied optimistic update:', updateId, type);

    return update;
  }, [log]);

  // Rollback a specific update
  const rollbackUpdate = useCallback((updateId: string, error?: unknown) => {
    const update = pendingUpdatesRef.current.get(updateId);
    if (!update) {
      log('Update not found for rollback:', updateId);
      return;
    }

    log('Rolling back update:', updateId, update.type, (error instanceof Error ? error.message : 'No error details'));

    // Restore original data
    setData(update.originalData);

    // Execute custom rollback action if provided
    if (update.rollbackAction) {
      try {
        update.rollbackAction();
      } catch (rollbackError) {
        log('Error in rollback action:', rollbackError);
      }
    }

    // Execute error callback
    if (update.onError) {
      try {
        update.onError(error);
      } catch (callbackError) {
        log('Error in error callback:', callbackError);
      }
    }

    // Remove from pending updates
    setPendingUpdates(prev => {
      const newUpdates = new Map(prev);
      newUpdates.delete(updateId);
      
      // Update loading states
      setHasOptimisticChanges(newUpdates.size > 0);
      setIsLoading(newUpdates.size > 0);
      
      return newUpdates;
    });

    // Show error notification
    if (showNotifications) {
      toast.error(`Failed to ${update.type.toLowerCase()}`, {
        description: (error instanceof Error ? error.message : 'An unexpected error occurred'),
        action: {
          label: 'Dismiss',
          onClick: () => {}
        }
      });
    }
  }, [log, showNotifications]);

  // Confirm a successful update
  const confirmUpdate = useCallback((updateId: string, result?: unknown) => {
    const update = pendingUpdatesRef.current.get(updateId);
    if (!update) {
      log('Update not found for confirmation:', updateId);
      return;
    }

    log('Confirmed update:', updateId, update.type);

    // Execute success callback
    if (update.onSuccess) {
      try {
        update.onSuccess(result);
      } catch (callbackError) {
        log('Error in success callback:', callbackError);
      }
    }

    // Remove from pending updates
    setPendingUpdates(prev => {
      const newUpdates = new Map(prev);
      newUpdates.delete(updateId);
      
      // Update loading states
      setHasOptimisticChanges(newUpdates.size > 0);
      setIsLoading(newUpdates.size > 0);
      
      return newUpdates;
    });

    // Show success notification
    if (showNotifications) {
      toast.success(`Successfully ${update.type.toLowerCase()}`, {
        description: 'Changes have been saved'
      });
    }
  }, [log, showNotifications]);

  // Execute optimistic update with automatic rollback on failure
  const executeOptimisticUpdate = useCallback(async (
    type: string,
    optimisticData: T,
    action: () => Promise<unknown>,
    options?: {
      rollbackAction?: () => void;
      onSuccess?: (result: unknown) => void;
      onError?: (error: unknown) => void;
      retryCount?: number;
    }
  ) => {
    // Check concurrent update limit
    if (pendingUpdatesRef.current.size >= maxConcurrentUpdates) {
      const error = new Error(`Maximum concurrent updates exceeded (${maxConcurrentUpdates})`);
      log('Update rejected:', error.message);
      
      if (showNotifications) {
        toast.error('Too many pending changes', {
          description: 'Please wait for current changes to complete'
        });
      }
      
      return { success: false, error };
    }

    const updateId = generateUpdateId();
    const originalData = data;
    const retryCount = options?.retryCount || 0;

    // Apply optimistic update
    applyOptimisticUpdate(
      updateId,
      optimisticData,
      originalData,
      type,
      action,
      options
    );

    try {
      // Execute the actual action with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), requestTimeout);
      });

      const result = await Promise.race([action(), timeoutPromise]);
      
      // Confirm successful update
      confirmUpdate(updateId, result);
      
      return { success: true, result, updateId };
    } catch (error: unknown) {
      log('Update failed:', updateId, (error instanceof Error ? error.message : 'Unknown error'));

      // Auto-retry logic
      if (autoRetry && retryCount < maxRetries) {
        log('Retrying update:', updateId, `attempt ${retryCount + 1}/${maxRetries}`);
        
        // Remove current pending update before retry
        setPendingUpdates(prev => {
          const newUpdates = new Map(prev);
          newUpdates.delete(updateId);
          return newUpdates;
        });

        // Retry with incremented count using ref for self-reference
        return executeOptimisticUpdateRef.current(type, optimisticData, action, {
          ...options,
          retryCount: retryCount + 1
        });
      }

      // Rollback failed update
      rollbackUpdate(updateId, error);
      
      return { success: false, error, updateId };
    }
  }, [
    data,
    maxConcurrentUpdates,
    requestTimeout,
    autoRetry,
    maxRetries,
    showNotifications,
    log,
    generateUpdateId,
    applyOptimisticUpdate,
    confirmUpdate,
    rollbackUpdate
  ]);

  // Keep ref updated with latest function for recursive calls via useEffect
  useEffect(() => {
    executeOptimisticUpdateRef.current = executeOptimisticUpdate;
  }, [executeOptimisticUpdate]);

  // Rollback all pending updates
  const rollbackAll = useCallback(() => {
    const updates = Array.from(pendingUpdatesRef.current.values());
    log('Rolling back all updates:', updates.length);

    updates.forEach(update => {
      rollbackUpdate(update.id);
    });

    if (showNotifications && updates.length > 0) {
      toast.info('All pending changes have been cancelled');
    }
  }, [rollbackUpdate, showNotifications, log]);

  // Get pending update status
  const getPendingUpdateStatus = useCallback(() => {
    const updates = Array.from(pendingUpdatesRef.current.values());
    return {
      count: updates.length,
      types: updates.map(u => u.type),
      oldestTimestamp: updates.length > 0 ? Math.min(...updates.map(u => u.timestamp)) : null
    };
  }, []);

  return {
    // Current data state
    data,
    setData,
    
    // Optimistic update operations
    executeOptimisticUpdate,
    rollbackUpdate,
    rollbackAll,
    
    // Status
    isLoading,
    hasOptimisticChanges,
    pendingUpdatesCount: pendingUpdates.size,
    getPendingUpdateStatus,
    
    // Direct access to pending updates (for debugging)
    pendingUpdates: Array.from(pendingUpdates.values())
  };
}

/**
 * Higher-order hook for specific entity types with pre-configured optimistic updates
 */
export function useOptimisticEntityUpdates<T extends { id: string }>(
  entities: T[],
  config?: OptimisticUpdatesConfig
) {
  const {
    data: optimisticEntities,
    executeOptimisticUpdate,
    rollbackUpdate,
    rollbackAll,
    isLoading,
    hasOptimisticChanges,
    pendingUpdatesCount
  } = useOptimisticUpdates(entities, config);

  // Add entity optimistically
  const addEntity = useCallback(async (
    newEntity: T,
    saveAction: () => Promise<T>
  ) => {
    const optimisticData = [...optimisticEntities, newEntity];
    
    return executeOptimisticUpdate(
      'Add Entity',
      optimisticData,
      saveAction,
      {
        onSuccess: (savedEntity) => {
          // Replace optimistic entity with saved entity
          optimisticData.map(e => 
            e.id === newEntity.id ? savedEntity : e
          );
          // Note: This would require additional state management for the final update
        }
      }
    );
  }, [optimisticEntities, executeOptimisticUpdate]);

  // Update entity optimistically
  const updateEntity = useCallback(async (
    entityId: string,
    updates: Partial<T>,
    saveAction: () => Promise<T>
  ) => {
    const optimisticData = optimisticEntities.map(entity =>
      entity.id === entityId ? { ...entity, ...updates } : entity
    );
    
    return executeOptimisticUpdate(
      'Update Entity',
      optimisticData,
      saveAction
    );
  }, [optimisticEntities, executeOptimisticUpdate]);

  // Delete entity optimistically
  const deleteEntity = useCallback(async (
    entityId: string,
    deleteAction: () => Promise<void>
  ) => {
    const optimisticData = optimisticEntities.filter(entity => entity.id !== entityId);
    
    return executeOptimisticUpdate(
      'Delete Entity',
      optimisticData,
      deleteAction,
      {
        rollbackAction: () => {
          // Custom rollback could include showing the deleted entity again
        }
      }
    );
  }, [optimisticEntities, executeOptimisticUpdate]);

  return {
    entities: optimisticEntities,
    addEntity,
    updateEntity,
    deleteEntity,
    rollbackUpdate,
    rollbackAll,
    isLoading,
    hasOptimisticChanges,
    pendingUpdatesCount
  };
}