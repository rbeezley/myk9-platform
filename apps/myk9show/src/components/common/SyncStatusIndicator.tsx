/**
 * Sync Status Indicator
 * Shows background sync status with visual feedback
 */

import { useState, useEffect } from 'react';
import { Wifi, WifiOff, CloudOff, AlertCircle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBackgroundSync } from '@/hooks/useBackgroundSync';

interface SyncStatusIndicatorProps {
  className?: string;
  showDetails?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function SyncStatusIndicator({
  className,
  showDetails = false,
  size = 'md',
}: SyncStatusIndicatorProps) {
  const { isOnline, isSyncing, queueSize, lastSyncAt, error, networkState, forceSyncNow } =
    useBackgroundSync();

  // Track current time for relative time display
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const getSyncColor = () => {
    if (error) return 'text-red-500';
    if (isSyncing) return 'text-blue-500';
    if (!isOnline) return 'text-orange-500';
    if (queueSize > 0) return 'text-amber-500';
    return 'text-teal-500';
  };

  const getSyncMessage = () => {
    if (error) return `Sync error: ${error}`;
    if (isSyncing) return 'Syncing...';
    if (!isOnline) return 'Offline';
    if (queueSize > 0) return `${queueSize} pending`;
    return 'Up to date';
  };

  const getNetworkColor = () => {
    if (!isOnline) return 'text-red-500';
    if (networkState.quality === 'excellent') return 'text-teal-500';
    if (networkState.quality === 'good') return 'text-blue-500';
    return 'text-amber-500';
  };

  const iconSize = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }[size];

  const textSize = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }[size];

  // Render the appropriate sync icon based on state
  const renderSyncIcon = () => {
    const iconClasses = cn(iconSize, getSyncColor(), isSyncing && 'animate-spin');
    if (error) return <AlertCircle className={iconClasses} />;
    if (isSyncing) return <RefreshCw className={iconClasses} />;
    if (!isOnline) return <CloudOff className={iconClasses} />;
    if (queueSize > 0) return <Clock className={iconClasses} />;
    return <CheckCircle className={iconClasses} />;
  };

  // Render the appropriate network icon based on state
  const renderNetworkIcon = () => {
    const iconClasses = cn(iconSize, getNetworkColor());
    if (!isOnline) return <WifiOff className={iconClasses} />;
    return <Wifi className={iconClasses} />;
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Network Status */}
      <div className="flex items-center gap-1">
        {renderNetworkIcon()}
        {showDetails && (
          <span className={cn(textSize, 'text-muted-foreground')}>
            {isOnline ? networkState.quality : 'offline'}
          </span>
        )}
      </div>

      {/* Sync Status */}
      <div
        className="flex items-center gap-1 cursor-pointer"
        onClick={forceSyncNow}
        title={getSyncMessage()}
      >
        {renderSyncIcon()}
        {showDetails && <span className={cn(textSize, getSyncColor())}>{getSyncMessage()}</span>}
      </div>

      {/* Detailed Status */}
      {showDetails && (
        <div className={cn(textSize, 'text-muted-foreground')}>
          {lastSyncAt && (
            <span>
              Last:{' '}
              {new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
                -Math.floor((now - lastSyncAt.getTime()) / 60000),
                'minute'
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// Compact status badge for headers/toolbars
export function SyncStatusBadge({ className }: { className?: string }) {
  const { isOnline, isSyncing, queueSize, error } = useBackgroundSync();

  const getBadgeColor = () => {
    if (error) return 'bg-red-100 text-red-800 border-red-200';
    if (!isOnline) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (isSyncing) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (queueSize > 0) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-teal-100 text-teal-800 border-teal-200';
  };

  const getBadgeText = () => {
    if (error) return 'Error';
    if (!isOnline) return 'Offline';
    if (isSyncing) return 'Syncing';
    if (queueSize > 0) return `${queueSize}`;
    return 'Synced';
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        getBadgeColor(),
        className
      )}
    >
      {getBadgeText()}
    </span>
  );
}

// Detailed sync status panel
export function SyncStatusPanel({ className }: { className?: string }) {
  const {
    isOnline,
    isSyncing,
    queueSize,
    lastSyncAt,
    error,
    metrics,
    networkState,
    forceSyncNow,
    clearError,
  } = useBackgroundSync();

  // Track current time for relative time display
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={cn('p-4 bg-card border rounded-lg space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Sync Status</h3>
        <SyncStatusBadge />
      </div>

      {/* Current Status */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Connection:</span>
          <div className="flex items-center gap-1 mt-1">
            {isOnline ? (
              <>
                <Wifi className="w-4 h-4 text-teal-500" /> Online
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-500" /> Offline
              </>
            )}
          </div>
        </div>

        <div>
          <span className="text-muted-foreground">Queue:</span>
          <div className="mt-1">{queueSize > 0 ? `${queueSize} pending` : 'Empty'}</div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-700">{error}</p>
              <button onClick={clearError} className="text-xs text-red-600 hover:text-red-800 mt-1">
                Clear error
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Statistics</h4>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>Success Rate: {(metrics.syncSuccessRate * 100).toFixed(1)}%</div>
          <div>Avg Sync Time: {(metrics.averageSyncTime / 1000).toFixed(1)}s</div>
          <div>Network: {networkState.quality}</div>
          <div>
            Last Sync:{' '}
            {lastSyncAt
              ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(
                  -Math.floor((now - lastSyncAt.getTime()) / 60000),
                  'minute'
                )
              : 'Never'}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={forceSyncNow}
          disabled={isSyncing}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', isSyncing && 'animate-spin')} />
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
    </div>
  );
}
