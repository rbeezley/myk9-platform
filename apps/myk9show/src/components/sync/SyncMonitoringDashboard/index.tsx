import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  Clock,
  Wifi,
  GitBranch,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { cn } from '../../../lib/utils';
import { logger } from '@/services/LoggingService';
import { SyncAnalyticsService } from '../../../services/analytics/SyncAnalyticsService';
import { SyncMetrics } from '../../../types/analytics-types';
import type { TimeRange } from './types';
import { MetricCard } from './MetricCard';
import { DashboardHeader } from './DashboardHeader';
import { HealthOverviewCard } from './HealthOverviewCard';
import { OverviewTab } from './OverviewTab';
import { PerformanceTab } from './PerformanceTab';
import { ConflictsTab } from './ConflictsTab';
import { NetworkTab } from './NetworkTab';
import { DashboardSettings } from './DashboardSettings';

const SyncMonitoringDashboard: React.FC = () => {
  const analyticsService = useMemo(() => SyncAnalyticsService.getInstance(), []);
  const [metrics, setMetrics] = useState<SyncMetrics | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [refreshInterval, setRefreshInterval] = useState<number>(5000);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState('overview');

  // Load metrics
  const loadMetrics = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const now = new Date();
      const startTime = new Date(now);

      switch (timeRange) {
        case '1h':
          startTime.setHours(now.getHours() - 1);
          break;
        case '24h':
          startTime.setDate(now.getDate() - 1);
          break;
        case '7d':
          startTime.setDate(now.getDate() - 7);
          break;
        case '30d':
          startTime.setDate(now.getDate() - 30);
          break;
      }

      const newMetrics = await analyticsService.getMetrics(startTime, now);
      setMetrics(newMetrics);
    } catch (error) {
      logger.error('Failed to load metrics:', 'sync', {}, error as Error);
    } finally {
      setIsRefreshing(false);
    }
  }, [analyticsService, timeRange]);

  // Auto-refresh
  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [loadMetrics, refreshInterval]);

  // Manual sync trigger
  const handleManualSync = useCallback(async () => {
    logger.debug('Manual sync triggered', 'sync', {});
    await loadMetrics();
  }, [loadMetrics]);

  // Export metrics
  const handleExport = useCallback(async () => {
    if (!metrics) return;

    const data = {
      timeRange,
      exportedAt: new Date().toISOString(),
      metrics: {
        syncHealthScore: metrics.syncHealthScore,
        successRate: metrics.successRate,
        totalSyncs: metrics.totalSyncs,
        failedSyncs: metrics.failedSyncs,
        averageSyncTime: metrics.averageSyncTime,
        conflictRate: metrics.conflictRate,
        totalConflicts: metrics.totalConflicts,
        offlineUsageTime: metrics.offlineUsageTime,
        bandwidthUsed: metrics.bandwidthUsed,
        compressionRatio: metrics.compressionRatio
      }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync-metrics-${timeRange}-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [metrics, timeRange]);

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Loading sync metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardHeader
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        onExport={handleExport}
        onManualSync={handleManualSync}
        isRefreshing={isRefreshing}
      />

      <HealthOverviewCard metrics={metrics} />

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Syncs"
          value={metrics.totalSyncs.toLocaleString()}
          subtitle={`${metrics.successfulSyncs.toLocaleString()} successful`}
          icon={<RefreshCw className="h-5 w-5" />}
          status={metrics.failedSyncs === 0 ? "success" : "warning"}
          trend={15}
        />
        <MetricCard
          title="Average Sync Time"
          value={`${metrics.averageSyncTime.toFixed(1)}s`}
          subtitle="Per operation"
          icon={<Clock className="h-5 w-5" />}
          status={metrics.averageSyncTime < 5 ? "success" : "warning"}
          trend={-8}
        />
        <MetricCard
          title="Conflict Rate"
          value={`${metrics.conflictRate}%`}
          subtitle={`${metrics.totalConflicts} total conflicts`}
          icon={<GitBranch className="h-5 w-5" />}
          status={metrics.conflictRate < 5 ? "success" : "error"}
          trend={-12}
        />
        <MetricCard
          title="Bandwidth Used"
          value={`${(metrics.bandwidthUsed / 1024 / 1024).toFixed(1)} MB`}
          subtitle={`Compression: ${(metrics.compressionRatio * 100).toFixed(0)}%`}
          icon={<Wifi className="h-5 w-5" />}
          status="neutral"
          trend={5}
        />
      </div>

      {/* Detailed Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className={cn("grid w-full grid-cols-4")}>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <PerformanceTab />
        </TabsContent>

        <TabsContent value="conflicts" className="space-y-4">
          <ConflictsTab metrics={metrics} />
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <NetworkTab metrics={metrics} />
        </TabsContent>
      </Tabs>

      <DashboardSettings
        refreshInterval={refreshInterval}
        onRefreshIntervalChange={setRefreshInterval}
      />
    </div>
  );
};

export default SyncMonitoringDashboard;
