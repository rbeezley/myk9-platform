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
import {
  LineChart as RechartsLineChart,
  Line as RechartsLine,
  AreaChart as RechartsAreaChart,
  Area as RechartsArea,
  BarChart as RechartsBarChart,
  Bar as RechartsBar,
  ScatterChart as RechartsScatterChart,
  Scatter as RechartsScatter,
  ComposedChart as RechartsComposedChart,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
  CartesianGrid as RechartsCartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  ResponsiveContainer as RechartsResponsiveContainer,
  ReferenceLine as RechartsReferenceLine,
  PieChart as RechartsPieChart,
  Pie as RechartsPie
} from 'recharts';

// Cast Recharts components to solve 'not a valid JSX component' type errors
const LineChart = RechartsLineChart as any;
const Line = RechartsLine as any;
const AreaChart = RechartsAreaChart as any;
const Area = RechartsArea as any;
const BarChart = RechartsBarChart as any;
const Bar = RechartsBar as any;
const ScatterChart = RechartsScatterChart as any;
const Scatter = RechartsScatter as any;
const ComposedChart = RechartsComposedChart as any;
const XAxis = RechartsXAxis as any;
const YAxis = RechartsYAxis as any;
const CartesianGrid = RechartsCartesianGrid as any;
const Tooltip = RechartsTooltip as any;
const Legend = RechartsLegend as any;
const ResponsiveContainer = RechartsResponsiveContainer as any;
const ReferenceLine = RechartsReferenceLine as any;
const PieChart = RechartsPieChart as any;
const Pie = RechartsPie as any;

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Activity as LucideActivity,
  TrendingUp as LucideTrendingUp,
  TrendingDown as LucideTrendingDown,
  Zap as LucideZap,
  Wifi as LucideWifi,
  Clock as LucideClock,
  AlertTriangle as LucideAlertTriangle,
  CheckCircle as LucideCheckCircle,
  Download as LucideDownload,
  RotateCcw as LucideRotateCcw
} from 'lucide-react';

const Activity = LucideActivity as any;
const TrendingUp = LucideTrendingUp as any;
const TrendingDown = LucideTrendingDown as any;
const Zap = LucideZap as any;
const Wifi = LucideWifi as any;
const Clock = LucideClock as any;
const AlertTriangle = LucideAlertTriangle as any;
const CheckCircle = LucideCheckCircle as any;
const Download = LucideDownload as any;
const RotateCcw = LucideRotateCcw as any;

import { cn } from '@/lib/utils';
import { SyncAnalyticsService } from '@/services/analytics/SyncAnalyticsService';
import { SyncMetrics } from '@/types/analytics-types';

interface PerformanceGraphsProps {
  className?: string;
}

interface TimeRange {
  value: string;
  label: string;
  hours: number;
}


// Time range options
const TIME_RANGES: TimeRange[] = [
  { value: '1h', label: '1 Hour', hours: 1 },
  { value: '6h', label: '6 Hours', hours: 6 },
  { value: '24h', label: '24 Hours', hours: 24 },
  { value: '7d', label: '7 Days', hours: 168 },
  { value: '30d', label: '30 Days', hours: 720 }
];

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  excellent: { syncTime: 1, successRate: 98, conflictRate: 1 },
  good: { syncTime: 3, successRate: 95, conflictRate: 3 },
  fair: { syncTime: 5, successRate: 90, conflictRate: 5 },
  poor: { syncTime: 10, successRate: 80, conflictRate: 10 }
};

export function PerformanceGraphs({ className }: PerformanceGraphsProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('24h');
  const [metrics, setMetrics] = useState<SyncMetrics | null>(null);
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshInterval] = useState(30); // seconds

  const analyticsService = useMemo(() => SyncAnalyticsService.getInstance(), []);


  // Load metrics data
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

  // Initialize and load data
  useEffect(() => {
    const initializeService = async () => {
      await analyticsService.initialize();
      await loadMetrics();
    };

    initializeService();
  }, [analyticsService, loadMetrics]);

  // Real-time updates
  useEffect(() => {
    if (!isRealTimeEnabled) return;

    const interval = setInterval(loadMetrics, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [isRealTimeEnabled, refreshInterval, loadMetrics]);

  // Calculate performance percentiles
  const performancePercentiles = useMemo(() => {
    if (!metrics?.recentEvents) return null;

    const syncTimes = metrics.recentEvents
      .filter(e => e.duration && e.status === 'completed')
      .map(e => e.duration! / 1000)
      .sort((a, b) => a - b);

    if (syncTimes.length === 0) return null;

    const getPercentile = (arr: number[], percentile: number) => {
      const index = Math.floor((percentile / 100) * arr.length);
      return arr[Math.min(index, arr.length - 1)];
    };

    return {
      p50: getPercentile(syncTimes, 50),
      p90: getPercentile(syncTimes, 90),
      p95: getPercentile(syncTimes, 95),
      p99: getPercentile(syncTimes, 99)
    };
  }, [metrics]);

  // Generate regression analysis data
  const regressionData = useMemo(() => {
    if (!metrics?.syncTimeTrend) return null;

    const data = metrics.syncTimeTrend.map((point, index) => ({
      x: index,
      y: point.value,
      timestamp: point.timestamp
    }));

    // Simple linear regression
    const n = data.length;
    const sumX = data.reduce((sum, d) => sum + d.x, 0);
    const sumY = data.reduce((sum, d) => sum + d.y, 0);
    const sumXY = data.reduce((sum, d) => sum + d.x * d.y, 0);
    const sumX2 = data.reduce((sum, d) => sum + d.x * d.x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const trendLine = data.map(d => ({
      x: d.x,
      trend: slope * d.x + intercept,
      timestamp: d.timestamp
    }));

    return {
      data,
      trendLine,
      slope,
      isImproving: slope < 0
    };
  }, [metrics]);

  // Export chart data
  const handleExportChart = useCallback(async (format: 'png' | 'json' | 'csv') => {
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
  }, [metrics, analyticsService]);

  // Performance status indicator
  const getPerformanceStatus = useCallback((value: number, metric: 'syncTime' | 'successRate' | 'conflictRate') => {
    const thresholds = PERFORMANCE_THRESHOLDS;

    if (metric === 'syncTime') {
      if (value <= thresholds.excellent.syncTime) return { status: 'excellent', color: 'text-green-600' };
      if (value <= thresholds.good.syncTime) return { status: 'good', color: 'text-blue-600' };
      if (value <= thresholds.fair.syncTime) return { status: 'fair', color: 'text-yellow-600' };
      return { status: 'poor', color: 'text-red-600' };
    }

    if (metric === 'successRate') {
      if (value >= thresholds.excellent.successRate) return { status: 'excellent', color: 'text-green-600' };
      if (value >= thresholds.good.successRate) return { status: 'good', color: 'text-blue-600' };
      if (value >= thresholds.fair.successRate) return { status: 'fair', color: 'text-yellow-600' };
      return { status: 'poor', color: 'text-red-600' };
    }

    // conflictRate
    if (value <= thresholds.excellent.conflictRate) return { status: 'excellent', color: 'text-green-600' };
    if (value <= thresholds.good.conflictRate) return { status: 'good', color: 'text-blue-600' };
    if (value <= thresholds.fair.conflictRate) return { status: 'fair', color: 'text-yellow-600' };
    return { status: 'poor', color: 'text-red-600' };
  }, []);

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label, formatter }: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string; unit?: string }>;
    label?: string;
    formatter?: (value: number, name: string) => string;
  }) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium text-foreground">
          {label ? new Date(label).toLocaleString() : 'N/A'}
        </p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {formatter ? formatter(entry.value, entry.name) : entry.value}
            {entry.unit && ` ${entry.unit}`}
          </p>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" data-testid="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className={cn("space-y-6", className)}
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
          <p className="text-muted-foreground">Real-time sync performance monitoring and analysis</p>
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
            <Switch
              checked={isRealTimeEnabled}
              onCheckedChange={setIsRealTimeEnabled}
            />
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
                  <Badge variant={metrics.syncHealthScore >= 90 ? "default" : metrics.syncHealthScore >= 70 ? "secondary" : "destructive"}>
                    {metrics.syncHealthScore >= 90 ? 'Excellent' : metrics.syncHealthScore >= 70 ? 'Good' : 'Needs Attention'}
                  </Badge>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  {metrics.syncHealthScore >= 90 ?
                    <CheckCircle className="h-6 w-6 text-green-600" /> :
                    metrics.syncHealthScore >= 70 ?
                      <Clock className="h-6 w-6 text-yellow-600" /> :
                      <AlertTriangle className="h-6 w-6 text-red-600" />
                  }
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
                  <p className={cn("text-xs", getPerformanceStatus(metrics.averageSyncTime, 'syncTime').color)}>
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
                  <p className={cn("text-xs", getPerformanceStatus(metrics.successRate, 'successRate').color)}>
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
                  <p className="text-2xl font-bold">{(metrics.bandwidthUsed / 1024 / 1024).toFixed(1)}MB</p>
                  <p className="text-xs text-muted-foreground">
                    {metrics.compressionRatio ? `${(metrics.compressionRatio * 100).toFixed(0)}% compressed` : 'No compression'}
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
          {metrics && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sync Performance Over Time */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Sync Performance Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={metrics.syncTimeTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value: any) => new Date(value).toLocaleTimeString()}
                      />
                      <YAxis label={{ value: 'Time (s)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip content={<CustomTooltip formatter={(value: number) => `${value.toFixed(2)}s`} />} />
                      <ReferenceLine y={PERFORMANCE_THRESHOLDS.good.syncTime} stroke="#f59e0b" strokeDasharray="5 5" />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Success Rate Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Success Rate Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={metrics.successRateTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value: any) => new Date(value).toLocaleTimeString()}
                      />
                      <YAxis domain={[0, 100]} label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip content={<CustomTooltip formatter={(value: number) => `${value.toFixed(1)}%`} />} />
                      <ReferenceLine y={PERFORMANCE_THRESHOLDS.good.successRate} stroke="#10b981" strokeDasharray="5 5" />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#10b981"
                        fill="#10b981"
                        fillOpacity={0.3}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Bandwidth Usage */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wifi className="h-5 w-5" />
                    Bandwidth Usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={metrics.bandwidthTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value: any) => new Date(value).toLocaleTimeString()}
                      />
                      <YAxis label={{ value: 'Bandwidth (MB)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip content={<CustomTooltip formatter={(value: number) => `${value.toFixed(2)} MB`} />} />
                      <Bar dataKey="value" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Conflict Rate */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Conflict Rate Trend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={metrics.conflictRateTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(value: any) => new Date(value).toLocaleTimeString()}
                      />
                      <YAxis label={{ value: 'Conflict Rate (%)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip content={<CustomTooltip formatter={(value: number) => `${value.toFixed(1)}%`} />} />
                      <ReferenceLine y={PERFORMANCE_THRESHOLDS.fair.conflictRate} stroke="#f59e0b" strokeDasharray="5 5" />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          {metrics && (
            <Card>
              <CardHeader>
                <CardTitle>Multi-Metric Performance Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={metrics.syncTimeTrend.map((syncPoint, index) => ({
                    timestamp: syncPoint.timestamp,
                    syncTime: syncPoint.value,
                    successRate: metrics.successRateTrend[index]?.value || 0,
                    conflictRate: metrics.conflictRateTrend[index]?.value || 0,
                    bandwidth: metrics.bandwidthTrend[index]?.value || 0
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value: any) => new Date(value).toLocaleTimeString()}
                    />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="syncTime" stroke="#3b82f6" name="Sync Time (s)" />
                    <Line yAxisId="right" type="monotone" dataKey="successRate" stroke="#10b981" name="Success Rate (%)" />
                    <Line yAxisId="right" type="monotone" dataKey="conflictRate" stroke="#f59e0b" name="Conflict Rate (%)" />
                    <Area yAxisId="left" type="monotone" dataKey="bandwidth" fill="#8b5cf6" fillOpacity={0.3} name="Bandwidth (MB)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="percentiles" className="space-y-6">
          {performancePercentiles && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Response Time Percentiles</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(performancePercentiles).map(([percentile, value]) => (
                      <div key={percentile} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{percentile.toUpperCase()}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 bg-muted rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-primary"
                              style={{ width: `${Math.min(100, (value / 10) * 100)}%` }}
                            />
                          </div>
                          <span className="text-sm font-mono">{value.toFixed(2)}s</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Performance Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Excellent (< 1s)', value: performancePercentiles.p50 < 1 ? 50 : 0, fill: '#10b981' },
                          { name: 'Good (1-3s)', value: performancePercentiles.p90 < 3 ? 40 : 30, fill: '#3b82f6' },
                          { name: 'Fair (3-5s)', value: 20, fill: '#f59e0b' },
                          { name: 'Poor (> 5s)', value: performancePercentiles.p95 > 5 ? 20 : 10, fill: '#ef4444' }
                        ]}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="regression" className="space-y-6">
          {regressionData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {regressionData.isImproving ?
                    <TrendingDown className="h-5 w-5 text-green-600" /> :
                    <TrendingUp className="h-5 w-5 text-red-600" />
                  }
                  Performance Regression Analysis
                  <Badge variant={regressionData.isImproving ? "default" : "destructive"}>
                    {regressionData.isImproving ? 'Improving' : 'Degrading'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <ScatterChart data={regressionData.data}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="x" name="Time Index" />
                    <YAxis dataKey="y" name="Sync Time (s)" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                    <Scatter dataKey="y" fill="#3b82f6" />
                    <Line
                      type="monotone"
                      dataKey="trend"
                      stroke="#ef4444"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      data={regressionData.trendLine}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <p className="text-sm">
                    <strong>Trend Analysis:</strong> Performance is{' '}
                    <span className={regressionData.isImproving ? 'text-green-600' : 'text-red-600'}>
                      {regressionData.isImproving ? 'improving' : 'degrading'}
                    </span>{' '}
                    at a rate of {Math.abs(regressionData.slope).toFixed(4)} seconds per time unit.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}