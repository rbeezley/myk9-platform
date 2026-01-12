import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// import { Progress } from '@/components/ui/progress';
import { logger } from '@/services/LoggingService';
import {
  AlertTriangle,
  Bell,
  CheckCircle,
  Clock,
  Filter,
  Merge,
  RefreshCw,
  Settings,
  Zap,
} from 'lucide-react';
import { ConflictResolutionDialog } from './ConflictResolutionDialog';
import { ConflictNotificationCenter } from './ConflictNotificationCenter';
import { SyncConflictResolver } from '@/services/sync/SyncConflictResolver';
import { 
  Conflict, 
  EnhancedConflictResolution, 
  ResolutionStrategy 
} from '@/types/sync-types';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Local types that match ConflictResolutionDialog expectations
type LocalResolutionStrategy = 'local' | 'remote' | 'merge' | 'custom';

interface LocalConflictResolution {
  conflictId: string;
  strategy: LocalResolutionStrategy;
  resolvedData: Record<string, unknown>;
  resolvedBy: string;
  resolvedAt: Date;
  metadata?: {
    mode?: string;
    confidence?: number;
    note?: string;
  };
}

// Types to match ConflictResolutionDialog expected interface
interface ConflictData {
  entityType: string;
  entityId: string;
  entityName: string;
  local: Record<string, unknown>;
  remote: Record<string, unknown>;
  conflictFields: string[];
  lastModified: {
    local: Date;
    remote: Date;
  };
  lastModifiedBy: {
    local: string;
    remote: string;
  };
  [key: string]: unknown;
}

interface ExtendedConflict {
  id: string;
  conflictType: 'version_mismatch' | 'concurrent_edit' | 'data_mismatch';
  entityType: string;
  entityId: string;
  entityName?: string;
  localData: Record<string, unknown>;
  remoteData: Record<string, unknown>;
  fieldPath?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  conflictFields: string[];
  createdAt: Date;
  detectedAt: Date;
  status: 'detected' | 'pending' | 'resolving' | 'resolved' | 'dismissed' | 'escalated' | 'expired';
  lastModified: {
    local: Date;
    remote: Date;
  };
  lastModifiedBy: {
    local: string;
    remote: string;
  };
}

interface ConflictResolutionManagerProps {
  conflicts: Conflict[];
  conflictResolver: SyncConflictResolver;
  onConflictResolve: (resolution: EnhancedConflictResolution) => Promise<void>;
  onBulkResolve?: (conflictIds: string[], strategy: ResolutionStrategy) => Promise<void>;
  onRefreshConflicts?: () => Promise<void>;
  className?: string;
}

interface ConflictStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  autoResolvable: number;
  escalated: number;
  avgResolutionTime?: number;
}

export const ConflictResolutionManager: React.FC<ConflictResolutionManagerProps> = ({
  conflicts,
  conflictResolver,
  onConflictResolve,
  onBulkResolve,
  onRefreshConflicts,
  className,
}) => {
  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resolutionHistory, setResolutionHistory] = useState<EnhancedConflictResolution[]>([]);
  const [activeTab, setActiveTab] = useState('conflicts');

  // Calculate conflict statistics
  const stats: ConflictStats = React.useMemo(() => {
    const total = conflicts.length;
    const critical = conflicts.filter(c => c.priority === 'critical').length;
    const high = conflicts.filter(c => c.priority === 'high').length;
    const medium = conflicts.filter(c => c.priority === 'medium').length;
    const low = conflicts.filter(c => c.priority === 'low').length;
    const autoResolvable = conflicts.filter(c => c.metadata?.autoResolvable).length;
    const escalated = conflicts.filter(c => c.metadata?.deadline && new Date(c.metadata.deadline) < new Date()).length;

    return {
      total,
      critical,
      high,
      medium,
      low,
      autoResolvable,
      escalated,
    };
  }, [conflicts]);

  // Filter conflicts based on current filters
  const filteredConflicts = React.useMemo(() => {
    return conflicts.filter(conflict => {
      if (filterPriority !== 'all' && conflict.priority !== filterPriority) {
        return false;
      }
      if (filterType !== 'all' && conflict.conflictType !== filterType) {
        return false;
      }
      return true;
    });
  }, [conflicts, filterPriority, filterType]);

  const handleResolveConflict = (conflict: Conflict) => {
    setSelectedConflict(conflict);
    setIsDialogOpen(true);
  };

  const handleAutoResolve = useCallback(async (conflict: Conflict) => {
    try {
      const suggestion = conflictResolver.suggestResolution(conflict);
      const resolution: EnhancedConflictResolution = {
        conflictId: conflict.id,
        strategy: suggestion.strategy as ResolutionStrategy,
        resolvedEntity: suggestion.suggestedData || conflict.localData,
        resolvedBy: 'system-auto',
        resolvedAt: new Date(),
        automatic: true,
        confidence: suggestion.confidence,
        resolutionNotes: suggestion.reason
      };

      await onConflictResolve(resolution);
      setResolutionHistory(prev => [resolution, ...prev.slice(0, 49)]); // Keep last 50
    } catch (error) {
      logger.error('Auto-resolve failed:', 'sync', {}, error as Error);
    }
  }, [conflictResolver, onConflictResolve]);

  // Convert conflicts to notifications for the notification center
  const notifications = React.useMemo(() => {
    return conflicts.map(conflict => ({
      id: conflict.id,
      type: 'conflict' as const,
      title: `${conflict.entityType} Conflict`,
      description: `Conflict in ${conflict.entityName || conflict.entityId}${conflict.fieldPath ? ` (${conflict.fieldPath})` : ''}`,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      entityName: conflict.entityName,
      priority: conflict.priority,
      status: 'unread' as const,
      createdAt: conflict.createdAt,
      updatedAt: conflict.detectedAt,
      metadata: {
        conflictCount: conflict.conflictFields?.length || 1,
        affectedUsers: conflict.metadata?.affectedUsers,
        autoResolvable: conflict.metadata?.autoResolvable,
        deadline: conflict.metadata?.deadline,
      },
      actions: [
        {
          id: 'resolve',
          label: 'Resolve Now',
          variant: 'default' as const,
          handler: () => handleResolveConflict(conflict),
        },
        {
          id: 'auto-resolve',
          label: 'Auto Resolve',
          variant: 'outline' as const,
          handler: () => handleAutoResolve(conflict),
        },
      ],
    }));
  }, [conflicts, handleAutoResolve]);

  /*
  const handleBulkAutoResolve = async () => {
    if (!onBulkResolve) return;
    
    const autoResolvableConflicts = filteredConflicts
      .filter(c => c.metadata?.autoResolvable && selectedConflicts.has(c.id))
      .map(c => c.id);

    if (autoResolvableConflicts.length > 0) {
      await onBulkResolve(autoResolvableConflicts, 'merge_automatic');
      setSelectedConflicts(new Set());
    }
  };
  */

  const handleRefresh = async () => {
    if (!onRefreshConflicts) return;
    
    setIsRefreshing(true);
    try {
      await onRefreshConflicts();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConflictResolve = async (resolution: EnhancedConflictResolution) => {
    await onConflictResolve(resolution);
    setResolutionHistory(prev => [resolution, ...prev.slice(0, 49)]);
    setIsDialogOpen(false);
    setSelectedConflict(null);
  };

  const handleNotificationAction = (notificationId: string, actionId: string) => {
    const conflict = conflicts.find(c => c.id === notificationId);
    if (!conflict) return;

    if (actionId === 'resolve') {
      handleResolveConflict(conflict);
    } else if (actionId === 'auto-resolve') {
      handleAutoResolve(conflict);
    }
  };

  const handleNotificationDismiss = (notificationId: string) => {
    // In a real implementation, this would mark the notification as dismissed
    logger.debug('Dismiss notification:', 'sync', { data: notificationId });
  };

  const handleNotificationRead = (notificationId: string) => {
    // In a real implementation, this would mark the notification as read
    logger.debug('Mark notification as read:', 'sync', { data: notificationId });
  };

  const handleBulkNotificationAction = (notificationIds: string[], action: string) => {
    logger.debug('Bulk notification action:', 'sync', { data: action, notificationIds });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'text-destructive';
      case 'high':
        return 'text-warning';
      case 'medium':
        return 'text-primary';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with Stats */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Conflict Resolution</h2>
            <p className="text-muted-foreground">
              Manage and resolve data conflicts across your application
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total Conflicts</div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-destructive">{stats.critical}</div>
                <div className="text-sm text-muted-foreground">Critical</div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-warning">{stats.high}</div>
                <div className="text-sm text-muted-foreground">High Priority</div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-success">{stats.autoResolvable}</div>
                <div className="text-sm text-muted-foreground">Auto-Resolvable</div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-warning">{stats.escalated}</div>
                <div className="text-sm text-muted-foreground">Escalated</div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-lg font-bold text-primary">
                  {resolutionHistory.length > 0 ? Math.round(
                    resolutionHistory.slice(0, 10).reduce((acc, r) => acc + ((r.confidence || 0) * 100), 0) / 
                    Math.min(resolutionHistory.length, 10)
                  ) : 0}%
                </div>
                <div className="text-sm text-muted-foreground">Avg Confidence</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      {stats.autoResolvable > 0 && (
        <Alert>
          <Zap className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              {stats.autoResolvable} conflicts can be automatically resolved using smart rules.
            </span>
            <Button
              size="sm"
              onClick={() => {
                const autoResolvableIds = conflicts
                  .filter(c => c.metadata?.autoResolvable)
                  .map(c => c.id);
                onBulkResolve?.(autoResolvableIds, 'merge_automatic');
              }}
            >
              Auto-Resolve All
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="conflicts" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Conflicts ({filteredConflicts.length})
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications ({notifications.filter(n => n.status === 'unread').length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            History ({resolutionHistory.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conflicts" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span className="text-sm font-medium">Filters:</span>
            </div>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="all">All Types</option>
              <option value="version_mismatch">Version Mismatch</option>
              <option value="concurrent_edit">Concurrent Edit</option>
              <option value="delete_update">Delete/Update</option>
              <option value="constraint_violation">Constraint Violation</option>
            </select>
          </div>

          {/* Conflicts List */}
          <div className="space-y-3">
            {filteredConflicts.length > 0 ? (
              filteredConflicts.map((conflict, index) => (
                <motion.div
                  key={conflict.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className={cn(
                    'cursor-pointer hover:shadow-md transition-all duration-200',
                    conflict.priority === 'critical' && 'border-destructive/50'
                  )}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold">
                              {conflict.entityType} - {conflict.entityName || conflict.entityId}
                            </h3>
                            <Badge variant="outline" className={getPriorityColor(conflict.priority)}>
                              {conflict.priority}
                            </Badge>
                            {conflict.metadata?.autoResolvable && (
                              <Badge variant="secondary" className="text-xs">
                                Auto-Resolvable
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {conflict.fieldPath ? `Field: ${conflict.fieldPath}` : 'Multiple fields'} • 
                            Detected {formatDistanceToNow(conflict.detectedAt, { addSuffix: true })}
                          </p>
                          {conflict.metadata?.deadline && (
                            <p className="text-sm text-warning">
                              Deadline: {conflict.metadata.deadline.toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {conflict.metadata?.autoResolvable && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAutoResolve(conflict);
                              }}
                            >
                              <Zap className="h-4 w-4 mr-1" />
                              Auto
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleResolveConflict(conflict)}
                          >
                            <Merge className="h-4 w-4 mr-1" />
                            Resolve
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))
            ) : (
              <Card>
                <CardContent className="pt-6 text-center">
                  <CheckCircle className="h-12 w-12 text-success mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No Conflicts Found</h3>
                  <p className="text-sm text-muted-foreground">
                    {filterPriority !== 'all' || filterType !== 'all'
                      ? 'No conflicts match the current filters.'
                      : 'All conflicts have been resolved!'
                    }
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <ConflictNotificationCenter
            notifications={notifications}
            onNotificationAction={handleNotificationAction}
            onNotificationDismiss={handleNotificationDismiss}
            onNotificationRead={handleNotificationRead}
            onBulkAction={handleBulkNotificationAction}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resolution History</CardTitle>
              <CardDescription>
                Recent conflict resolutions and their outcomes
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resolutionHistory.length > 0 ? (
                <div className="space-y-3">
                  {resolutionHistory.slice(0, 20).map((resolution, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{resolution.strategy}</Badge>
                          <span className="text-sm font-medium">
                            Conflict {resolution.conflictId.slice(0, 8)}
                          </span>
                          {resolution.confidence && (
                            <Badge variant="secondary" className="text-xs">
                              {resolution.confidence ? Math.round(resolution.confidence * 100) : 0}% confidence
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Resolved by {resolution.resolvedBy} • 
                          {formatDistanceToNow(resolution.resolvedAt, { addSuffix: true })}
                        </p>
                      </div>
                      <CheckCircle className="h-5 w-5 text-success" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-medium mb-2">No Resolution History</h3>
                  <p className="text-sm text-muted-foreground">
                    Resolution history will appear here as conflicts are resolved.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Conflict Resolution Dialog */}
      {selectedConflict && (
        <ConflictResolutionDialog
          conflict={selectedConflict as unknown as ConflictData | ExtendedConflict | null}
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onResolve={(strategy, mergedData) => {
            // Legacy callback - create enhanced resolution
            const resolution: EnhancedConflictResolution = {
              conflictId: selectedConflict.id,
              strategy: strategy as ResolutionStrategy,
              resolvedEntity: mergedData || selectedConflict.localData,
              resolvedBy: 'current-user',
              resolvedAt: new Date(),
              automatic: false,
              resolutionNotes: `Legacy resolution: ${strategy}`,
              confidence: 0.9
            };
            handleConflictResolve(resolution);
          }}
          onCancel={() => {
            setIsDialogOpen(false);
            setSelectedConflict(null);
          }}
          onResolveAdvanced={async (resolution: LocalConflictResolution) => {
            // Convert LocalConflictResolution to EnhancedConflictResolution
            // Map local strategy types to unified strategy types
            const strategyMapping: Record<LocalResolutionStrategy, ResolutionStrategy> = {
              'local': 'local_wins',
              'remote': 'remote_wins', 
              'merge': 'merge_manual',
              'custom': 'user_decides'
            };

            const enhanced: EnhancedConflictResolution = {
              conflictId: resolution.conflictId,
              strategy: strategyMapping[resolution.strategy],
              resolvedEntity: resolution.resolvedData,
              resolvedBy: resolution.resolvedBy,
              resolvedAt: resolution.resolvedAt,
              automatic: false, // Legacy resolutions are manual
              resolutionNotes: resolution.metadata?.note,
              confidence: resolution.metadata?.confidence,
            };
            await handleConflictResolve(enhanced);
          }}
          conflictResolver={conflictResolver as unknown as Record<string, unknown>}
        />
      )}
    </div>
  );
};