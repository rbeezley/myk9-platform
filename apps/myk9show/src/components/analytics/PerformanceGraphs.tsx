/**
 * Performance Graphs Component
 *
 * Advanced performance visualization and monitoring component for sync analytics.
 * Provides interactive charts for sync performance metrics, bandwidth analysis,
 * response time percentiles, and real-time performance monitoring.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import { motion } from 'framer-motion';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Activity as LucideActivity,
  Zap as LucideZap,
  Wifi as LucideWifi,
  Clock as LucideClock,
  AlertTriangle as LucideAlertTriangle,
  CheckCircle as LucideCheckCircle,
  Download as LucideDownload,
  RotateCcw as LucideRotateCcw,
  TrendingUp as LucideTrendingUp,
} from 'lucide-react';

const Activity = LucideActivity as React.ComponentType<React.ComponentProps<typeof LucideActivity>>;
const TrendingUp = LucideTrendingUp as React.ComponentType<
  React.ComponentProps<typeof LucideTrendingUp>
>;
const Zap = LucideZap as React.ComponentType<React.ComponentProps<typeof LucideZap>>;
const Wifi = LucideWifi as React.ComponentType<React.ComponentProps<typeof LucideWifi>>;
const Clock = LucideClock as React.ComponentType<React.ComponentProps<typeof LucideClock>>;
const AlertTriangle = LucideAlertTriangle as React.ComponentType<
  React.ComponentProps<typeof LucideAlertTriangle>
>;
const CheckCircle = LucideCheckCircle as React.ComponentType<
  React.ComponentProps<typeof LucideCheckCircle>
>;
const Download = LucideDownload as React.ComponentType<React.ComponentProps<typeof LucideDownload>>;
const RotateCcw = LucideRotateCcw as React.ComponentType<
  React.ComponentProps<typeof LucideRotateCcw>
>;

import { cn } from '@/lib/utils';
import { SyncAnalyticsService } from '@/services/analytics/SyncAnalyticsService';
import { SyncMetrics } from '@/types/analytics-types';

// Re-export types for backward compatibility
export type {
  PerformanceGraphsProps,
  TimeRange,
  PerformancePercentiles,
  RegressionData,
  PerformanceStatus,
} from './PerformanceGraphs.types';

import { TIME_RANGES } from './PerformanceGraphs.types';
import {
  calculatePerformancePercentiles,
  generateRegressionData,
  getPerformanceStatus,
} from './PerformanceGraphs.helpers';
import {
  OverviewCharts,
  TrendsChart,
  PercentilesCharts,
  RegressionChart,
} from './PerformanceCharts';

interface PerformanceGraphsProps {
  className?: string;
}

export function PerformanceGraphs({ className }: PerformanceGraphsProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('24h');
  const [metrics, setMetrics] = useState<SyncMetrics | null>(null);
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshInterval] = useState(30);

  const analyticsService = useMemo(() => SyncAnalyticsService.getInstance(), []);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const timeRange = TIME_RANGES.find(r => r.value === selectedTimeRange);
      if (!timeRange) return;

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - timeRange.hours * 60 * 60 * 1000);
      const metricsData = await analyticsService.getMetrics(startTime, endTime);
      setMetrics(metricsData);
    } catch (error) {
      logger.error('Failed to load metrics:', 'analytics', {}, error as Error);
    } finally {
      setLoading(false);
    }
  }, [selectedTimeRange, analyticsService]);

  useEffect(() => {
    const initializeService = async () => {
      await analyticsService.initialize();
      await loadMetrics();
    };
    initializeService();
  }, [analyticsService, loadMetrics]);

  useEffect(() => {
    if (!isRealTimeEnabled) return;
    const interval = setInterval(loadMetrics, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [isRealTimeEnabled, refreshInterval, loadMetrics]);

  const performancePercentiles = useMemo(() => calculatePerformancePercentiles(metrics), [metrics]);

  const regressionData = useMemo(() => generateRegressionData(metrics), [metrics]);

  const handleExportChart = useCallback(
    async (format: 'png' | 'json' | 'csv') => {
      if (!metrics) return;
      try {
        if (format === 'json' || format === 'csv') {
          const blob = await analyticsService.exportData(
            metrics.startTime,
            metrics.endTime,
            format === 'csv' ? 'csv' : 'json'
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `performance-metrics-${Date.now()}.${format}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        logger.error('Export failed:', 'analytics', {}, error as Error);
      }
    },
    [metrics, analyticsService]
  );

  if (loading) {
    return (
      <div className={cn('space-y-6', className)}>
        <div className="flex items-center justify-center h-64">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
            data-testid="loading-spinner"
          ></div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className={cn('space-y-6', className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            Performance Graphs
          </h2>
          <p className="text-muted-foreground">
            Real-time sync performance monitoring and analysis
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map(range => (
                <SelectItem key={range.value} value={range.value}>
                  {range.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch checked={isRealTimeEnabled} onCheckedChange={setIsRealTimeEnabled} />
            <span className="text-sm text-muted-foreground">Real-time</span>
          </div>

          <Button variant="outline" size="sm" onClick={() => loadMetrics()}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          <Button variant="outline" size="sm" onClick={() => handleExportChart('json')}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Performance Summary Cards */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Sync Health</p>
                  <p className="text-2xl font-bold">{metrics.syncHealthScore}%</p>
                  <Badge
                    variant={
                      metrics.syncHealthScore >= 90
                        ? 'default'
                        : metrics.syncHealthScore >= 70
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {metrics.syncHealthScore >= 90
                      ? 'Excellent'
                      : metrics.syncHealthScore >= 70
                        ? 'Good'
                        : 'Needs Attention'}
                  </Badge>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  {metrics.syncHealthScore >= 90 ? (
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  ) : metrics.syncHealthScore >= 70 ? (
                    <Clock className="h-6 w-6 text-yellow-600" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Average Sync Time</p>
                  <p className="text-2xl font-bold">{metrics.averageSyncTime.toFixed(2)}s</p>
                  <p
                    className={cn(
                      'text-xs',
                      getPerformanceStatus(metrics.averageSyncTime, 'syncTime').color
                    )}
                  >
                    {getPerformanceStatus(metrics.averageSyncTime, 'syncTime').status.toUpperCase()}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold">{metrics.successRate.toFixed(1)}%</p>
                  <p
                    className={cn(
                      'text-xs',
                      getPerformanceStatus(metrics.successRate, 'successRate').color
                    )}
                  >
                    {getPerformanceStatus(metrics.successRate, 'successRate').status.toUpperCase()}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bandwidth Used</p>
                  <p className="text-2xl font-bold">
                    {(metrics.bandwidthUsed / 1024 / 1024).toFixed(1)}MB
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {metrics.compressionRatio
                      ? `${(metrics.compressionRatio * 100).toFixed(0)}% compressed`
                      : 'No compression'}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <Wifi className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Performance Charts */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="percentiles">Percentiles</TabsTrigger>
          <TabsTrigger value="regression">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {metrics && <OverviewCharts metrics={metrics} />}
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          {metrics && <TrendsChart metrics={metrics} />}
        </TabsContent>

        <TabsContent value="percentiles" className="space-y-6">
          {performancePercentiles && <PercentilesCharts percentiles={performancePercentiles} />}
        </TabsContent>

        <TabsContent value="regression" className="space-y-6">
          {regressionData && <RegressionChart regressionData={regressionData} />}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
