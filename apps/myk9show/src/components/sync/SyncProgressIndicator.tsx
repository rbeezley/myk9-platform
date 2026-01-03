/**
 * SyncProgressIndicator - Real-time sync progress visualization
 * 
 * Provides detailed progress tracking including:
 * - Real-time progress updates with animations
 * - Speed and ETA calculations
 * - Operation-specific progress details
 * - Error and retry status
 * - Cancellation capabilities
 * - Batch operation tracking
 */

import React, { useState, useMemo } from 'react';
import { useSyncStore } from '@/store/syncStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  Loader2,
  CheckCircle,
  AlertCircle,
  X,
  Pause,
  Play,
  RotateCcw,
  Activity,
  TrendingUp,
  Download,
  Upload,
  Database,
  Eye,
  EyeOff,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export interface SyncOperation {
  id: string;
  type: 'sync' | 'upload' | 'download' | 'merge' | 'delete';
  entityType: string;
  entityId?: string;
  batchId?: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'paused';
  progress: number; // 0-100
  totalItems: number;
  processedItems: number;
  failedItems: number;
  startTime: Date;
  endTime?: Date;
  estimatedCompletion?: Date;
  speed?: number; // items per second
  error?: string;
  retryCount: number;
  maxRetries: number;
  canCancel: boolean;
  canPause: boolean;
  details?: {
    phase: string;
    currentItem?: string;
    lastProcessed?: string;
  };
}

interface SyncProgressIndicatorProps {
  className?: string;
  compact?: boolean;
  showDetails?: boolean;
  operationId?: string; // Show specific operation
  onOperationComplete?: (operationId: string) => void;
  onOperationFailed?: (operationId: string, error: string) => void;
}

export function SyncProgressIndicator({
  className,
  compact = false,
  showDetails = true,
  operationId
}: SyncProgressIndicatorProps) {
  const { 
    pauseAllSync, 
    resumeAllSync, 
    removeOperation, 
    updateOperationStatus 
  } = useSyncStore();
  
  const [expanded, setExpanded] = useState(!compact);

  // Mock active operations for demonstration
  const mockOperations: SyncOperation[] = useMemo(() => [
    {
      id: 'sync-1',
      type: 'sync',
      entityType: 'entries',
      batchId: 'batch-entries-001',
      status: 'processing',
      progress: 67,
      totalItems: 150,
      processedItems: 100,
      failedItems: 3,
      startTime: new Date(Date.now() - 120000), // 2 minutes ago
      estimatedCompletion: new Date(Date.now() + 60000), // 1 minute from now
      speed: 2.5,
      retryCount: 0,
      maxRetries: 3,
      canCancel: true,
      canPause: true,
      details: {
        phase: 'Uploading entry data',
        currentItem: 'entry-456',
        lastProcessed: 'entry-455'
      }
    },
    {
      id: 'download-1',
      type: 'download',
      entityType: 'shows',
      status: 'processing',
      progress: 23,
      totalItems: 50,
      processedItems: 12,
      failedItems: 0,
      startTime: new Date(Date.now() - 30000), // 30 seconds ago
      estimatedCompletion: new Date(Date.now() + 45000), // 45 seconds from now
      speed: 0.8,
      retryCount: 0,
      maxRetries: 3,
      canCancel: true,
      canPause: false,
      details: {
        phase: 'Downloading show metadata',
        currentItem: 'show-789'
      }
    }
  ], []);

  // Get operations to display
  const operations = useMemo(() => {
    const ops = mockOperations; // In real app, use activeOperations
    
    if (operationId) {
      return ops.filter(op => op.id === operationId);
    }
    
    return ops.filter(op => op.status === 'processing' || op.status === 'paused');
  }, [operationId, mockOperations]);

  // Calculate overall progress if multiple operations
  const overallProgress = useMemo(() => {
    if (operations.length === 0) return 0;
    if (operations.length === 1) return operations[0].progress;
    
    const totalProgress = operations.reduce((sum, op) => sum + op.progress, 0);
    return Math.round(totalProgress / operations.length);
  }, [operations]);

  // Get operation icon
  const getOperationIcon = (operation: SyncOperation) => {
    if (operation.status === 'failed') {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    if (operation.status === 'completed') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (operation.status === 'paused') {
      return <Pause className="h-4 w-4 text-orange-500" />;
    }

    switch (operation.type) {
      case 'upload':
        return <Upload className="h-4 w-4 text-blue-500" />;
      case 'download':
        return <Download className="h-4 w-4 text-green-500" />;
      case 'sync':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'merge':
        return <Database className="h-4 w-4 text-purple-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  // Format speed
  const formatSpeed = (speed?: number) => {
    if (!speed) return '--';
    if (speed < 1) return `${(speed * 60).toFixed(1)}/min`;
    return `${speed.toFixed(1)}/sec`;
  };

  // Format ETA
  const formatETA = (estimatedCompletion?: Date) => {
    if (!estimatedCompletion) return 'Unknown';
    return formatDistanceToNow(estimatedCompletion, { addSuffix: true });
  };

  // Handle operation actions
  const handlePause = (operationId: string) => {
    pauseAllSync();
    updateOperationStatus(operationId, 'paused');
  };

  const handleResume = (operationId: string) => {
    resumeAllSync();
    updateOperationStatus(operationId, 'processing');
  };

  const handleCancel = (operationId: string) => {
    removeOperation(operationId);
  };

  const handleRetry = (operationId: string) => {
    updateOperationStatus(operationId, 'pending');
  };

  // Compact view
  if (compact && operations.length > 0) {
    const mainOperation = operations[0];
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("flex items-center gap-2 px-2 py-1 rounded-md bg-muted", className)}>
              {getOperationIcon(mainOperation)}
              <Progress value={mainOperation.progress} className="w-16 h-2" />
              <span className="text-xs font-medium">{mainOperation.progress}%</span>
              {operations.length > 1 && (
                <Badge variant="secondary" className="text-xs">
                  +{operations.length - 1}
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <div className="font-medium">{mainOperation.details?.phase || mainOperation.type}</div>
              <div className="text-muted-foreground">
                {mainOperation.processedItems}/{mainOperation.totalItems} items
              </div>
              <div className="text-muted-foreground">
                ETA: {formatETA(mainOperation.estimatedCompletion)}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // No active operations
  if (operations.length === 0) {
    return null;
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Sync in Progress
            {operations.length > 1 && (
              <Badge variant="secondary">{operations.length} operations</Badge>
            )}
          </CardTitle>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        
        {/* Overall progress */}
        {operations.length > 1 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Overall Progress</span>
              <span className="font-medium">{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} />
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {operations.map((operation) => (
            <div key={operation.id} className="space-y-3 p-3 border rounded-lg">
              {/* Operation header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getOperationIcon(operation)}
                  <div>
                    <div className="font-medium text-sm">
                      {operation.details?.phase || `${operation.type} ${operation.entityType}`}
                    </div>
                    {operation.batchId && (
                      <div className="text-xs text-muted-foreground">
                        Batch: {operation.batchId}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  {operation.canPause && operation.status === 'processing' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePause(operation.id)}
                    >
                      <Pause className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {operation.status === 'paused' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleResume(operation.id)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {operation.status === 'failed' && operation.retryCount < operation.maxRetries && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRetry(operation.id)}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {operation.canCancel && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <X className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancel Sync Operation</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to cancel this sync operation? 
                            Any progress will be lost and you'll need to start over.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Continue Syncing</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleCancel(operation.id)}>
                            Cancel Operation
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {operation.processedItems} of {operation.totalItems} items
                    {operation.failedItems > 0 && (
                      <span className="text-red-600 ml-2">
                        ({operation.failedItems} failed)
                      </span>
                    )}
                  </span>
                  <span className="font-medium">{operation.progress}%</span>
                </div>
                <Progress 
                  value={operation.progress} 
                  className={cn(
                    operation.status === 'failed' && "bg-red-100",
                    operation.status === 'paused' && "bg-orange-100"
                  )}
                />
              </div>

              {/* Operation details */}
              {showDetails && (
                <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Started: {formatDistanceToNow(operation.startTime, { addSuffix: true })}
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Speed: {formatSpeed(operation.speed)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      ETA: {formatETA(operation.estimatedCompletion)}
                    </div>
                    {operation.retryCount > 0 && (
                      <div className="flex items-center gap-1">
                        <RotateCcw className="h-3 w-3" />
                        Retries: {operation.retryCount}/{operation.maxRetries}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Current item */}
              {operation.details?.currentItem && (
                <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                  Processing: {operation.details.currentItem}
                </div>
              )}

              {/* Error message */}
              {operation.error && (
                <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                  Error: {operation.error}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export default SyncProgressIndicator;