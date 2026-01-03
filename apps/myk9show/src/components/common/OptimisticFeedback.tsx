import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Undo2, 
  Clock,
  AlertTriangle,
  X
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface OptimisticFeedbackProps {
  isLoading?: boolean;
  hasOptimisticChanges?: boolean;
  pendingUpdatesCount?: number;
  error?: string | null;
  onRollback?: () => void;
  onRetry?: () => void;
  onDismissError?: () => void;
  className?: string;
  variant?: 'inline' | 'floating' | 'banner';
  position?: 'top' | 'bottom' | 'top-right' | 'bottom-right';
}

/**
 * Component that provides visual feedback for optimistic updates
 */
export function OptimisticFeedback({
  isLoading = false,
  hasOptimisticChanges = false,
  pendingUpdatesCount = 0,
  error = null,
  onRollback,
  onRetry,
  onDismissError,
  className,
  variant = 'inline',
  position = 'top-right'
}: OptimisticFeedbackProps) {
  
  // Don't render if no relevant state
  if (!isLoading && !hasOptimisticChanges && !error) {
    return null;
  }

  const getStatusInfo = () => {
    if (error) {
      return {
        icon: <AlertCircle className="h-4 w-4 text-destructive" />,
        text: 'Changes failed to save',
        detail: error,
        color: 'destructive',
        bgColor: 'bg-destructive/10 border-destructive/20'
      };
    }
    
    if (isLoading) {
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin text-blue-600" />,
        text: 'Saving changes...',
        detail: pendingUpdatesCount > 1 ? `${pendingUpdatesCount} pending updates` : null,
        color: 'blue',
        bgColor: 'bg-blue-50 border-blue-200'
      };
    }
    
    if (hasOptimisticChanges) {
      return {
        icon: <Clock className="h-4 w-4 text-amber-600" />,
        text: 'Changes saved locally',
        detail: 'Syncing with server...',
        color: 'amber',
        bgColor: 'bg-amber-50 border-amber-200'
      };
    }
    
    return {
      icon: <CheckCircle className="h-4 w-4 text-green-600" />,
      text: 'All changes saved',
      detail: null,
      color: 'green',
      bgColor: 'bg-green-50 border-green-200'
    };
  };

  const statusInfo = getStatusInfo();

  const renderInlineVariant = () => (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-md border text-sm',
        statusInfo.bgColor,
        className
      )}
    >
      {statusInfo.icon}
      <div className="flex-1">
        <span className="font-medium">{statusInfo.text}</span>
        {statusInfo.detail && (
          <span className="text-muted-foreground ml-1">- {statusInfo.detail}</span>
        )}
      </div>
      
      {error && onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
      
      {(hasOptimisticChanges || error) && onRollback && (
        <Button size="sm" variant="outline" onClick={onRollback}>
          <Undo2 className="h-3 w-3 mr-1" />
          Undo
        </Button>
      )}
      
      {error && onDismissError && (
        <Button size="sm" variant="ghost" onClick={onDismissError}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </motion.div>
  );

  const renderFloatingVariant = () => (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: position.includes('bottom') ? 20 : -20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: position.includes('bottom') ? 20 : -20 }}
      className={cn(
        'fixed z-50 pointer-events-auto',
        position === 'top' && 'top-4 left-1/2 transform -translate-x-1/2',
        position === 'bottom' && 'bottom-4 left-1/2 transform -translate-x-1/2',
        position === 'top-right' && 'top-4 right-4',
        position === 'bottom-right' && 'bottom-4 right-4'
      )}
    >
      <Card className={cn('shadow-lg', statusInfo.bgColor)}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {statusInfo.icon}
            <div className="flex-1">
              <p className="font-medium text-sm">{statusInfo.text}</p>
              {statusInfo.detail && (
                <p className="text-xs text-muted-foreground mt-1">{statusInfo.detail}</p>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {pendingUpdatesCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {pendingUpdatesCount}
                </Badge>
              )}
              
              {error && onRetry && (
                <Button size="sm" variant="outline" onClick={onRetry}>
                  Retry
                </Button>
              )}
              
              {(hasOptimisticChanges || error) && onRollback && (
                <Button size="sm" variant="outline" onClick={onRollback}>
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}
              
              {error && onDismissError && (
                <Button size="sm" variant="ghost" onClick={onDismissError}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  const renderBannerVariant = () => (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        'border-l-4 p-4',
        error ? 'border-destructive bg-destructive/10' : 
        isLoading ? 'border-blue-500 bg-blue-50' :
        hasOptimisticChanges ? 'border-amber-500 bg-amber-50' :
        'border-green-500 bg-green-50',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {statusInfo.icon}
          <div>
            <p className="font-medium text-sm">{statusInfo.text}</p>
            {statusInfo.detail && (
              <p className="text-xs text-muted-foreground mt-1">{statusInfo.detail}</p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {pendingUpdatesCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {pendingUpdatesCount} pending
            </Badge>
          )}
          
          {error && onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          )}
          
          {(hasOptimisticChanges || error) && onRollback && (
            <Button size="sm" variant="outline" onClick={onRollback}>
              <Undo2 className="h-4 w-4 mr-1" />
              Undo All
            </Button>
          )}
          
          {onDismissError && (
            <Button size="sm" variant="ghost" onClick={onDismissError}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );

  return (
    <AnimatePresence mode="wait">
      {variant === 'inline' && renderInlineVariant()}
      {variant === 'floating' && renderFloatingVariant()}
      {variant === 'banner' && renderBannerVariant()}
    </AnimatePresence>
  );
}

/**
 * Compact status indicator for showing in headers or toolbars
 */
export function OptimisticStatusIndicator({
  isLoading,
  hasOptimisticChanges,
  pendingUpdatesCount = 0,
  error,
  className
}: Pick<OptimisticFeedbackProps, 'isLoading' | 'hasOptimisticChanges' | 'pendingUpdatesCount' | 'error' | 'className'>) {
  
  if (!isLoading && !hasOptimisticChanges && !error) {
    return (
      <div className={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}>
        <CheckCircle className="h-3 w-3 text-green-500" />
        <span>Saved</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('flex items-center gap-1 text-xs text-destructive', className)}>
        <AlertTriangle className="h-3 w-3" />
        <span>Error</span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-1 text-xs text-blue-600', className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Saving...</span>
        {pendingUpdatesCount > 1 && (
          <Badge variant="secondary" className="text-xs h-4 px-1">
            {pendingUpdatesCount}
          </Badge>
        )}
      </div>
    );
  }

  if (hasOptimisticChanges) {
    return (
      <div className={cn('flex items-center gap-1 text-xs text-amber-600', className)}>
        <Clock className="h-3 w-3" />
        <span>Syncing...</span>
      </div>
    );
  }

  return null;
}

// Hook moved to separate file to avoid Fast Refresh issues