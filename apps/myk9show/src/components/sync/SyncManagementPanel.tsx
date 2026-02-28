import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { logger } from '@/services/LoggingService';
import {
  SyncStatusIndicator,
  ConflictResolutionDialog,
  SyncHistoryViewer,
} from '@/components/sync';
import { RefreshCw, History, AlertTriangle, Wifi, WifiOff, Database, Clock } from 'lucide-react';

interface SyncEntity {
  id: string;
  type: 'club' | 'person' | 'dog' | 'show' | 'entry';
  name: string;
  syncStatus: 'synced' | 'pending' | 'error' | 'conflict';
  lastModified?: Date;
  errorMessage?: string;
}

interface SyncManagementPanelProps {
  entities: SyncEntity[];
  isOnline?: boolean;
  pendingChanges?: number;
  onSyncAll?: () => void;
  onResolveConflict?: (entityId: string) => void;
  className?: string;
}

export function SyncManagementPanel({
  entities,
  isOnline = navigator.onLine,
  pendingChanges = 0,
  onSyncAll,
  onResolveConflict,
  className = '',
}: SyncManagementPanelProps) {
  const [showHistory, setShowHistory] = React.useState(false);
  const [conflictEntity, setConflictEntity] = React.useState<SyncEntity | null>(null);
  const [showConflictDialog, setShowConflictDialog] = React.useState(false);

  // Capture initial time once to avoid Date.now() during render
  const [now] = useState(() => Date.now());

  // Calculate sync statistics
  const stats = React.useMemo(() => {
    const total = entities.length;
    const synced = entities.filter(e => e.syncStatus === 'synced').length;
    const pending = entities.filter(e => e.syncStatus === 'pending').length;
    const errors = entities.filter(e => e.syncStatus === 'error').length;
    const conflicts = entities.filter(e => e.syncStatus === 'conflict').length;

    return { total, synced, pending, errors, conflicts };
  }, [entities]);

  const handleResolveConflict = (entity: SyncEntity) => {
    setConflictEntity(entity);
    setShowConflictDialog(true);
  };

  const handleConflictResolution = (
    resolution: 'local' | 'remote' | 'merge',
    mergedData?: Record<string, unknown>
  ) => {
    logger.debug('Resolving conflict:', 'sync', {
      data: { resolution, mergedData, entity: conflictEntity },
    });

    // In a real implementation, this would call the sync service
    if (onResolveConflict && conflictEntity) {
      onResolveConflict(conflictEntity.id);
    }

    setShowConflictDialog(false);
    setConflictEntity(null);
  };

  const mockConflictData = conflictEntity
    ? {
        entityType: conflictEntity.type,
        entityId: conflictEntity.id,
        entityName: conflictEntity.name,
        local: {
          name: conflictEntity.name,
          lastModified: new Date(),
          version: 1,
        },
        remote: {
          name: `${conflictEntity.name} (Server)`,
          lastModified: new Date(now + 1000 * 60 * 5),
          version: 2,
        },
        conflictFields: ['name', 'lastModified'],
        lastModified: {
          local: new Date(),
          remote: new Date(now + 1000 * 60 * 5),
        },
        lastModifiedBy: {
          local: 'Current User',
          remote: 'Remote User',
        },
      }
    : null;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Sync Overview Card */}
      <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Sync Status</CardTitle>
                <CardDescription>Data synchronization overview and controls</CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isOnline ? (
                <Badge
                  variant="outline"
                  className="bg-success-green/10 text-success-green border-success-green/20"
                >
                  <Wifi className="h-3 w-3 mr-1" />
                  Online
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-muted text-muted-foreground border-border/50"
                >
                  <WifiOff className="h-3 w-3 mr-1" />
                  Offline
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Statistics Grid */}
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="bg-success-green/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-success-green">{stats.synced}</div>
              <div className="text-xs text-success-green">Synced</div>
            </div>
            <div className="bg-warning-orange/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-warning-orange">{stats.pending}</div>
              <div className="text-xs text-warning-orange">Pending</div>
            </div>
            <div className="bg-error-red/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-error-red">{stats.errors}</div>
              <div className="text-xs text-error-red">Errors</div>
            </div>
            <div className="bg-warning-orange/10 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-warning-orange">{stats.conflicts}</div>
              <div className="text-xs text-warning-orange">Conflicts</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {pendingChanges > 0 && (
                <Badge
                  variant="outline"
                  className="bg-warning-orange/10 text-warning-orange border-warning-orange/20"
                >
                  <Clock className="h-3 w-3 mr-1" />
                  {pendingChanges} pending changes
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(true)}
                className="border-border/50"
              >
                <History className="h-4 w-4 mr-2" />
                View History
              </Button>

              {onSyncAll && (
                <Button onClick={onSyncAll} disabled={!isOnline || pendingChanges === 0}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync All
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* Entity List */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Entity Sync Status</h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {entities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No entities to sync</p>
                </div>
              ) : (
                entities.map(entity => (
                  <div
                    key={entity.id}
                    className="flex items-center justify-between p-3 border border-border/50 rounded-lg hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs capitalize">
                        {entity.type}
                      </Badge>
                      <div>
                        <div className="font-medium text-sm">{entity.name}</div>
                        {entity.errorMessage && (
                          <div className="text-xs text-error-red">{entity.errorMessage}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <SyncStatusIndicator
                        status={entity.syncStatus}
                        entityType={entity.type}
                        entityId={entity.id}
                        compact
                      />

                      {entity.syncStatus === 'conflict' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResolveConflict(entity)}
                          className="border-warning-orange/20 text-warning-orange hover:bg-warning-orange/5"
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync History Dialog */}
      <SyncHistoryViewer
        open={showHistory}
        onOpenChange={setShowHistory}
        onRetrySync={entryId => {
          logger.debug('Retry sync for entry:', 'sync', { data: entryId });
          // In real implementation, would retry specific sync operation
        }}
        onClearHistory={() => {
          logger.debug('Clear sync history', 'sync', {});
          // In real implementation, would clear sync history
        }}
        onExportHistory={() => {
          logger.debug('Export sync history', 'sync', {});
          // In real implementation, would export sync history
        }}
      />

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        open={showConflictDialog}
        onOpenChange={setShowConflictDialog}
        conflict={mockConflictData}
        onResolve={handleConflictResolution}
        onCancel={() => {
          setShowConflictDialog(false);
          setConflictEntity(null);
        }}
      />
    </div>
  );
}
