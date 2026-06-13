import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { OptimisticOperation, ProgressOverlayProps } from '@/types/optimistic-types';

export const ProgressOverlay: React.FC<ProgressOverlayProps> = ({
  operations = [],
  showDetails = false,
  allowCancel = false,
  onCancel,
}) => {
  const [expanded, setExpanded] = useState(showDetails);
  const [visible, setVisible] = useState(operations.length > 0);

  useEffect(() => {
    setVisible(operations.length > 0);
  }, [operations]);

  const getStatusIcon = (status: string, className = 'w-4 h-4') => {
    switch (status) {
      case 'pending':
        return <Loader2 className={cn(className, 'animate-spin text-blue-500')} />;
      case 'retrying':
        return <Clock className={cn(className, 'text-orange-500')} />;
      case 'confirmed':
        return <CheckCircle className={cn(className, 'text-teal-500')} />;
      case 'failed':
      case 'rolled_back':
        return <XCircle className={cn(className, 'text-red-500')} />;
      case 'rolling_back':
        return <AlertTriangle className={cn(className, 'text-amber-500 animate-pulse')} />;
      default:
        return <Loader2 className={cn(className, 'animate-spin text-gray-500')} />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
      retrying: 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400',
      confirmed: 'bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400',
      failed: 'bg-destructive/10 text-destructive ',
      rolled_back: 'bg-destructive/10 text-destructive ',
      rolling_back: 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
    };

    return (
      <Badge
        className={cn('text-xs', variants[status as keyof typeof variants] || variants.pending)}
      >
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getOperationDescription = (operation: OptimisticOperation) => {
    const { type, entityType, payload } = operation;

    // Type guard for payload with name property
    const hasName = payload && typeof payload === 'object' && 'name' in payload;
    const name = hasName ? (payload as { name: string }).name : undefined;

    switch (type) {
      case 'create':
        return `Creating ${entityType}${name ? `: ${name}` : ''}`;
      case 'update':
        return `Updating ${entityType}${name ? `: ${name}` : ''}`;
      case 'delete':
        return `Deleting ${entityType}`;
      case 'batch':
        return `Batch operation on ${entityType}`;
      default:
        return `Processing ${entityType}`;
    }
  };

  const calculateProgress = () => {
    if (operations.length === 0) return 100;

    const completed = operations.filter(
      op => op.status === 'confirmed' || op.status === 'failed' || op.status === 'rolled_back'
    ).length;

    return Math.round((completed / operations.length) * 100);
  };

  const getOverallStatus = () => {
    if (operations.length === 0) return 'completed';

    const hasRetrying = operations.some(op => op.status === 'retrying');
    const hasPending = operations.some(op => op.status === 'pending');
    const hasFailed = operations.some(op => op.status === 'failed' || op.status === 'rolled_back');
    const hasRollingBack = operations.some(op => op.status === 'rolling_back');

    if (hasRollingBack) return 'rolling_back';
    if (hasFailed) return 'failed';
    if (hasRetrying) return 'retrying';
    if (hasPending) return 'pending';

    return 'completed';
  };

  const handleCancel = (operationId: string) => {
    if (onCancel) {
      onCancel(operationId);
    }
  };

  if (!visible) return null;

  const progress = calculateProgress();
  const overallStatus = getOverallStatus();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed bottom-6 right-6 z-50 w-80 max-w-[calc(100vw-3rem)]"
      >
        <Card className="bg-card/95 backdrop-blur-xl border-border/50 shadow-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {getStatusIcon(overallStatus)}
                Processing Operations
              </CardTitle>

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {operations.length}
                </Badge>

                {operations.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(!expanded)}
                    className="h-6 w-6 p-0"
                  >
                    {expanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisible(false)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {progress === 100 ? 'All operations completed' : `${progress}% complete`}
              </p>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            <AnimatePresence>
              {expanded && operations.length > 1 ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2 max-h-60 overflow-y-auto"
                >
                  {operations.map(operation => (
                    <motion.div
                      key={operation.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.05 }}
                      className="flex items-center justify-between p-2 bg-muted/30 rounded-lg"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {getStatusIcon(operation.status, 'w-3 h-3')}
                        <span className="text-xs text-foreground truncate">
                          {getOperationDescription(operation)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {getStatusBadge(operation.status)}

                        {allowCancel &&
                          (operation.status === 'pending' || operation.status === 'retrying') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(operation.id)}
                              className="h-5 w-5 p-0 text-muted-foreground hover:text-red-500"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {operations.length === 1
                        ? getOperationDescription(operations[0])
                        : `${operations.length} operations in progress`}
                    </span>
                  </div>

                  {operations.length === 1 && (
                    <div className="flex items-center gap-2">
                      {getStatusBadge(operations[0].status)}

                      {allowCancel &&
                        (operations[0].status === 'pending' ||
                          operations[0].status === 'retrying') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancel(operations[0].id)}
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-red-500"
                          >
                            Cancel
                          </Button>
                        )}
                    </div>
                  )}
                </div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};

// Specialized progress overlays
export const FormSubmissionOverlay: React.FC<{
  operations: OptimisticOperation[];
  onCancel?: (operationId: string) => void;
}> = ({ operations, onCancel }) => (
  <ProgressOverlay
    operations={operations}
    showDetails={false}
    allowCancel={true}
    onCancel={onCancel}
  />
);

export const BulkOperationOverlay: React.FC<{
  operations: OptimisticOperation[];
}> = ({ operations }) => (
  <ProgressOverlay operations={operations} showDetails={true} allowCancel={false} />
);

export const FileUploadOverlay: React.FC<{
  operations: OptimisticOperation[];
  onCancel?: (operationId: string) => void;
}> = ({ operations, onCancel }) => (
  <ProgressOverlay
    operations={operations}
    showDetails={true}
    allowCancel={true}
    onCancel={onCancel}
  />
);
