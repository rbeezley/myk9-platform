import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { optimisticUI } from '@/services/optimistic/OptimisticUIService';
import { OptimisticOperation, OptimisticUpdateIndicatorProps } from '@/types/optimistic-types';

export const OptimisticUpdateIndicator: React.FC<OptimisticUpdateIndicatorProps> = ({
  operationId,
  showCount = false,
  size = 'md',
  position = 'top-right'
}) => {
  const [operations, setOperations] = useState<OptimisticOperation[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateOperations = () => {
      if (operationId) {
        // Show indicator for specific operation
        const pendingOps = optimisticUI.getPendingOperations();
        const targetOp = pendingOps.find(op => op.id === operationId);
        setOperations(targetOp ? [targetOp] : []);
      } else {
        // Show indicator for all pending operations
        const pendingOps = optimisticUI.getPendingOperations();
        setOperations(pendingOps);
      }
    };

    // Initial update
    updateOperations();

    // Listen for operation events
    const handleOptimisticUpdate = () => updateOperations();
    const handleOperationConfirmed = () => updateOperations();
    const handleRollbackCompleted = () => updateOperations();

    optimisticUI.on('optimisticUpdate', handleOptimisticUpdate);
    optimisticUI.on('operationConfirmed', handleOperationConfirmed);
    optimisticUI.on('rollbackCompleted', handleRollbackCompleted);

    return () => {
      optimisticUI.off('optimisticUpdate', handleOptimisticUpdate);
      optimisticUI.off('operationConfirmed', handleOperationConfirmed);
      optimisticUI.off('rollbackCompleted', handleRollbackCompleted);
    };
  }, [operationId]);

  useEffect(() => {
    setVisible(operations.length > 0);
  }, [operations]);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4'
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Loader2 className={cn(sizeClasses[size], 'animate-spin text-blue-500')} />;
      case 'retrying':
        return <Clock className={cn(sizeClasses[size], 'text-orange-500')} />;
      case 'confirmed':
        return <CheckCircle className={cn(sizeClasses[size], 'text-green-500')} />;
      case 'failed':
      case 'rolled_back':
        return <XCircle className={cn(sizeClasses[size], 'text-red-500')} />;
      case 'rolling_back':
        return <AlertTriangle className={cn(sizeClasses[size], 'text-yellow-500 animate-pulse')} />;
      default:
        return <Loader2 className={cn(sizeClasses[size], 'animate-spin text-gray-500')} />;
    }
  };

  const getStatusMessage = (operations: OptimisticOperation[]) => {
    if (operations.length === 0) return '';
    
    if (operations.length === 1) {
      const op = operations[0];
      switch (op.status) {
        case 'pending':
          return 'Saving changes...';
        case 'retrying':
          return `Retrying... (${op.retryCount}/${op.maxRetries})`;
        case 'confirmed':
          return 'Changes saved';
        case 'rolling_back':
          return 'Rolling back changes...';
        case 'rolled_back':
          return 'Changes rolled back';
        case 'failed':
          return 'Save failed';
        default:
          return 'Processing...';
      }
    }

    const pending = operations.filter(op => op.status === 'pending').length;
    const retrying = operations.filter(op => op.status === 'retrying').length;
    
    if (pending > 0) {
      return `Saving ${pending} change${pending > 1 ? 's' : ''}...`;
    }
    if (retrying > 0) {
      return `Retrying ${retrying} operation${retrying > 1 ? 's' : ''}...`;
    }
    
    return `Processing ${operations.length} operations...`;
  };

  if (!visible && operations.length === 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            'fixed z-50 bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-lg p-3',
            positionClasses[position]
          )}
        >
          <div className="flex items-center gap-3">
            {operations.length === 1 ? (
              getStatusIcon(operations[0].status)
            ) : (
              <div className="relative">
                <Loader2 className={cn(sizeClasses[size], 'animate-spin text-blue-500')} />
                {showCount && operations.length > 1 && (
                  <div className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {operations.length}
                  </div>
                )}
              </div>
            )}
            
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {getStatusMessage(operations)}
              </p>
              {operations.length > 1 && showCount && (
                <p className="text-xs text-muted-foreground">
                  {operations.length} operations
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Specialized indicators for common scenarios
export const SaveIndicator: React.FC<{ operationId?: string }> = ({ operationId }) => (
  <OptimisticUpdateIndicator 
    operationId={operationId}
    size="sm"
    position="top-right"
  />
);

export const BulkOperationIndicator: React.FC = () => (
  <OptimisticUpdateIndicator 
    showCount={true}
    size="md"
    position="bottom-right"
  />
);

export const FormSaveIndicator: React.FC<{ operationId?: string }> = ({ operationId }) => (
  <OptimisticUpdateIndicator 
    operationId={operationId}
    size="sm"
    position="top-left"
  />
);