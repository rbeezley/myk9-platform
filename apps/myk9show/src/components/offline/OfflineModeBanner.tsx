import React from 'react';
import { AlertTriangle, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

interface OfflineModeBannerProps {
  isOnline: boolean;
  lastSyncTime?: Date | undefined;
  pendingChanges?: number;
  onRetrySync?: () => void;
  isSyncing?: boolean;
}

export const OfflineModeBanner: React.FC<OfflineModeBannerProps> = ({
  isOnline,
  lastSyncTime,
  pendingChanges = 0,
  onRetrySync,
  isSyncing = false
}) => {
  if (isOnline && pendingChanges === 0) return null;

  const formatLastSync = (date?: Date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 24 * 60) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Alert className={`border-l-4 ${
      isOnline 
        ? 'border-l-warning-orange bg-warning-orange/5' 
        : 'border-l-error-red bg-error-red/5'
    }`}>
      <div className="flex items-center gap-2">
        {isOnline ? (
          <Wifi className="h-4 w-4 text-warning-orange" />
        ) : (
          <WifiOff className="h-4 w-4 text-error-red" />
        )}
        <AlertTriangle className="h-4 w-4" />
      </div>
      
      <AlertDescription className="ml-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-medium">
              {isOnline ? 'Limited Connectivity' : 'Offline Mode'}
            </span>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Last sync: {formatLastSync(lastSyncTime)}</span>
              
              {pendingChanges > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {pendingChanges} pending changes
                </Badge>
              )}
            </div>
          </div>
          
          {onRetrySync && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetrySync}
              disabled={isSyncing}
              className="h-8"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Retry'}
            </Button>
          )}
        </div>
        
        <div className="mt-2 text-sm text-muted-foreground">
          {isOnline ? (
            'Some features may be limited. Data will sync when connection improves.'
          ) : (
            'Working offline. Changes will sync when you reconnect.'
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
};