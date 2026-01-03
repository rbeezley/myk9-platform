import React from 'react';
import { CheckCircle, AlertCircle, RefreshCw, Upload, Download } from 'lucide-react';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export interface SyncStatus {
  isActive: boolean;
  stage: 'uploading' | 'downloading' | 'processing' | 'complete' | 'error';
  progress: number;
  message: string;
  itemsProcessed?: number;
  totalItems?: number;
  estimatedTimeRemaining?: number;
  errors?: string[];
}

interface SyncProgressIndicatorProps {
  syncStatus: SyncStatus;
  className?: string;
  showDetails?: boolean;
}

export const SyncProgressIndicator: React.FC<SyncProgressIndicatorProps> = ({
  syncStatus,
  className = '',
  showDetails = true
}) => {
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const getStageIcon = () => {
    switch (syncStatus.stage) {
      case 'uploading':
        return <Upload className="h-3 w-3" />;
      case 'downloading':
        return <Download className="h-3 w-3" />;
      case 'processing':
        return <RefreshCw className="h-3 w-3 animate-spin" />;
      case 'complete':
        return <CheckCircle className="h-3 w-3 text-success-green" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-error-red" />;
      default:
        return <RefreshCw className="h-3 w-3" />;
    }
  };

  const getStageColor = () => {
    switch (syncStatus.stage) {
      case 'complete':
        return 'text-success-green';
      case 'error':
        return 'text-error-red';
      default:
        return 'text-primary';
    }
  };

  if (!syncStatus.isActive && syncStatus.stage !== 'complete' && syncStatus.stage !== 'error') {
    return null;
  }

  return (
    <TooltipProvider>
      <div className={`bg-card border border-border/50 rounded-lg p-3 ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {getStageIcon()}
            <span className={`text-sm font-medium ${getStageColor()}`}>
              {syncStatus.stage === 'uploading' && 'Uploading Changes'}
              {syncStatus.stage === 'downloading' && 'Downloading Updates'}
              {syncStatus.stage === 'processing' && 'Processing Data'}
              {syncStatus.stage === 'complete' && 'Sync Complete'}
              {syncStatus.stage === 'error' && 'Sync Error'}
            </span>
          </div>
          
          {syncStatus.stage !== 'complete' && syncStatus.stage !== 'error' && (
            <Badge variant="secondary" className="text-xs">
              {Math.round(syncStatus.progress)}%
            </Badge>
          )}
        </div>

        {syncStatus.isActive && (
          <Progress 
            value={syncStatus.progress} 
            className="mb-2"
          />
        )}

        <div className="text-xs text-muted-foreground">
          {syncStatus.message}
        </div>

        {showDetails && (
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            {syncStatus.itemsProcessed !== undefined && syncStatus.totalItems !== undefined && (
              <span>
                {syncStatus.itemsProcessed} of {syncStatus.totalItems} items
              </span>
            )}
            
            {syncStatus.estimatedTimeRemaining && syncStatus.isActive && (
              <Tooltip>
                <TooltipTrigger>
                  <span>~{formatTime(syncStatus.estimatedTimeRemaining)} remaining</span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Estimated time based on current progress</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {syncStatus.errors && syncStatus.errors.length > 0 && (
          <div className="mt-2 p-2 bg-error-red/10 border border-error-red/20 rounded text-xs">
            <div className="font-medium text-error-red mb-1">Errors:</div>
            {syncStatus.errors.map((error, index) => (
              <div key={index} className="text-error-red">• {error}</div>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};