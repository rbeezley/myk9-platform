/**
 * Utility functions and hooks for optimistic UI components
 */

import React, { useContext, useEffect, useState } from 'react';
import type { OptimisticUIConfig, OptimisticOperation } from '@/types/optimistic-types';

// Context type for optimistic UI
export interface OptimisticUIContextValue {
  pendingOperations: OptimisticOperation[];
  isProcessing: boolean;
  showSuccess: (message: string, options?: { showUndo?: boolean; undoAction?: () => void }) => void;
  showRollback: (operationId: string, error: Error, retryAction?: () => void) => void;
  addUndoAction: (message: string, undoAction: () => void) => void;
  config: OptimisticUIConfig;
}

// Default configuration for optimistic UI
export const defaultOptimisticConfig: OptimisticUIConfig = {
  defaultRetries: 3,
  rollbackDelay: 1000,
  confirmationTimeout: 5000,
  enableUndo: true,
  showProgressIndicators: true
};

// Context for optimistic UI - moved from OptimisticProvider.tsx
export const OptimisticUIContext = React.createContext<OptimisticUIContextValue | null>(null);

// Hook for accessing optimistic UI context
export const useOptimisticUIContext = () => {
  const context = useContext(OptimisticUIContext);
  if (!context) {
    throw new Error('useOptimisticUIContext must be used within an OptimisticProvider');
  }
  return context;
};

// Hook for accessing optimistic notifications
export const useOptimisticNotifications = () => {
  const context = useOptimisticUIContext();
  
  return {
    showSuccess: context.showSuccess,
    showRollback: context.showRollback,
    addUndoAction: context.addUndoAction,
    isProcessing: context.isProcessing,
    pendingCount: context.pendingOperations.length
  };
};

// Hook for managing rollback notifications
export const useRollbackNotifications = () => {
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    operationId: string;
    error: unknown;
    retryAction?: (() => void) | undefined;
    timestamp: number;
  }>>([]);

  const showRollback = (
    operationId: string,
    error: unknown,
    retryAction?: () => void
  ) => {
    const id = `rollback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setNotifications(prev => [...prev, {
      id,
      operationId,
      error,
      retryAction,
      timestamp: Date.now()
    }]);
  };

  const dismissRollback = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const dismissAll = () => {
    setNotifications([]);
  };

  // Auto-dismiss old notifications
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      setNotifications(prev => 
        prev.filter(n => now - n.timestamp < 30000) // 30 seconds
      );
    }, 5000);

    return () => clearInterval(cleanup);
  }, []);

  const NotificationRenderer = () => {
    return React.createElement('div', {}, 
      notifications.map((notification, index) => 
        React.createElement('div', {
          key: notification.id,
          style: { transform: `translateY(${index * 110}px)` }
        }, 'Notification placeholder')
      )
    );
  };

  return {
    showRollback,
    dismissRollback,
    dismissAll,
    NotificationRenderer,
    count: notifications.length
  };
};

// Hook for managing success confirmations
export const useSuccessConfirmation = () => {
  const [confirmations, setConfirmations] = useState<Array<{
    id: string;
    message: string;
    showUndo: boolean;
    undoAction?: (() => void) | undefined;
  }>>([]);

  const showSuccess = (
    message: string, 
    options: { showUndo?: boolean; undoAction?: () => void } = {}
  ) => {
    const id = `success_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setConfirmations(prev => [...prev, {
      id,
      message,
      showUndo: options.showUndo || false,
      undoAction: options.undoAction
    }]);

    // Auto-remove after duration
    setTimeout(() => {
      setConfirmations(prev => prev.filter(c => c.id !== id));
    }, 5000);
  };

  const dismissConfirmation = (id: string) => {
    setConfirmations(prev => prev.filter(c => c.id !== id));
  };

  const ConfirmationRenderer = () => {
    return React.createElement('div', {}, 
      confirmations.map(confirmation => 
        React.createElement('div', {
          key: confirmation.id
        }, `Success: ${confirmation.message}`)
      )
    );
  };

  return {
    showSuccess,
    dismissConfirmation,
    ConfirmationRenderer
  };
};

// Hook for managing undo functionality
export const useUndoManager = () => {
  const [undoStack, setUndoStack] = useState<Array<{
    id: string;
    message: string;
    undoAction: () => void;
    timestamp: number;
  }>>([]);

  const addUndoAction = (message: string, undoAction: () => void) => {
    const id = `undo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setUndoStack(prev => [...prev, {
      id,
      message,
      undoAction,
      timestamp: Date.now()
    }]);

    // Auto-remove after timeout
    setTimeout(() => {
      setUndoStack(prev => prev.filter(item => item.id !== id));
    }, 8000);
  };

  const executeUndo = (id: string) => {
    const item = undoStack.find(item => item.id === id);
    if (item) {
      item.undoAction();
      setUndoStack(prev => prev.filter(item => item.id !== id));
    }
  };

  const clearUndoStack = () => {
    setUndoStack([]);
  };

  const canUndo = undoStack.length > 0;
  const lastUndoAction = undoStack[undoStack.length - 1];

  const UndoToastRenderer = () => {
    return React.createElement('div', {}, 
      undoStack.map((item, index) => 
        React.createElement('div', {
          key: item.id,
          style: { 
            transform: `translateY(${index * -60}px)`,
            zIndex: 50 + index
          }
        }, `Undo: ${item.message}`)
      )
    );
  };

  return {
    addUndoAction,
    executeUndo,
    clearUndoStack,
    canUndo,
    lastUndoAction,
    undoCount: undoStack.length,
    UndoToastRenderer
  };
};

// Global undo shortcut hook
export const useUndoShortcut = (undoAction?: () => void) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (undoAction) {
          undoAction();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undoAction]);
};

// Simple wrapper function without complex HOC logic
export const withOptimisticUI = <P extends object>(
  Component: React.ComponentType<P>
) => {
  // Return the component as-is for now to avoid circular dependency issues
  // This can be enhanced later when needed
  return Component;
};