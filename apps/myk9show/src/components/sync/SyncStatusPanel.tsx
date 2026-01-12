import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { logger } from '@/services/LoggingService';
import {
  RefreshCw, 
  CheckCircle, 
  Clock, 
 
  XCircle,
  Wifi,
  WifiOff,
  Database,
  Calendar,
  Users,
  Dog,
  Trophy
} from 'lucide-react';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import type { SyncStatus } from './SyncStatusIndicator';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';

interface EntitySyncStats {
  entityType: string;
  icon: React.ElementType;
  label: string;
  total: number;
  synced: number;
  pending: number;
  errors: number;
  lastSyncAt?: Date;
}

interface SyncStatusPanelProps {
  className?: string;
  showDetailedStats?: boolean;
  allowManualSync?: boolean;
}

/**
 * Comprehensive sync status panel for settings/admin pages
 * Shows overall sync health and entity-specific statistics
 */
export const SyncStatusPanel: React.FC<SyncStatusPanelProps> = ({
  className = '',
  showDetailedStats = true,
  allowManualSync = true
}) => {
  const globalSync = useGlobalSyncStatus();

  // Mock entity sync statistics - in production, this would come from stores/services
  const entityStats: EntitySyncStats[] = [
    {
      entityType: 'shows',
      icon: Calendar,
      label: 'Shows',
      total: 25,
      synced: 23,
      pending: 2,
      errors: 0,
      lastSyncAt: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
    },
    {
      entityType: 'people',
      icon: Users,
      label: 'Users',
      total: 156,
      synced: 150,
      pending: 5,
      errors: 1,
      lastSyncAt: new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
    },
    {
      entityType: 'dogs',
      icon: Dog,
      label: 'Dogs',
      total: 89,
      synced: 87,
      pending: 2,
      errors: 0,
      lastSyncAt: new Date(Date.now() - 3 * 60 * 1000) // 3 minutes ago
    },
    {
      entityType: 'entries',
      icon: Trophy,
      label: 'Entries',
      total: 342,
      synced: 338,
      pending: 3,
      errors: 1,
      lastSyncAt: new Date(Date.now() - 1 * 60 * 1000) // 1 minute ago
    }
  ];

  const totalEntities = entityStats.reduce((sum, stat) => sum + stat.total, 0);
  const totalSynced = entityStats.reduce((sum, stat) => sum + stat.synced, 0);
  const totalPending = entityStats.reduce((sum, stat) => sum + stat.pending, 0);
  const totalErrors = entityStats.reduce((sum, stat) => sum + stat.errors, 0);

  const overallProgress = totalEntities > 0 ? (totalSynced / totalEntities) * 100 : 100;

  const handleManualSync = () => {
    // Trigger manual sync
    logger.debug('Manual sync triggered', 'sync', {});
  };

  const formatLastSync = (date?: Date): string => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  };

  const getOverallStatus = (): SyncStatus => {
    if (!globalSync.isOnline) return 'offline';
    if (totalErrors > 0) return 'error';
    if (totalPending > 0) return 'pending';
    return 'synced';
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Sync Status
          </CardTitle>
          
          <div className="flex items-center gap-3">
            {/* Network Status */}
            {globalSync.isOnline ? (
              <div className="flex items-center gap-1 text-green-600">
                <Wifi className="h-4 w-4" />
                <span className="text-sm">Online</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-red-600">
                <WifiOff className="h-4 w-4" />
                <span className="text-sm">Offline</span>
              </div>
            )}

            {/* Global Status */}
            <SyncStatusIndicator
              status={getOverallStatus()}
              entityType="system"
              showLabel
              lastSyncAt={globalSync.lastSyncAt}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Sync Progress</span>
            <span className="text-sm text-muted-foreground">
              {totalSynced}/{totalEntities} entities
            </span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>{totalSynced} synced</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-orange-600" />
              <span>{totalPending} pending</span>
            </div>
            {totalErrors > 0 && (
              <div className="flex items-center gap-1">
                <XCircle className="h-4 w-4 text-red-600" />
                <span>{totalErrors} errors</span>
              </div>
            )}
          </div>
        </div>

        {/* Manual Sync Control */}
        {allowManualSync && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium">Manual Sync</h4>
                <p className="text-xs text-muted-foreground">
                  Force synchronization of all pending changes
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualSync}
                disabled={!globalSync.isOnline}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync Now
              </Button>
            </div>
          </>
        )}

        {/* Detailed Entity Statistics */}
        {showDetailedStats && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Entity Sync Status</h4>
              
              <div className="space-y-3">
                {entityStats.map((stat) => {
                  const IconComponent = stat.icon;
                  const entityStatus: SyncStatus = 
                    stat.errors > 0 ? 'error' :
                    stat.pending > 0 ? 'pending' : 'synced';

                  return (
                    <div
                      key={stat.entityType}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <IconComponent className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-sm font-medium">{stat.label}</div>
                          <div className="text-xs text-muted-foreground">
                            Last sync: {formatLastSync(stat.lastSyncAt)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs">
                          <div className="font-medium">{stat.total} total</div>
                          <div className="text-muted-foreground">
                            {stat.synced} synced
                            {stat.pending > 0 && `, ${stat.pending} pending`}
                            {stat.errors > 0 && `, ${stat.errors} errors`}
                          </div>
                        </div>

                        <SyncStatusIndicator
                          status={entityStatus}
                          entityType={stat.entityType}
                          compact
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Queue Information */}
        {globalSync.queueSize > 0 && (
          <>
            <Separator />
            <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium text-orange-700">
                  {globalSync.queueSize} items queued for sync
                </span>
              </div>
              <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                Syncing
              </Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SyncStatusPanel;