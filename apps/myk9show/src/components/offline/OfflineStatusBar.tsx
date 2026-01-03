import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '../ui/button';
import { OfflineModeBanner } from './OfflineModeBanner';
import { ConnectionQualityMeter } from './ConnectionQualityMeter';
import { DataFreshnessBadge } from './DataFreshnessBadge';
import { SyncProgressIndicator, SyncStatus } from './SyncProgressIndicator';
import { DataManagementPanel } from './DataManagementPanel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';

interface OfflineStatusBarProps {
  className?: string;
}

export const OfflineStatusBar: React.FC<OfflineStatusBarProps> = ({
  className = ''
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<Date | undefined>(
    new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
  );
  const [pendingChanges, setPendingChanges] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isActive: false,
    stage: 'complete',
    progress: 100,
    message: 'All data synchronized',
    itemsProcessed: 0,
    totalItems: 0
  });
  const [dataManagementOpen, setDataManagementOpen] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Simulate sync activity
  const handleRetrySync = () => {
    setSyncStatus({
      isActive: true,
      stage: 'uploading',
      progress: 0,
      message: 'Starting synchronization...',
      itemsProcessed: 0,
      totalItems: pendingChanges || 10
    });

    // Simulate sync progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        setSyncStatus({
          isActive: false,
          stage: 'complete',
          progress: 100,
          message: 'Synchronization complete',
          itemsProcessed: pendingChanges || 10,
          totalItems: pendingChanges || 10
        });
        
        setLastSyncTime(new Date());
        setPendingChanges(0);
      } else {
        setSyncStatus(prev => ({
          ...prev,
          progress,
          message: progress < 50 ? 'Uploading changes...' : 'Downloading updates...',
          itemsProcessed: Math.floor((progress / 100) * (pendingChanges || 10))
        }));
      }
    }, 500);
  };

  return (
    <div className={`border-t bg-card/50 backdrop-blur-sm ${className}`}>
      {/* Offline Banner */}
      <OfflineModeBanner
        isOnline={isOnline}
        lastSyncTime={lastSyncTime}
        pendingChanges={pendingChanges}
        onRetrySync={handleRetrySync}
        isSyncing={syncStatus.isActive}
      />
      
      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 text-sm">
        <div className="flex items-center gap-4">
          {/* Connection Quality */}
          <ConnectionQualityMeter showDetails={true} />
          
          {/* Data Freshness */}
          <DataFreshnessBadge
            lastUpdated={lastSyncTime}
            isOnline={isOnline}
            showLabel={true}
          />
          
          {/* Pending Changes Counter */}
          {pendingChanges > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <div className="w-2 h-2 bg-warning-orange rounded-full animate-pulse" />
              {pendingChanges} pending changes
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Sync Progress */}
          {syncStatus.isActive && (
            <div className="w-48">
              <SyncProgressIndicator
                syncStatus={syncStatus}
                showDetails={false}
              />
            </div>
          )}
          
          {/* Data Management */}
          <Dialog open={dataManagementOpen} onOpenChange={setDataManagementOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1">
                <Settings className="h-3 w-3" />
                Data
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Data Management</DialogTitle>
                <DialogDescription>
                  Manage your application data, create backups, and generate reports.
                </DialogDescription>
              </DialogHeader>
              <DataManagementPanel />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      
      {/* Detailed Sync Progress */}
      {syncStatus.isActive && (
        <div className="px-4 pb-2">
          <SyncProgressIndicator
            syncStatus={syncStatus}
            showDetails={true}
            className="max-w-md"
          />
        </div>
      )}
    </div>
  );
};