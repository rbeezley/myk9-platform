/**
 * Sync Status Indicator Component
 * Phase 6.4: User Preferences & UI State
 * 
 * Real-time sync status feedback and indicators
 */


import { 
  WifiOff, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  Loader2,
  Info
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDistanceToNow } from 'date-fns';
import type { SyncState } from '@/types/user-preferences';

interface SyncStatusIndicatorProps {
  syncState: SyncState;
  compact?: boolean;
  showLabel?: boolean;
  onRetry?: () => void;
}

export function SyncStatusIndicator({ 
  syncState, 
  compact = false, 
  showLabel = true,
  onRetry 
}: SyncStatusIndicatorProps) {
  
  /**
   * Get status configuration based on sync state
   */
  const getStatusConfig = () => {
    switch (syncState.status) {
      case 'idle':
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          label: 'Synced',
          description: syncState.lastSyncAt 
            ? `Last synced ${formatDistanceToNow(syncState.lastSyncAt)} ago`
            : 'Up to date',
          variant: 'default' as const,
        };
      
      case 'syncing':
        return {
          icon: RefreshCw,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          label: 'Syncing',
          description: 'Synchronizing preferences...',
          variant: 'secondary' as const,
          animate: true,
        };
      
      case 'error':
        return {
          icon: AlertTriangle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          label: 'Sync Error',
          description: syncState.errorMessage || 'Failed to sync preferences',
          variant: 'destructive' as const,
        };
      
      case 'conflict':
        return {
          icon: AlertTriangle,
          color: 'text-orange-600',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200',
          label: 'Conflict',
          description: `${syncState.conflictCount} sync conflicts need resolution`,
          variant: 'secondary' as const,
        };
      
      default:
        return {
          icon: WifiOff,
          color: 'text-gray-500',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          label: 'Unknown',
          description: 'Sync status unknown',
          variant: 'outline' as const,
        };
    }
  };

  const config = getStatusConfig();
  const IconComponent = config.icon;

  // Compact version (just icon with tooltip)
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`
              inline-flex items-center justify-center w-6 h-6 rounded-full border
              ${config.bgColor} ${config.borderColor}
            `}>
              <IconComponent 
                className={`h-3 w-3 ${config.color} ${config.animate ? 'animate-spin' : ''}`} 
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <div className="font-medium">{config.label}</div>
              <div className="text-xs text-muted-foreground">{config.description}</div>
              {syncState.pendingChanges && (
                <div className="text-xs text-orange-600">
                  Pending changes
                </div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full version
  return (
    <div className="flex items-center gap-2">
      <div className={`
        inline-flex items-center justify-center w-8 h-8 rounded-full border
        ${config.bgColor} ${config.borderColor}
      `}>
        <IconComponent 
          className={`h-4 w-4 ${config.color} ${config.animate ? 'animate-spin' : ''}`} 
        />
      </div>
      
      {showLabel && (
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={config.variant} className="text-xs">
              {config.label}
            </Badge>
            
            {syncState.pendingChanges && (
              <Badge variant="outline" className="text-xs text-orange-600">
                <Clock className="h-3 w-3 mr-1" />
                Pending
              </Badge>
            )}
            
            {syncState.conflictCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {syncState.conflictCount} conflicts
              </Badge>
            )}
          </div>
          
          <div className="text-xs text-muted-foreground mt-0.5">
            {config.description}
          </div>
        </div>
      )}
      
      {/* Retry button for error states */}
      {syncState.status === 'error' && onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="h-6 px-2 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      )}
      
      {/* Info button for conflict states */}
      {syncState.status === 'conflict' && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <Info className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div className="max-w-xs space-y-2">
                <div className="font-medium">Sync Conflicts</div>
                <div className="text-xs">
                  Your preferences were modified on multiple devices simultaneously. 
                  Please resolve conflicts in the Devices tab.
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// Additional component for device sync status
interface DeviceSyncStatusProps {
  lastSeen: Date;
  isOnline?: boolean;
  isCurrentDevice?: boolean;
}

export function DeviceSyncStatus({ lastSeen, isOnline, isCurrentDevice }: DeviceSyncStatusProps) {
  const isRecent = new Date().getTime() - lastSeen.getTime() < 5 * 60 * 1000; // 5 minutes
  
  return (
    <div className="flex items-center gap-2">
      <div className={`
        w-2 h-2 rounded-full
        ${isCurrentDevice 
          ? 'bg-blue-500' 
          : isOnline || isRecent 
            ? 'bg-green-500' 
            : 'bg-gray-300'
        }
      `} />
      
      <span className="text-xs text-muted-foreground">
        {isCurrentDevice 
          ? 'Current device' 
          : isOnline || isRecent 
            ? 'Online' 
            : `Last seen ${formatDistanceToNow(lastSeen)} ago`
        }
      </span>
    </div>
  );
}

// Loading state component
export function SyncStatusLoader() {
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-muted border flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <div className="h-3 w-16 bg-muted rounded animate-pulse" />
        <div className="h-2 w-24 bg-muted/60 rounded animate-pulse" />
      </div>
    </div>
  );
}