/**
 * GlobalSyncStatusBar - Always-visible sync status component for app header
 * 
 * Provides real-time sync status information including:
 * - Current sync status with visual indicators
 * - Queue size and active operations
 * - Network connectivity status
 * - Quick access to sync management
 * - Sync progress for active operations
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSyncStore } from '@/store/syncStore';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  WifiOff,
  CloudOff,
  Cloud,
  AlertCircle,
  CheckCircle,
  Loader2,
  Settings,
  Eye,
  RefreshCw,
  Pause,
  Play
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GlobalSyncStatusBarProps {
  className?: string;
  compact?: boolean;
  showDetails?: boolean;
}

interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete' | 'sync';
  entityType: string;
  entityId: string;
  progress: number;
  status: 'processing' | 'completed' | 'failed';
  startTime: Date;
  estimatedCompletion?: Date;
}

export function GlobalSyncStatusBar({ 
  className, 
  compact = false, 
  showDetails = true 
}: GlobalSyncStatusBarProps) {
  const navigate = useNavigate();
  const { 
    status: syncStatus, 
    queueSize, 
    isOnline,
    lastSyncAt: lastSyncTime,
    conflictCount
  } = useGlobalSyncStatus();
  
  const {
    isSyncing,
    pauseAllSync,
    resumeAllSync,
    forceFullSync,
    failedOperations
  } = useSyncStore();

  const [showProgress, setShowProgress] = useState(false);
  const [activeOperations, setActiveOperations] = useState<SyncOperation[]>([]);

  // Mock active operations for demonstration
  useEffect(() => {
    if (syncStatus === 'pending') {
      const operations: SyncOperation[] = [
        {
          id: '1',
          type: 'sync',
          entityType: 'entries',
          entityId: 'batch-1',
          progress: 65,
          status: 'processing',
          startTime: new Date(Date.now() - 30000),
          estimatedCompletion: new Date(Date.now() + 15000)
        }
      ];
      setActiveOperations(operations);
      setShowProgress(true);
    } else {
      setActiveOperations([]);
      setShowProgress(false);
    }
  }, [syncStatus]);

  // Get status icon and color
  const getStatusIcon = () => {
    if (!isOnline) {
      return <WifiOff className="h-4 w-4 text-gray-500" />;
    }

    switch (syncStatus) {
      case 'synced':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'pending':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'conflict':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'offline':
        return <CloudOff className="h-4 w-4 text-gray-500" />;
      default:
        return <Cloud className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    
    switch (syncStatus) {
      case 'synced':
        return 'Synced';
      case 'pending':
        return 'Syncing...';
      case 'error':
        return 'Sync Error';
      case 'conflict':
        return 'Conflicts';
      case 'offline':
        return 'Offline Mode';
      default:
        return 'Unknown';
    }
  };

  const getStatusColor = () => {
    if (!isOnline) return 'text-gray-500';
    
    switch (syncStatus) {
      case 'synced':
        return 'text-green-600';
      case 'pending':
        return 'text-blue-600';
      case 'error':
        return 'text-red-600';
      case 'conflict':
        return 'text-orange-600';
      case 'offline':
        return 'text-gray-600';
      default:
        return 'text-gray-500';
    }
  };

  const formatLastSync = () => {
    if (!lastSyncTime) return 'Never';
    
    const now = new Date();
    const diff = now.getTime() - lastSyncTime.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const handleSyncAction = (action: string) => {
    switch (action) {
      case 'toggle':
        if (isSyncing) {
          pauseAllSync();
        } else {
          resumeAllSync();
        }
        break;
      case 'retry':
        forceFullSync();
        break;
      case 'pause':
        pauseAllSync();
        break;
      case 'resume':
        resumeAllSync();
        break;
      case 'settings':
        navigate('/settings/sync');
        break;
      case 'details':
        navigate('/admin/sync');
        break;
      default:
        break;
    }
  };

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className={cn("h-8 w-8 p-0", className)}>
              {getStatusIcon()}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-sm">
              <div className="font-medium">{getStatusText()}</div>
              <div className="text-muted-foreground">Last sync: {formatLastSync()}</div>
              {queueSize > 0 && (
                <div className="text-muted-foreground">{queueSize} pending</div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Status Indicator */}
      <div className="flex items-center gap-2">
        {getStatusIcon()}
        
        {showDetails && (
          <div className="flex items-center gap-1">
            <span className={cn("text-sm font-medium", getStatusColor())}>
              {getStatusText()}
            </span>
            
            {/* Queue Badge */}
            {queueSize > 0 && (
              <Badge variant="secondary" className="text-xs">
                {queueSize}
              </Badge>
            )}
            
            {/* Conflict Badge */}
            {conflictCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {conflictCount} conflicts
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Progress Indicator */}
      {showProgress && activeOperations.length > 0 && (
        <div className="flex items-center gap-2 min-w-24">
          <Progress 
            value={activeOperations[0].progress} 
            className="w-16 h-2" 
          />
          <span className="text-xs text-muted-foreground">
            {activeOperations[0].progress}%
          </span>
        </div>
      )}

      {/* Network Status */}
      {!isOnline && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <WifiOff className="h-4 w-4 text-red-500" />
            </TooltipTrigger>
            <TooltipContent>
              <p>No network connection</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Actions Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {/* Sync Controls */}
          <DropdownMenuItem onClick={() => handleSyncAction('toggle')}>
            {isSyncing ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause Sync
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Resume Sync
              </>
            )}
          </DropdownMenuItem>
          
          <DropdownMenuItem 
            onClick={() => handleSyncAction('retry')}
            disabled={failedOperations.length === 0}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry Failed ({failedOperations.length})
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {/* Navigation */}
          <DropdownMenuItem onClick={() => handleSyncAction('details')}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          
          <DropdownMenuItem onClick={() => handleSyncAction('settings')}>
            <Settings className="mr-2 h-4 w-4" />
            Sync Settings
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {/* Status Info */}
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Last sync: {formatLastSync()}
          </div>
          
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Network: {isOnline ? 'Connected' : 'Offline'}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default GlobalSyncStatusBar;