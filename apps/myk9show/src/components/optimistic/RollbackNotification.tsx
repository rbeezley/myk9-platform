import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, X, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RollbackNotificationProps } from '@/types/optimistic-types';

export const RollbackNotification: React.FC<RollbackNotificationProps> = ({
  operationId,
  error,
  retryAction,
  dismissAction,
}) => {
  void operationId; // Suppress unused variable warning
  const [visible, setVisible] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const handleDismiss = () => {
    setVisible(false);
    if (dismissAction) {
      dismissAction();
    }
  };

  const handleRetry = () => {
    if (retryAction) {
      retryAction();
    }
    setVisible(false);
  };

  const getErrorMessage = (error: unknown) => {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error)
      return (error as { message: string }).message;
    if (error && typeof error === 'object' && 'code' in error) {
      const errorWithCode = error as { code: string };
      switch (errorWithCode.code) {
        case 'NETWORK_ERROR':
          return 'Network connection failed. Please check your internet connection.';
        case 'TIMEOUT':
          return 'The operation timed out. Please try again.';
        case 'VALIDATION_ERROR':
          return 'The data failed validation. Please check your input.';
        case 'CONFLICT':
          return 'Another user has modified this data. Your changes have been rolled back.';
        case 'INSUFFICIENT_PERMISSIONS':
          return 'You do not have permission to perform this action.';
        default:
          return `Operation failed: ${errorWithCode.code}`;
      }
    }
    return 'An unexpected error occurred. Your changes have been rolled back.';
  };

  const getErrorDetails = (
    error:
      | { status?: number; code?: string; timestamp?: string | Date; operationId?: string }
      | unknown
  ) => {
    if (!error || typeof error !== 'object') return null;

    const errorObj = error as Record<string, unknown>;
    const details = [];
    if ('status' in errorObj && errorObj.status) details.push(`Status: ${errorObj.status}`);
    if ('code' in errorObj && errorObj.code) details.push(`Code: ${errorObj.code}`);
    if ('timestamp' in errorObj && errorObj.timestamp)
      details.push(`Time: ${new Date(errorObj.timestamp as string | Date).toLocaleString()}`);
    if ('operationId' in errorObj && errorObj.operationId)
      details.push(`Operation ID: ${errorObj.operationId}`);

    return details.length > 0 ? details.join(' • ') : null;
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed top-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)]"
      >
        <Alert className="bg-card/95 backdrop-blur-xl border-destructive/30 shadow-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-destructive ">Changes Rolled Back</h4>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="h-6 w-6 p-0 hover:bg-destructive/10 "
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              <AlertDescription className="text-sm text-muted-foreground mb-3">
                {getErrorMessage(error)}
              </AlertDescription>

              {getErrorDetails(error) && (
                <div className="mb-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails(!showDetails)}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Info className="h-3 w-3 mr-1" />
                    {showDetails ? 'Hide' : 'Show'} details
                  </Button>

                  <AnimatePresence>
                    {showDetails && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-2 p-2 bg-muted/30 rounded text-xs text-muted-foreground font-mono overflow-hidden"
                      >
                        {getErrorDetails(error)}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div className="flex items-center gap-2">
                {retryAction && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRetry}
                    className="h-7 px-3 text-xs border-destructive/30 hover:bg-destructive/10 "
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </Alert>
      </motion.div>
    </AnimatePresence>
  );
};

// Specialized rollback notifications
export const NetworkErrorNotification: React.FC<{
  onRetry?: () => void;
  onDismiss?: () => void;
}> = ({ onRetry, onDismiss }) => (
  <RollbackNotification
    operationId=""
    error={{ code: 'NETWORK_ERROR', message: 'Network connection failed' }}
    retryAction={onRetry}
    dismissAction={onDismiss}
  />
);

export const ConflictNotification: React.FC<{
  conflictDetails?: string;
  onDismiss?: () => void;
}> = ({ conflictDetails, onDismiss }) => (
  <RollbackNotification
    operationId=""
    error={{
      code: 'CONFLICT',
      message: 'Data conflict detected',
      details: conflictDetails,
    }}
    dismissAction={onDismiss}
  />
);

export const ValidationErrorNotification: React.FC<{
  validationErrors: string[];
  onDismiss?: () => void;
}> = ({ validationErrors, onDismiss }) => (
  <RollbackNotification
    operationId=""
    error={{
      code: 'VALIDATION_ERROR',
      message: 'Please fix the following errors:',
      details: validationErrors.join(', '),
    }}
    dismissAction={onDismiss}
  />
);
