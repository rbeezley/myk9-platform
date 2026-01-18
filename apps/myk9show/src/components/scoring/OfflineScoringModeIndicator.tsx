/**
 * Offline Scoring Mode Indicator Component
 * 
 * Visual indicator for offline scoring mode with connection status,
 * queued actions, and offline capabilities. Provides clear feedback
 * about scoring state and data synchronization.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// UI Components
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

// Icons
import { logger } from '@/services/LoggingService';
import {
  WifiOff, 
  Wifi, 
 
  CloudOff, 
  Database, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Signal,
  Zap
} from 'lucide-react';

// Hooks and Services
import { useOfflineScoringStore } from '@/store/offlineScoringStore';
import { offlineScoringService } from '@/services/scoring/OfflineScoringService';

// Types
// import type { SyncQueueItem } from '@/services/sync/types';

export interface OfflineScoringModeIndicatorProps {
  showDetailedStatus?: boolean;
  showSyncQueue?: boolean;
  onRetrySync?: () => void;
  className?: string;
}

interface ConnectionStatus {
  isOnline: boolean;
  connectionType: 'offline' | 'slow' | 'fast';
  lastOnlineTime?: Date | undefined;
  estimatedBandwidth?: number | undefined;
}

interface OfflineCapabilities {
  canScore: boolean;
  canCalculatePlacements: boolean;
  canExportResults: boolean;
  storageUsed: number;
  storageAvailable: number;
}

/**
 * Offline scoring mode indicator with comprehensive status
 */
export function OfflineScoringModeIndicator({
  showDetailedStatus = true,
  showSyncQueue = true,
  onRetrySync,
  className
}: OfflineScoringModeIndicatorProps) {
  // Store hooks
  const { 
    // isOffline, 
    syncQueue, 
    getPendingSyncItems,
    setOfflineMode
  } = useOfflineScoringStore();

  // Local state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isOnline: navigator.onLine,
    connectionType: navigator.onLine ? 'fast' : 'offline'
  });
  const [offlineCapabilities, setOfflineCapabilities] = useState<OfflineCapabilities>({
    canScore: true,
    canCalculatePlacements: true,
    canExportResults: true,
    storageUsed: 0,
    storageAvailable: 100
  });
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [lastSyncAttempt, setLastSyncAttempt] = useState<Date | null>(null);

  // Monitor connection status
  useEffect(() => {
    const updateConnectionStatus = () => {
      const isOnline = navigator.onLine;
      const connection = 'connection' in navigator ? (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number } }).connection : undefined;
      
      let connectionType: 'offline' | 'slow' | 'fast' = 'offline';
      if (isOnline) {
        if (connection) {
          const { effectiveType, downlink } = connection;
          if (effectiveType === '4g' || (downlink && downlink > 2)) {
            connectionType = 'fast';
          } else {
            connectionType = 'slow';
          }
        } else {
          connectionType = 'fast'; // Assume fast if no connection API
        }
      }

      setConnectionStatus(prev => ({
        isOnline,
        connectionType,
        lastOnlineTime: isOnline ? new Date() : prev.lastOnlineTime,
        estimatedBandwidth: connection?.downlink
      }));

      // Update store state
      setOfflineMode(!isOnline);
    };

    updateConnectionStatus();

    // Listen for connection changes
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);

    // Monitor connection quality periodically
    const connectionMonitor = setInterval(updateConnectionStatus, 10000);

    return () => {
      window.removeEventListener('online', updateConnectionStatus);
      window.removeEventListener('offline', updateConnectionStatus);
      clearInterval(connectionMonitor);
    };
  }, [setOfflineMode]);

  // Monitor storage usage
  useEffect(() => {
    const updateStorageInfo = async () => {
      try {
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          const estimate = await navigator.storage.estimate();
          const usedMB = ((estimate.usage || 0) / (1024 * 1024));
          const availableMB = ((estimate.quota || 0) / (1024 * 1024));
          
          setOfflineCapabilities(prev => ({
            ...prev,
            storageUsed: usedMB,
            storageAvailable: availableMB
          }));
        }
      } catch (error) {
        logger.warn('Could not estimate storage:', 'scoring', {}, error as Error);
      }
    };

    updateStorageInfo();
    const storageMonitor = setInterval(updateStorageInfo, 30000);

    return () => clearInterval(storageMonitor);
  }, []);

  // Get pending sync items
  const pendingItems = getPendingSyncItems();
  const failedItems = syncQueue.filter(item => (item as { status?: string }).status === 'failed');

  // Handle sync retry
  const handleSyncRetry = useCallback(async () => {
    if (!connectionStatus.isOnline) return;

    setSyncInProgress(true);
    setLastSyncAttempt(new Date());

    try {
      await offlineScoringService.forceSyncAll();
      onRetrySync?.();
    } catch (error) {
      logger.error('Sync retry failed:', 'scoring', {}, error as Error);
    } finally {
      setSyncInProgress(false);
    }
  }, [connectionStatus.isOnline, onRetrySync]);

  // Get connection icon and styling
  const getConnectionDisplay = () => {
    if (!connectionStatus.isOnline) {
      return {
        icon: <WifiOff className="h-4 w-4" />,
        label: 'Offline',
        color: 'text-error-red',
        bgColor: 'bg-error-red/10 border-error-red/20'
      };
    }

    if (connectionStatus.connectionType === 'slow') {
      return {
        icon: <Signal className="h-4 w-4" />,
        label: 'Slow Connection',
        color: 'text-warning-orange',
        bgColor: 'bg-warning-orange/10 border-warning-orange/20'
      };
    }

    return {
      icon: <Wifi className="h-4 w-4" />,
      label: 'Online',
      color: 'text-success-green',
      bgColor: 'bg-success-green/10 border-success-green/20'
    };
  };

  const connectionDisplay = getConnectionDisplay();

  // Storage usage percentage
  const storageUsagePercent = offlineCapabilities.storageAvailable > 0 
    ? (offlineCapabilities.storageUsed / offlineCapabilities.storageAvailable) * 100 
    : 0;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Main status indicator */}
      <Card className="bg-card/95 backdrop-blur-sm border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge 
                variant="outline" 
                className={cn(
                  "flex items-center gap-2 text-xs",
                  connectionDisplay.bgColor,
                  connectionDisplay.color
                )}
              >
                {connectionDisplay.icon}
                {connectionDisplay.label}
              </Badge>

              {!connectionStatus.isOnline && (
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">
                    Scoring Offline
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Sync queue indicator */}
              {pendingItems.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {pendingItems.length} queued
                </Badge>
              )}

              {/* Failed items indicator */}
              {failedItems.length > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {failedItems.length} failed
                </Badge>
              )}

              {/* Sync button */}
              {(pendingItems.length > 0 || failedItems.length > 0) && connectionStatus.isOnline && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSyncRetry}
                  disabled={syncInProgress}
                  className="h-8 px-2"
                >
                  <RefreshCw className={cn(
                    "h-3 w-3",
                    syncInProgress && "animate-spin"
                  )} />
                  <span className="ml-1 text-xs">Sync</span>
                </Button>
              )}
            </div>
          </div>

          {/* Detailed status */}
          {showDetailedStatus && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4 space-y-3"
            >
              <Separator />

              <div className="grid grid-cols-2 gap-4">
                {/* Connection details */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">Connection</h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {connectionStatus.isOnline ? (
                      <>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-success-green" />
                          <span>Connected</span>
                        </div>
                        {connectionStatus.estimatedBandwidth && (
                          <div>Speed: {connectionStatus.estimatedBandwidth.toFixed(1)} Mbps</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <CloudOff className="h-3 w-3 text-error-red" />
                          <span>Disconnected</span>
                        </div>
                        {connectionStatus.lastOnlineTime && (
                          <div>
                            Last online: {connectionStatus.lastOnlineTime.toLocaleTimeString()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Offline capabilities */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">Offline Mode</h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3 w-3 text-success-green" />
                      <span>Scoring enabled</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="h-3 w-3 text-success-green" />
                      <span>Local storage active</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-success-green" />
                      <span>Placements calculated</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Storage usage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Storage Usage</span>
                  <span className="text-xs text-muted-foreground">
                    {offlineCapabilities.storageUsed.toFixed(1)} / {offlineCapabilities.storageAvailable.toFixed(0)} MB
                  </span>
                </div>
                <Progress 
                  value={storageUsagePercent} 
                  className="h-2"
                  // Add warning color if storage is getting full
                  style={{
                    '--progress-background': storageUsagePercent > 80 ? 'hsl(var(--warning))' : 'hsl(var(--primary))'
                  } as React.CSSProperties}
                />
                {storageUsagePercent > 80 && (
                  <div className="flex items-center gap-1 text-xs text-warning-orange">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Storage space is getting low</span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Sync queue details */}
      {showSyncQueue && (pendingItems.length > 0 || failedItems.length > 0) && (
        <Card className="bg-card/95 backdrop-blur-sm border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-medium">Sync Queue</h4>
            </div>

            <div className="space-y-2">
              {pendingItems.slice(0, 3).map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center justify-between p-2 rounded bg-background/50 border border-border/30"
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      (item as { status?: string }).status === 'pending' ? 'bg-warning-orange' :
                      (item as { status?: string }).status === 'failed' ? 'bg-error-red' :
                      'bg-success-green'
                    )} />
                    <span className="text-xs text-foreground">
                      {(item as { entityType?: string; operation?: string }).entityType || 'unknown'} {(item as { entityType?: string; operation?: string }).operation || 'sync'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {((item as { attempts?: number }).attempts || 0) > 0 && `${(item as { attempts?: number }).attempts || 0}/${(item as { maxAttempts?: number }).maxAttempts || 3} attempts`}
                  </div>
                </motion.div>
              ))}

              {pendingItems.length > 3 && (
                <div className="text-xs text-muted-foreground text-center">
                  +{pendingItems.length - 3} more items
                </div>
              )}
            </div>

            {!connectionStatus.isOnline && (
              <Alert className="mt-3">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Items will sync automatically when connection is restored.
                </AlertDescription>
              </Alert>
            )}

            {lastSyncAttempt && (
              <div className="text-xs text-muted-foreground text-center mt-2 pt-2 border-t border-border/30">
                Last sync attempt: {lastSyncAttempt.toLocaleTimeString()}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Offline mode benefits */}
      {!connectionStatus.isOnline && (
        <Alert className="bg-primary/5 border-primary/20">
          <Database className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            <strong>Offline Mode Active:</strong> You can continue scoring normally. 
            All data is saved locally and will sync when connection is restored.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default OfflineScoringModeIndicator;