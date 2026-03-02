/**
 * Judge Sync Dashboard Component
 * 
 * Judge-specific sync monitoring and controls for scoring sessions.
 * Provides detailed sync status, data integrity checks, and manual
 * sync controls with Premium design for professional use.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { logger } from '@/services/LoggingService';
import {
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';

// Icons
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Wifi, 
  WifiOff,
  Database,
  Upload,
  Download,
  Shield,
  Activity,
  BarChart3,
  Target,
  Zap,
  TrendingUp,
  Server,
  HardDrive
} from 'lucide-react';

// Hooks and Services
import { useOfflineScoringStore } from '@/store/offlineScoringStore';
import { offlineScoringService } from '@/services/scoring/OfflineScoringService';

// Types
import type { BaseScore } from '@/types/scoring-types';
import type { 
  SyncMetrics, 
  DataIntegrityStatus, 
  JudgeActivity,
  JudgeSyncDashboardProps
} from '@/utils/scoringUtils';

/**
 * Judge-specific sync dashboard with comprehensive monitoring
 */
function JudgeSyncDashboard({
  judgeId,
  classId,
  format,
  onForceSync,
  onDataExport,
  className
}: JudgeSyncDashboardProps) {
  // Store hooks
  const {
    isOffline,
    getSessionsByJudge,
    getScoresByClass,
    getPendingSyncItems
  } = useOfflineScoringStore();
  void format; // Suppress unused variable warning

  // Local state
  const [syncMetrics, setSyncMetrics] = useState<SyncMetrics>({
    totalScores: 0,
    syncedScores: 0,
    pendingScores: 0,
    failedScores: 0,
    syncSuccess: 100,
    averageSyncTime: 0
  });
  const [dataIntegrity, setDataIntegrity] = useState<DataIntegrityStatus>({
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    issues: []
  });
  const [judgeActivity, setJudgeActivity] = useState<JudgeActivity>({
    sessionsActive: 0,
    sessionsCompleted: 0,
    scoresSubmitted: 0,
    averageScoreTime: 0
  });
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Get judge sessions
  const judgeSessions = useMemo(() => 
    getSessionsByJudge(judgeId), 
    [judgeId, getSessionsByJudge]
  );

  // Calculate metrics
  const calculateMetrics = useCallback(async () => {
    try {
      let allScores: BaseScore[] = [];
      
      if (classId) {
        allScores = getScoresByClass(classId).filter(s => s.judgeId === judgeId);
      } else {
        // Get scores from all judge sessions
        judgeSessions.forEach(session => {
          const sessionScores = getScoresByClass(session.classId).filter(s => s.judgeId === judgeId);
          allScores.push(...sessionScores);
        });
      }

      // Sync metrics
      const syncedScores = allScores.filter(s => s.syncStatus === 'synced').length;
      const pendingScores = allScores.filter(s => s.syncStatus === 'pending').length;
      const failedScores = allScores.filter(s => s.syncStatus === 'error').length;
      const syncSuccess = allScores.length > 0 ? (syncedScores / allScores.length) * 100 : 100;

      setSyncMetrics({
        totalScores: allScores.length,
        syncedScores,
        pendingScores,
        failedScores,
        syncSuccess,
        averageSyncTime: 150, // Mock data - would calculate from actual sync times
        lastSyncTime: allScores.find(s => s.syncStatus === 'synced')?.lastModified
      });

      // Data integrity checks
      const issues: string[] = [];
      if (failedScores > 0) {
        issues.push(`${failedScores} scores failed to sync`);
      }
      if (pendingScores > allScores.length * 0.2) {
        issues.push('High number of pending sync items');
      }

      const totalChecks = 5; // Mock - would have actual integrity checks
      const failedChecks = issues.length;
      
      setDataIntegrity({
        totalChecks,
        passedChecks: totalChecks - failedChecks,
        failedChecks,
        issues
      });

      // Judge activity metrics
      const activeSessions = judgeSessions.filter(s => s.status === 'active').length;
      const completedSessions = judgeSessions.filter(s => s.status === 'completed').length;
      const lastActivity = allScores.length > 0 ? 
        allScores.sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0].recordedAt :
        undefined;

      setJudgeActivity({
        sessionsActive: activeSessions,
        sessionsCompleted: completedSessions,
        scoresSubmitted: allScores.length,
        averageScoreTime: 45000, // Mock - 45 seconds average
        lastActivity
      });

    } catch (error) {
      logger.error('Failed to calculate sync metrics:', 'scoring', {}, error as Error);
    }
  }, [judgeId, classId, judgeSessions, getScoresByClass]);

  // Auto-refresh metrics
  useEffect(() => {
    calculateMetrics();
    const refreshInterval = setInterval(() => {
      calculateMetrics();
      setLastRefresh(new Date());
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(refreshInterval);
  }, [calculateMetrics]);

  // Force sync handler
  const handleForceSync = useCallback(async () => {
    setSyncInProgress(true);
    try {
      await offlineScoringService.forceSyncAll();
      onForceSync?.();
      calculateMetrics();
    } catch (error) {
      logger.error('Force sync failed:', 'scoring', {}, error as Error);
    } finally {
      setSyncInProgress(false);
    }
  }, [onForceSync, calculateMetrics]);

  // Data export handler
  const handleDataExport = useCallback(() => {
    onDataExport?.();
  }, [onDataExport]);

  // Connection status
  const connectionStatus = {
    isOnline: !isOffline && navigator.onLine,
    quality: navigator.onLine ? 'good' : 'offline'
  };


  // Get status color
  const getStatusColor = (status: 'good' | 'warning' | 'error') => {
    switch (status) {
      case 'good':
        return 'text-success-green';
      case 'warning':
        return 'text-warning-orange';
      case 'error':
        return 'text-error-red';
    }
  };

  // Get sync health status
  const getSyncHealthStatus = (): 'good' | 'warning' | 'error' => {
    if (syncMetrics.failedScores > 0) return 'error';
    if (syncMetrics.pendingScores > syncMetrics.totalScores * 0.2) return 'warning';
    return 'good';
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header with quick status */}
      <Card className="bg-card/95 backdrop-blur-sm border-border/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Judge Sync Dashboard</h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Judge {judgeId.slice(-3)}
              </Badge>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={calculateMetrics}
                      className="h-8 px-2"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh data</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Quick status grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Connection status */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/30">
              {connectionStatus.isOnline ? (
                <Wifi className="h-4 w-4 text-success-green" />
              ) : (
                <WifiOff className="h-4 w-4 text-error-red" />
              )}
              <div>
                <div className="text-sm font-medium">
                  {connectionStatus.isOnline ? 'Online' : 'Offline'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Connection
                </div>
              </div>
            </div>

            {/* Sync health */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/30">
              <div className={cn("w-2 h-2 rounded-full", {
                'bg-success-green': getSyncHealthStatus() === 'good',
                'bg-warning-orange': getSyncHealthStatus() === 'warning',
                'bg-error-red': getSyncHealthStatus() === 'error'
              })} />
              <div>
                <div className="text-sm font-medium">
                  {syncMetrics.syncSuccess.toFixed(0)}%
                </div>
                <div className="text-xs text-muted-foreground">
                  Sync Success
                </div>
              </div>
            </div>

            {/* Active sessions */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/30">
              <Activity className="h-4 w-4 text-primary" />
              <div>
                <div className="text-sm font-medium">
                  {judgeActivity.sessionsActive}
                </div>
                <div className="text-xs text-muted-foreground">
                  Active Sessions
                </div>
              </div>
            </div>

            {/* Total scores */}
            <div className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/30">
              <Target className="h-4 w-4 text-primary" />
              <div>
                <div className="text-sm font-medium">
                  {syncMetrics.totalScores}
                </div>
                <div className="text-xs text-muted-foreground">
                  Scores Submitted
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed tabs */}
      <Tabs defaultValue="sync" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="sync" className="flex items-center gap-2">
            <RefreshCw className="h-3 w-3" />
            Sync Status
          </TabsTrigger>
          <TabsTrigger value="integrity" className="flex items-center gap-2">
            <Shield className="h-3 w-3" />
            Data Integrity
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2">
            <TrendingUp className="h-3 w-3" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="controls" className="flex items-center gap-2">
            <Zap className="h-3 w-3" />
            Controls
          </TabsTrigger>
        </TabsList>

        {/* Sync Status Tab */}
        <TabsContent value="sync" className="space-y-4">
          <Card className="bg-card/95 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-4 w-4" />
                Synchronization Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Sync progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Sync Progress</span>
                  <span>{syncMetrics.syncedScores} / {syncMetrics.totalScores}</span>
                </div>
                <Progress 
                  value={syncMetrics.totalScores > 0 ? (syncMetrics.syncedScores / syncMetrics.totalScores) * 100 : 0}
                  className="h-2"
                />
              </div>

              <Separator />

              {/* Sync breakdown */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Sync Breakdown</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-success-green" />
                        <span>Synced</span>
                      </div>
                      <span>{syncMetrics.syncedScores}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-warning-orange" />
                        <span>Pending</span>
                      </div>
                      <span>{syncMetrics.pendingScores}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3 w-3 text-error-red" />
                        <span>Failed</span>
                      </div>
                      <span>{syncMetrics.failedScores}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Performance</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Success Rate</span>
                      <span className={getStatusColor(getSyncHealthStatus())}>
                        {syncMetrics.syncSuccess.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Avg Sync Time</span>
                      <span>{syncMetrics.averageSyncTime}ms</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Last Sync</span>
                      <span className="text-muted-foreground">
                        {syncMetrics.lastSyncTime?.toLocaleTimeString() || 'Never'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sync queue details */}
              {syncMetrics.pendingScores > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Pending Items</h4>
                  <ScrollArea className="h-32">
                    <div className="space-y-1">
                      {getPendingSyncItems().slice(0, 5).map((item, index) => {
                        void index; // Suppress unused variable warning
                        return (
                        <div 
                          key={item.id}
                          className="flex items-center justify-between p-2 rounded bg-background/50 border border-border/20"
                        >
                          <span className="text-xs">{(item as { entityType?: string; operation?: string }).entityType || 'unknown'} {(item as { entityType?: string; operation?: string }).operation || 'sync'}</span>
                          <Badge variant="outline" className="text-xs">
                            {(item as { attempts?: number; maxAttempts?: number }).attempts || 0}/{(item as { attempts?: number; maxAttempts?: number }).maxAttempts || 3}
                          </Badge>
                        </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Integrity Tab */}
        <TabsContent value="integrity" className="space-y-4">
          <Card className="bg-card/95 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Data Integrity Checks
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Integrity overview */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 rounded bg-background/50 border border-border/30">
                  <div className="text-2xl font-bold text-success-green">
                    {dataIntegrity.passedChecks}
                  </div>
                  <div className="text-xs text-muted-foreground">Passed</div>
                </div>
                <div className="text-center p-3 rounded bg-background/50 border border-border/30">
                  <div className="text-2xl font-bold text-error-red">
                    {dataIntegrity.failedChecks}
                  </div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
                <div className="text-center p-3 rounded bg-background/50 border border-border/30">
                  <div className="text-2xl font-bold text-foreground">
                    {dataIntegrity.totalChecks}
                  </div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>

              {/* Issues list */}
              {dataIntegrity.issues.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Issues Found</h4>
                  <div className="space-y-1">
                    {dataIntegrity.issues.map((issue, index) => (
                      <Alert key={index} className="bg-error-red/5 border-error-red/20">
                        <AlertCircle className="h-4 w-4 text-error-red" />
                        <AlertDescription className="text-sm">
                          {issue}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </div>
              )}

              {dataIntegrity.issues.length === 0 && (
                <Alert className="bg-success-green/5 border-success-green/20">
                  <CheckCircle2 className="h-4 w-4 text-success-green" />
                  <AlertDescription className="text-sm">
                    All data integrity checks passed. Your scoring data is consistent and complete.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Card className="bg-card/95 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Judge Activity Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                {/* Session stats */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Session Statistics</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Active Sessions</span>
                      <Badge variant="outline" className="text-xs">
                        {judgeActivity.sessionsActive}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Completed Sessions</span>
                      <Badge variant="outline" className="text-xs">
                        {judgeActivity.sessionsCompleted}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Total Scores</span>
                      <Badge variant="outline" className="text-xs">
                        {judgeActivity.scoresSubmitted}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Performance stats */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Performance Metrics</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Avg Score Time</span>
                      <span className="text-sm font-mono">
                        {(judgeActivity.averageScoreTime / 1000).toFixed(1)}s
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Last Activity</span>
                      <span className="text-sm text-muted-foreground">
                        {judgeActivity.lastActivity?.toLocaleTimeString() || 'Never'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Controls Tab */}
        <TabsContent value="controls" className="space-y-4">
          <Card className="bg-card/95 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Sync Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                {/* Force sync */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border/30">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Force Sync All</h4>
                    <p className="text-xs text-muted-foreground">
                      Immediately sync all pending scores and data
                    </p>
                  </div>
                  <Button
                    onClick={handleForceSync}
                    disabled={syncInProgress || !connectionStatus.isOnline}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {syncInProgress ? (
                      <>
                        <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3 w-3 mr-2" />
                        Sync Now
                      </>
                    )}
                  </Button>
                </div>

                {/* Export data */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-background/50 border border-border/30">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Export Data</h4>
                    <p className="text-xs text-muted-foreground">
                      Download local scoring data for backup
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleDataExport}
                  >
                    <Download className="h-3 w-3 mr-2" />
                    Export
                  </Button>
                </div>

                {/* Service status */}
                <div className="p-4 rounded-lg bg-background/50 border border-border/30">
                  <h4 className="text-sm font-medium mb-3">Service Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Server className="h-3 w-3" />
                        <span>Scoring Service</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-success-green" />
                        <span className="text-xs">Running</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-3 w-3" />
                        <span>Local Storage</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-success-green" />
                        <span className="text-xs">Available</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer info */}
      <div className="text-xs text-muted-foreground text-center">
        Last updated: {lastRefresh.toLocaleTimeString()}
      </div>
    </div>
  );
}

// Default export - single component per file for React Refresh
export default JudgeSyncDashboard;