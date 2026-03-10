import React, { useState } from 'react';
import { logger } from '@/services/LoggingService';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Alert, AlertDescription } from '../ui/alert';
import { useConflictResolution } from '../../hooks/useConflictResolution';
import { ConflictResolutionDialog } from '../sync/ConflictResolutionDialog';
import type { Conflict, ResolutionStrategy, ConflictResolution } from '../../types/conflict-types';

// Define types directly to avoid import issues
type ConflictPriority = 'low' | 'medium' | 'high' | 'critical';

interface ConflictNotification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error';
}
import {
  AlertTriangle,
  Clock,
  Users,
  X,
  Eye,
  CheckCircle,
  XCircle,
  Info,
  Bell,
  BellOff,
} from 'lucide-react';

interface ConflictNotificationsProps {
  entityType?: string;
  showStats?: boolean;
  maxNotifications?: number;
}

export function ConflictNotifications({
  entityType,
  showStats = true,
  maxNotifications = 5,
}: ConflictNotificationsProps) {
  const {
    conflicts,
    notifications,
    stats,
    isLoading,
    error,
    resolveConflict,
    dismissNotification,
    clearNotifications,
  } = useConflictResolution({
    entityType,
    enableNotifications: true,
    autoRefresh: true,
    refreshInterval: 30000,
  });

  const [selectedConflict, setSelectedConflict] = useState<Conflict | null>(null);
  const [isResolutionDialogOpen, setIsResolutionDialogOpen] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const getPriorityColor = (priority: ConflictPriority) => {
    switch (priority) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'destructive';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const getPriorityIcon = (priority: ConflictPriority) => {
    switch (priority) {
      case 'critical':
        return <XCircle className="h-4 w-4" />;
      case 'high':
        return <AlertTriangle className="h-4 w-4" />;
      case 'medium':
        return <Info className="h-4 w-4" />;
      case 'low':
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const handleViewConflict = (notification: ConflictNotification) => {
    const conflict = conflicts.find(c => c.id === notification.conflictId);
    if (conflict) {
      setSelectedConflict(conflict);
      setIsResolutionDialogOpen(true);
    }
  };

  const handleResolveConflict = async (
    strategy: ResolutionStrategy,
    customResolution?: Record<string, unknown>
  ): Promise<ConflictResolution<Record<string, unknown>>> => {
    if (!selectedConflict) {
      throw new Error('No conflict selected');
    }

    setIsResolving(true);
    try {
      const resolution = await resolveConflict(selectedConflict.id, strategy, customResolution);
      setIsResolutionDialogOpen(false);
      setSelectedConflict(null);
      return resolution;
    } finally {
      setIsResolving(false);
    }
  };

  // Adapter function for the ConflictResolutionDialog interface
  const handleDialogResolve = (
    resolution: 'local' | 'remote' | 'merge',
    mergedData?: Record<string, unknown>
  ) => {
    // Map simple resolution strings to ResolutionStrategy enum
    const strategyMap: Record<string, ResolutionStrategy> = {
      local: ResolutionStrategy.LAST_WRITE_WINS, // Favor local
      remote: ResolutionStrategy.LAST_WRITE_WINS, // Favor remote
      merge: ResolutionStrategy.FIELD_MERGE,
    };

    const strategy = strategyMap[resolution] || ResolutionStrategy.MANUAL_REQUIRED;
    handleResolveConflict(strategy, mergedData).catch(err =>
      logger.error('Error', 'conflict', {}, err as Error)
    );
  };

  const visibleNotifications = notifications.slice(0, maxNotifications);
  const hasMoreNotifications = notifications.length > maxNotifications;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            <span className="ml-2">Loading conflicts...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Failed to load conflicts: {error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Statistics */}
      {showStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Total</p>
                  <p className="text-2xl font-bold">{stats.totalConflicts}</p>
                </div>
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Pending</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.pendingConflicts}</p>
                </div>
                <Clock className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Resolved</p>
                  <p className="text-2xl font-bold text-teal-600">{stats.resolvedConflicts}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-teal-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Critical</p>
                  <p className="text-2xl font-bold text-red-600">{stats.criticalConflicts}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Conflict Notifications
                {notifications.length > 0 && (
                  <Badge variant="secondary">{notifications.length}</Badge>
                )}
              </CardTitle>
              <CardDescription>Active conflicts requiring your attention</CardDescription>
            </div>
            {notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearNotifications}
                className="text-muted-foreground"
              >
                <BellOff className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4" />
              <p>No active conflicts</p>
              <p className="text-sm">All conflicts have been resolved or auto-resolved.</p>
            </div>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-3">
                {visibleNotifications.map(notification => (
                  <div
                    key={notification.conflictId}
                    className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start space-x-3 flex-1">
                      {getPriorityIcon(notification.priority)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{notification.entityType} Conflict</span>
                          <Badge
                            variant={getPriorityColor(notification.priority)}
                            className="text-xs"
                          >
                            {ConflictPriority[notification.priority]}
                          </Badge>
                          {notification.requiresManualResolution && (
                            <Badge variant="outline" className="text-xs">
                              Manual Resolution Required
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Entity ID: {notification.entityId}
                        </p>
                        {notification.affectedFields.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Affected fields: {notification.affectedFields.join(', ')}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Detected: {notification.detectedAt.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewConflict(notification)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Resolve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => dismissNotification(notification.conflictId)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {hasMoreNotifications && (
                  <div className="text-center py-2 text-sm text-muted-foreground">
                    and {notifications.length - maxNotifications} more...
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Resolution Dialog */}
      <ConflictResolutionDialog
        conflict={selectedConflict}
        isOpen={isResolutionDialogOpen}
        onClose={() => {
          setIsResolutionDialogOpen(false);
          setSelectedConflict(null);
        }}
        onResolve={handleDialogResolve}
        isResolving={isResolving}
      />
    </div>
  );
}

// Specialized notification components for different entity types
export function ShowConflictNotifications() {
  return <ConflictNotifications entityType="show" />;
}

export function RegistrationConflictNotifications() {
  return <ConflictNotifications entityType="registration" />;
}

export function ScoreConflictNotifications() {
  return <ConflictNotifications entityType="score" />;
}

// Compact notification widget for headers/sidebars
export function ConflictNotificationWidget() {
  const { stats } = useConflictResolution({
    enableNotifications: true,
    autoRefresh: true,
    refreshInterval: 30000,
  });

  const [isExpanded, setIsExpanded] = useState(false);

  if (stats.pendingConflicts === 0) {
    return null;
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="relative"
      >
        <Bell className="h-4 w-4 mr-2" />
        Conflicts
        {stats.criticalConflicts > 0 && (
          <Badge variant="destructive" className="ml-2 text-xs">
            {stats.criticalConflicts}
          </Badge>
        )}
        {stats.pendingConflicts > 0 && stats.criticalConflicts === 0 && (
          <Badge variant="secondary" className="ml-2 text-xs">
            {stats.pendingConflicts}
          </Badge>
        )}
      </Button>

      {isExpanded && (
        <div className="absolute top-full right-0 mt-2 w-80 z-50">
          <ConflictNotifications showStats={false} maxNotifications={3} />
        </div>
      )}
    </div>
  );
}
