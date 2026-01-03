import { useState, useEffect, useCallback, useRef } from 'react';
import { optimisticUI } from '@/services/optimistic/OptimisticUIService';
import { 
  OptimisticOperation, 
  OptimisticUpdate, 
  ConflictResolution,
  OperationStatus 
} from '@/types/optimistic-types';

export interface UseOptimisticUIOptions {
  entityType: string;
  onSuccess?: (operationId: string, result: unknown) => void;
  onError?: (operationId: string, error: unknown) => void;
  onRollback?: (operationId: string) => void;
  onConflict?: (operationId: string, conflicts: unknown[]) => ConflictResolution;
  autoRetry?: boolean;
  maxRetries?: number;
}

export const useOptimisticUI = (options: UseOptimisticUIOptions) => {
  const [pendingOperations, setPendingOperations] = useState<OptimisticOperation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastOperationId, setLastOperationId] = useState<string | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Update pending operations state
  const updatePendingOperations = useCallback(() => {
    const pending = optimisticUI.getPendingOperations()
      .filter(op => op.entityType === options.entityType);
    setPendingOperations(pending);
    setIsProcessing(pending.length > 0);
  }, [options.entityType]);

  useEffect(() => {
    // Initial update
    updatePendingOperations();

    // Listen for operation events
    const handleOptimisticUpdate = (event: { update: { entityType: string } }) => {
      if (event.update.entityType === options.entityType) {
        updatePendingOperations();
      }
    };

    const handleOperationConfirmed = (event: { operationId: string; result: unknown }) => {
      updatePendingOperations();
      if (optionsRef.current.onSuccess) {
        optionsRef.current.onSuccess(event.operationId, event.result);
      }
    };

    const handleRollbackCompleted = (event: { operationId: string }) => {
      updatePendingOperations();
      if (optionsRef.current.onRollback) {
        optionsRef.current.onRollback(event.operationId);
      }
    };

    const handleOperationRetrying = () => {
      updatePendingOperations();
    };

    const handleConflictDetected = (event: { operation: { entityType: string }; operationId: string; conflicts: unknown[] }) => {
      if (event.operation.entityType === options.entityType && optionsRef.current.onConflict) {
        optionsRef.current.onConflict(event.operationId, event.conflicts);
        // Handle the resolution...
      }
    };

    optimisticUI.on('optimisticUpdate', handleOptimisticUpdate);
    optimisticUI.on('operationConfirmed', handleOperationConfirmed);
    optimisticUI.on('rollbackCompleted', handleRollbackCompleted);
    optimisticUI.on('operationRetrying', handleOperationRetrying);
    optimisticUI.on('conflictDetected', handleConflictDetected);

    return () => {
      optimisticUI.off('optimisticUpdate', handleOptimisticUpdate);
      optimisticUI.off('operationConfirmed', handleOperationConfirmed);
      optimisticUI.off('rollbackCompleted', handleRollbackCompleted);
      optimisticUI.off('operationRetrying', handleOperationRetrying);
      optimisticUI.off('conflictDetected', handleConflictDetected);
    };
  }, [updatePendingOperations, options.entityType]);

  // Apply optimistic update
  const applyUpdate = useCallback(async <T>(
    type: 'create' | 'update' | 'delete',
    entityId: string,
    payload: T,
    executeFunction: () => Promise<unknown>
  ): Promise<string> => {
    const update: OptimisticUpdate<T> = {
      type,
      entityType: options.entityType,
      entityId,
      payload,
      maxRetries: options.maxRetries || 3,
      execute: executeFunction,
      onSuccess: (result) => {
        if (optionsRef.current.onSuccess) {
          optionsRef.current.onSuccess(lastOperationId!, result);
        }
      },
      onError: (error) => {
        if (optionsRef.current.onError) {
          optionsRef.current.onError(lastOperationId!, error);
        }
      }
    };

    const operationId = await optimisticUI.applyOptimisticUpdate(update);
    setLastOperationId(operationId);
    return operationId;
  }, [options.entityType, options.maxRetries, lastOperationId]);

  // Optimistic create
  const optimisticCreate = useCallback(async <T>(
    entityId: string,
    data: T,
    executeFunction: () => Promise<unknown>
  ): Promise<string> => {
    return applyUpdate('create', entityId, data, executeFunction);
  }, [applyUpdate]);

  // Optimistic update
  const optimisticUpdate = useCallback(async <T>(
    entityId: string,
    updates: Partial<T>,
    executeFunction: () => Promise<unknown>
  ): Promise<string> => {
    return applyUpdate('update', entityId, updates, executeFunction);
  }, [applyUpdate]);

  // Optimistic delete
  const optimisticDelete = useCallback(async (
    entityId: string,
    executeFunction: () => Promise<unknown>
  ): Promise<string> => {
    return applyUpdate('delete', entityId, { deleted: true }, executeFunction);
  }, [applyUpdate]);

  // Rollback operation
  const rollback = useCallback(async (operationId: string) => {
    await optimisticUI.rollbackOperation(operationId);
  }, []);

  // Undo last operation
  const undo = useCallback(async () => {
    if (lastOperationId) {
      await optimisticUI.undoOperation(lastOperationId);
      setLastOperationId(null);
    }
  }, [lastOperationId]);

  // Check if entity has pending operations
  const hasPendingOperations = useCallback((entityId?: string): boolean => {
    if (entityId) {
      return optimisticUI.hasPendingOperations(options.entityType, entityId);
    }
    return pendingOperations.length > 0;
  }, [options.entityType, pendingOperations]);

  // Get operation status
  const getOperationStatus = useCallback((operationId: string): OperationStatus | null => {
    const operation = pendingOperations.find(op => op.id === operationId);
    return operation?.status || null;
  }, [pendingOperations]);

  // Get pending operation for entity
  const getPendingOperation = useCallback((entityId: string): OptimisticOperation | null => {
    return pendingOperations.find(op => op.entityId === entityId) || null;
  }, [pendingOperations]);

  return {
    // State
    pendingOperations,
    isProcessing,
    lastOperationId,
    
    // Actions
    optimisticCreate,
    optimisticUpdate,
    optimisticDelete,
    rollback,
    undo,
    
    // Utilities
    hasPendingOperations,
    getOperationStatus,
    getPendingOperation,
    
    // Computed values
    pendingCount: pendingOperations.length,
    canUndo: lastOperationId !== null
  };
};

// Specialized hooks for common entities
export const useOptimisticDogs = (options?: Partial<UseOptimisticUIOptions>) => {
  return useOptimisticUI({
    entityType: 'dog',
    maxRetries: 3,
    ...options
  });
};

export const useOptimisticEntries = (options?: Partial<UseOptimisticUIOptions>) => {
  return useOptimisticUI({
    entityType: 'entry',
    maxRetries: 2,
    ...options
  });
};

export const useOptimisticScores = (options?: Partial<UseOptimisticUIOptions>) => {
  return useOptimisticUI({
    entityType: 'score',
    maxRetries: 5, // Scores are critical, retry more
    ...options
  });
};

export const useOptimisticShows = (options?: Partial<UseOptimisticUIOptions>) => {
  return useOptimisticUI({
    entityType: 'show',
    maxRetries: 3,
    ...options
  });
};

// Hook for form optimistic updates
export const useOptimisticForm = <T>(
  entityType: string,
  entityId: string,
  initialData: T,
  saveFunction: (data: T) => Promise<unknown>
) => {
  const [formData, setFormData] = useState<T>(initialData);
  const [originalData, setOriginalData] = useState<T>(initialData);
  const [isDirty, setIsDirty] = useState(false);

  const { optimisticUpdate, hasPendingOperations, undo } = useOptimisticUI({
    entityType,
    onSuccess: (operationId, result) => {
      console.log('Form save success:', operationId, result);
      setOriginalData(formData);
      setIsDirty(false);
    },
    onRollback: (operationId) => {
      console.log('Form rollback:', operationId);
      setFormData(originalData);
      setIsDirty(false);
    }
  });

  const updateField = useCallback((field: keyof T, value: T[keyof T]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  const updateFields = useCallback((updates: Partial<T>) => {
    setFormData(prev => ({ ...prev, ...updates }));
    setIsDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!isDirty) return;
    
    const operationId = await optimisticUpdate(
      entityId,
      formData as Partial<T>,
      () => saveFunction(formData)
    );
    
    return operationId;
  }, [isDirty, entityId, formData, optimisticUpdate, saveFunction]);

  const reset = useCallback(() => {
    setFormData(originalData);
    setIsDirty(false);
  }, [originalData]);

  const revert = useCallback(async () => {
    await undo();
    reset();
  }, [undo, reset]);

  return {
    formData,
    isDirty,
    isProcessing: hasPendingOperations(entityId),
    updateField,
    updateFields,
    save,
    reset,
    revert
  };
};