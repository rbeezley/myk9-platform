import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  XCircle, 
  RefreshCw,
  CloudOff
} from 'lucide-react';

export type SyncStatus = 'synced' | 'pending' | 'error' | 'conflict' | 'offline';

interface SyncStatusIndicatorProps {
  /** Current sync status */
  status: SyncStatus;
  /** Entity type for context */
  entityType?: string;
  /** Entity ID for actions */
  entityId?: string;
  /** Show text label alongside icon */
  showLabel?: boolean;
  /** Compact view */
  compact?: boolean;
  /** Last sync timestamp */
  lastSyncAt?: Date;
  /** Error message if status is error */
  errorMessage?: string;
  /** Enable quick actions */
  enableActions?: boolean;
  /** Custom className */
  className?: string;
  /** Callback for retry action */
  onRetry?: () => void;
}

/**
 * SyncStatusIndicator - Reusable component showing sync status with Apple-inspired design
 * 
 * Displays sync status with appropriate colors, icons, and optional actions.
 * Supports tooltips with detailed information and quick actions.
 */
export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  status,
  entityType = 'item',
  entityId,
  showLabel = false,
  compact = false,
  lastSyncAt,
  errorMessage,
  enableActions = false,
  className = '',
  onRetry
}) => {
  // Status configuration with Apple design tokens
  const statusConfig = {
    synced: {
      icon: CheckCircle,
      label: 'Synced',
      badge: 'default' as const,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      description: 'All changes synchronized'
    },
    pending: {
      icon: Clock,
      label: 'Pending',
      badge: 'secondary' as const,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      description: 'Waiting to sync'
    },
    error: {
      icon: XCircle,
      label: 'Error',
      badge: 'destructive' as const,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      description: 'Sync failed'
    },
    conflict: {
      icon: AlertTriangle,
      label: 'Conflict',
      badge: 'destructive' as const,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      description: 'Requires manual resolution'
    },
    offline: {
      icon: CloudOff,
      label: 'Offline',
      badge: 'secondary' as const,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      description: 'No network connection'
    }
  };

  const config = statusConfig[status];
  const IconComponent = config.icon;

  // Format last sync time
  const formatLastSync = (date?: Date): string => {
    if (!date) return 'Never synced';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Tooltip content
  const tooltipContent = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <IconComponent className={`h-4 w-4 ${config.color}`} />
        <span className="font-medium">{config.label}</span>
      </div>
      <p className="text-sm text-muted-foreground">{config.description}</p>
      {lastSyncAt && (
        <p className="text-xs text-muted-foreground">
          Last sync: {formatLastSync(lastSyncAt)}
        </p>
      )}
      {errorMessage && status === 'error' && (
        <p className="text-xs text-red-600">
          Error: {errorMessage}
        </p>
      )}
      {entityType && entityId && (
        <p className="text-xs text-muted-foreground">
          {entityType}: {entityId}
        </p>
      )}
    </div>
  );

  // Compact view
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`inline-flex items-center ${className}`}>
              <IconComponent 
                className={`h-4 w-4 ${config.color}`}
                aria-label={`${entityType} sync status: ${config.label}`}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Full view with optional label and actions
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <IconComponent 
                className={`h-4 w-4 ${config.color}`}
                aria-label={`${entityType} sync status: ${config.label}`}
              />
              {showLabel && (
                <Badge 
                  variant={config.badge}
                  className={`text-xs px-2 py-1 rounded-full border 
                             ${config.bgColor} ${config.borderColor} ${config.color}`}
                >
                  {config.label}
                </Badge>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Quick Actions */}
      {enableActions && (status === 'error' || status === 'conflict') && onRetry && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRetry}
          className="h-6 w-6 p-0 hover:bg-muted/50"
          aria-label={`Retry sync for ${entityType}`}
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
};

// Convenience components for common use cases
export const ShowSyncIndicator: React.FC<Omit<SyncStatusIndicatorProps, 'entityType'>> = (props) => (
  <SyncStatusIndicator {...props} entityType="show" />
);

export const ClassSyncIndicator: React.FC<Omit<SyncStatusIndicatorProps, 'entityType'>> = (props) => (
  <SyncStatusIndicator {...props} entityType="class" />
);

export const EntrySyncIndicator: React.FC<Omit<SyncStatusIndicatorProps, 'entityType'>> = (props) => (
  <SyncStatusIndicator {...props} entityType="entry" />
);

export default SyncStatusIndicator;