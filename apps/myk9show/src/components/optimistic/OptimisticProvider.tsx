import React, { useEffect, useState } from 'react';
import { optimisticUI } from '@/services/optimistic/OptimisticUIService';
import { OptimisticOperation, OptimisticUIConfig } from '@/types/optimistic-types';
import { OptimisticUpdateIndicator } from './OptimisticUpdateIndicator';
import { ProgressOverlay } from './ProgressOverlay';
import { 
  OptimisticUIContext, 
  defaultOptimisticConfig,
  useSuccessConfirmation,
  useRollbackNotifications,
  useUndoManager,
  type OptimisticUIContextValue
} from '@/utils/optimisticUtils';

interface OptimisticProviderProps {
  children: React.ReactNode;
  config?: Partial<OptimisticUIConfig>;
  showGlobalIndicator?: boolean;
  showProgressOverlay?: boolean;
}


export const OptimisticProvider: React.FC<OptimisticProviderProps> = ({
  children,
  config = {},
  showGlobalIndicator = true,
  showProgressOverlay = true
}) => {
  const [pendingOperations, setPendingOperations] = useState<OptimisticOperation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const finalConfig = { ...defaultOptimisticConfig, ...config };

  // Initialize notification systems
  const { showSuccess, ConfirmationRenderer } = useSuccessConfirmation();
  const { showRollback, NotificationRenderer } = useRollbackNotifications();
  const { addUndoAction, UndoToastRenderer } = useUndoManager();

  // Update pending operations
  useEffect(() => {
    const updateOperations = () => {
      const pending = optimisticUI.getPendingOperations();
      setPendingOperations(pending);
      setIsProcessing(pending.length > 0);
    };

    // Initial update
    updateOperations();

    // Event listeners
    const handleOptimisticUpdate = () => updateOperations();
    const handleOperationConfirmed = (event: { operationId: string; result: unknown }) => {
      updateOperations();
      
      if (finalConfig.enableUndo) {
        // Add undo option for confirmed operations
        addUndoAction(
          'Operation completed',
          () => optimisticUI.undoOperation(event.operationId)
        );
      }
    };
    
    const handleRollbackStarted = (event: { operationId: string; error: unknown }) => {
      updateOperations();
      showRollback(event.operationId, event.error);
    };
    
    const handleRollbackCompleted = () => updateOperations();
    const handleOperationRetrying = () => updateOperations();

    optimisticUI.on('optimisticUpdate', handleOptimisticUpdate);
    optimisticUI.on('operationConfirmed', handleOperationConfirmed);
    optimisticUI.on('rollbackStarted', handleRollbackStarted);
    optimisticUI.on('rollbackCompleted', handleRollbackCompleted);
    optimisticUI.on('operationRetrying', handleOperationRetrying);

    return () => {
      optimisticUI.off('optimisticUpdate', handleOptimisticUpdate);
      optimisticUI.off('operationConfirmed', handleOperationConfirmed);
      optimisticUI.off('rollbackStarted', handleRollbackStarted);
      optimisticUI.off('rollbackCompleted', handleRollbackCompleted);
      optimisticUI.off('operationRetrying', handleOperationRetrying);
    };
  }, [finalConfig.enableUndo, addUndoAction, showRollback]);

  // Context value
  const contextValue: OptimisticUIContextValue = {
    pendingOperations,
    isProcessing,
    showSuccess,
    showRollback,
    addUndoAction,
    config: finalConfig
  };

  return (
    <OptimisticUIContext.Provider value={contextValue}>
      {children}
      
      {/* Global UI components */}
      {finalConfig.showProgressIndicators && (
        <>
          {showGlobalIndicator && (
            <OptimisticUpdateIndicator
              showCount={true}
              position="top-right"
            />
          )}
          
          {showProgressOverlay && pendingOperations.length > 3 && (
            <ProgressOverlay
              operations={pendingOperations}
              showDetails={true}
              allowCancel={true}
              onCancel={(operationId) => optimisticUI.rollbackOperation(operationId)}
            />
          )}
        </>
      )}
      
      {/* Notification renderers */}
      <ConfirmationRenderer />
      <NotificationRenderer />
      {finalConfig.enableUndo && <UndoToastRenderer />}
    </OptimisticUIContext.Provider>
  );
};