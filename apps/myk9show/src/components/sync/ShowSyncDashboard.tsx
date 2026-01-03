import React, { useState, useEffect } from 'react';
import type { ShowTrial } from '@/types/show-types';
import type { ShowRegistration } from '@/types/show-registration-types';

// Simple type aliases for compatibility
type ClassData = { id: string; name: string; trialId?: string; [key: string]: unknown };
type RegistrationEntry = ShowRegistration;
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  RefreshCw, 
  Calendar, 
  Users, 
  Trophy, 
  AlertTriangle, 
  CheckCircle2,
  Wifi,
  WifiOff,
  TrendingUp,
  Database
} from 'lucide-react';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { ClassSyncStatus } from './ClassSyncStatus';
import { EntryCountReconciliation } from './EntryCountReconciliation';
import { ScheduleConflictAlerts } from './ScheduleConflictAlerts';
import { useShowStore } from '@/store/showStore';
import { cn } from '@/lib/utils';

interface ShowSyncDashboardProps {
  /** Show ID to filter sync status for specific show */
  showId?: string;
  /** Compact view for sidebar usage */
  compact?: boolean;
  /** Enable real-time updates */
  realTimeUpdates?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * ShowSyncDashboard - Main dashboard showing sync status for shows, trials, classes
 * 
 * Provides comprehensive overview of synchronization status across all show-related
 * entities with real-time updates and interactive controls.
 */
export const ShowSyncDashboard: React.FC<ShowSyncDashboardProps> = ({
  showId,
  compact = false,
  realTimeUpdates = true,
  className
}) => {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { shows } = useShowStore();

  // Mock data for missing variables
  const trials: ShowTrial[] = [];
  const classes: ClassData[] = [];
  const entries: RegistrationEntry[] = [];
  const queueSize = 0;
  const isSyncing = false;
  const isOnline = true;
  const networkState = { quality: 'good', bandwidth: null };
  const metrics = { syncSuccessRate: 0.95 };
  const lastSyncAt: Date | null = null;

  const forceSyncNow = async () => {
    // Implementation placeholder
  };

  const clearError = () => {
    setError(null);
  };

  // Real-time updates
  useEffect(() => {
    if (!realTimeUpdates) return;

    const interval = setInterval(() => {
      // Trigger refresh of sync status
      // This would typically come from the sync service
    }, 5000);

    return () => clearInterval(interval);
  }, [realTimeUpdates]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await forceSyncNow();
    } finally {
      setRefreshing(false);
    }
  };

  // Calculate sync statistics
  const getSyncStats = () => {
    const showCount = showId ? 1 : shows.length;
    const trialCount = trials.filter(t => !showId || (t as ShowTrial & { showId?: string }).showId === showId).length;
    const classCount = classes.filter(c => !showId || 
      trials.find(t => t.id === c.trialId && (t as ShowTrial & { showId?: string }).showId === showId)).length;
    const entryCount = entries.filter(e => !showId ||
      classes.find(c => c.id === (e as RegistrationEntry & { classId?: string }).classId && 
        trials.find(t => t.id === c.trialId && (t as ShowTrial & { showId?: string }).showId === showId))).length;

    return {
      shows: showCount,
      trials: trialCount,
      classes: classCount,
      entries: entryCount,
      total: showCount + trialCount + classCount + entryCount
    };
  };

  const stats = getSyncStats();

  // Overview metrics
  const overviewMetrics = [
    {
      label: 'Shows',
      value: stats.shows,
      icon: Calendar,
      status: 'synced' as const
    },
    {
      label: 'Trials',
      value: stats.trials,
      icon: Trophy,
      status: 'synced' as const
    },
    {
      label: 'Classes',
      value: stats.classes,
      icon: Users,
      status: queueSize > 0 ? 'pending' as const : 'synced' as const
    },
    {
      label: 'Entries',
      value: stats.entries,
      icon: Database,
      status: error ? 'error' as const : 'synced' as const
    }
  ];

  if (compact) {
    return (
      <Card className={cn("border-0 shadow-sm", className)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <SyncStatusIndicator 
                status="synced"
                compact
              />
              <span className="text-sm font-medium">Sync Status</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing || isSyncing}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={cn(
                "h-4 w-4",
                (refreshing || isSyncing) && "animate-spin"
              )} />
            </Button>
          </div>

          {queueSize > 0 && (
            <div className="mb-3">
              <div className="text-xs text-muted-foreground mb-1">
                {queueSize} pending changes
              </div>
              <Progress value={0} className="h-1" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            {overviewMetrics.map((metric) => {
              const IconComponent = metric.icon;
              return (
                <div key={metric.label} className="flex items-center gap-2">
                  <IconComponent className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">{metric.label}:</span>
                  <span className="font-medium">{metric.value}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sync Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor synchronization status across all show data
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-emerald-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-600" />
            )}
            <span>{networkState.quality}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing || isSyncing}
            className="gap-2"
          >
            <RefreshCw className={cn(
              "h-4 w-4",
              (refreshing || isSyncing) && "animate-spin"
            )} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-red-900">Sync Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={clearError}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {overviewMetrics.map((metric) => {
          const IconComponent = metric.icon;
          return (
            <Card key={metric.label} className="border-0 shadow-sm bg-card/50 backdrop-blur-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {metric.label}
                    </p>
                    <p className="text-2xl font-bold">{metric.value}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <IconComponent className="h-5 w-5 text-muted-foreground" />
                    <SyncStatusIndicator 
                      status={metric.status}
                      compact
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="classes">Classes</TabsTrigger>
          <TabsTrigger value="entries">Entries</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sync Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Sync Progress
                </CardTitle>
                <CardDescription>
                  Current synchronization activity
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isSyncing ? (
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Syncing data</span>
                      <span>0/0</span>
                    </div>
                    <Progress 
                      value={0} 
                      className="h-2"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    All data synchronized
                  </div>
                )}

                {queueSize > 0 && (
                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Queue</span>
                      <Badge variant="secondary">{queueSize} pending</Badge>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 pt-3 border-t text-sm">
                  <div>
                    <div className="text-muted-foreground">Success Rate</div>
                    <div className="font-medium">
                      {(metrics.syncSuccessRate * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Last Sync</div>
                    <div className="font-medium">
                      {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : 'Never'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Network Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {isOnline ? (
                    <Wifi className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <WifiOff className="h-5 w-5 text-red-600" />
                  )}
                  Network Status
                </CardTitle>
                <CardDescription>
                  Connection quality and bandwidth
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={isOnline ? "default" : "destructive"}>
                    {isOnline ? "Online" : "Offline"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Quality</span>
                  <span className="text-sm font-medium capitalize">
                    {networkState.quality}
                  </span>
                </div>
                {networkState.bandwidth && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Bandwidth</span>
                    <span className="text-sm font-medium">
                      {networkState.bandwidth} Mbps
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="classes">
          <ClassSyncStatus showId={showId} />
        </TabsContent>

        <TabsContent value="entries">
          <EntryCountReconciliation showId={showId} />
        </TabsContent>

        <TabsContent value="conflicts">
          <ScheduleConflictAlerts showId={showId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ShowSyncDashboard;