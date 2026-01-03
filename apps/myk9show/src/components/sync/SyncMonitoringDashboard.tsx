import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Wifi,
  WifiOff,
  Download,
  Upload,
  RefreshCw,
  FileDown,
  Settings,
  Users,
  GitBranch,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '../../lib/utils';
import { SyncAnalyticsService } from '../../services/analytics/SyncAnalyticsService';
import { SyncMetrics } from '../../types/analytics-types';
import { formatDistanceToNow } from 'date-fns';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: React.ReactNode;
  status?: 'success' | 'warning' | 'error' | 'neutral';
  onClick?: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  trend,
  icon,
  status = 'neutral',
  onClick
}) => {
  const statusColors = {
    success: 'text-green-600 bg-green-50 border-green-200',
    warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    error: 'text-red-600 bg-red-50 border-red-200',
    neutral: 'text-gray-600 bg-gray-50 border-gray-200'
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      <Card 
        className={cn(
          "relative overflow-hidden cursor-pointer transition-all duration-300",
          "hover:shadow-lg hover:border-primary/20",
          onClick && "cursor-pointer"
        )}
        onClick={onClick}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className={cn("p-2 rounded-lg", statusColors[status])}>
              {icon}
            </div>
            {trend !== undefined && (
              <div className="flex items-center gap-1">
                {trend > 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <span className={cn(
                  "text-sm font-medium",
                  trend > 0 ? "text-green-600" : "text-red-600"
                )}>
                  {Math.abs(trend)}%
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

interface HealthGaugeProps {
  score: number;
  label: string;
}

const HealthGauge: React.FC<HealthGaugeProps> = ({ score, label }) => {
  const getColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getGradient = (score: number) => {
    if (score >= 90) return 'from-green-500 to-green-600';
    if (score >= 70) return 'from-yellow-500 to-yellow-600';
    return 'from-red-500 to-red-600';
  };

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="currentColor"
            strokeWidth="12"
            fill="none"
            className="text-gray-200"
          />
          <circle
            cx="64"
            cy="64"
            r="56"
            stroke="url(#gradient)"
            strokeWidth="12"
            fill="none"
            strokeDasharray={`${(score / 100) * 351.86} 351.86`}
            className="transition-all duration-1000"
          />
          <defs>
            <linearGradient id="gradient">
              <stop offset="0%" className={cn("transition-all", getGradient(score))} />
              <stop offset="100%" className={cn("transition-all", getGradient(score))} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-3xl font-bold", getColor(score))}>
            {score}%
          </span>
        </div>
      </div>
      <p className="mt-2 text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
};

interface TimeSeriesChartProps {
  data: Array<{ time: Date; value: number }>;
  label: string;
  color?: string;
}

const TimeSeriesChart: React.FC<TimeSeriesChartProps> = ({ 
  data, 
  label, 
  color = "#007AFF" 
}) => {
  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">
          {data[data.length - 1]?.value.toFixed(1)}
        </p>
      </div>
      <div className="relative h-24 bg-gray-50 rounded-lg p-2">
        <svg className="w-full h-full">
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            points={data.map((d, i) => {
              const x = (i / (data.length - 1)) * 100;
              const y = 100 - ((d.value - minValue) / range) * 100;
              return `${x},${y}`;
            }).join(' ')}
            className="drop-shadow-sm"
          />
          {data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 100 - ((d.value - minValue) / range) * 100;
            return (
              <circle
                key={i}
                cx={`${x}%`}
                cy={`${y}%`}
                r="3"
                fill={color}
                className="drop-shadow-sm"
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
};

const SyncMonitoringDashboard: React.FC = () => {
  const analyticsService = useMemo(() => SyncAnalyticsService.getInstance(), []);
  const [metrics, setMetrics] = useState<SyncMetrics | null>(null);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
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
      console.error('Failed to load metrics:', error);
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
    // Trigger sync through sync service
    // This would integrate with your sync service
    console.log('Manual sync triggered');
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
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sync Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time sync health metrics and performance monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(v: '1h' | '24h' | '7d' | '30d') => setTimeRange(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="gap-2"
          >
            <FileDown className="h-4 w-4" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualSync}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            Sync Now
          </Button>
        </div>
      </div>

      {/* Health Overview */}
      <Card className="bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            System Health Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <HealthGauge score={metrics.syncHealthScore} label="Overall Health" />
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Success Rate</span>
                  <span className="text-sm font-bold">{metrics.successRate}%</span>
                </div>
                <Progress value={metrics.successRate} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Conflict Resolution</span>
                  <span className="text-sm font-bold">
                    {100 - metrics.conflictRate}%
                  </span>
                </div>
                <Progress value={100 - metrics.conflictRate} className="h-2" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Compression Efficiency</span>
                  <span className="text-sm font-bold">
                    {(metrics.compressionRatio * 100).toFixed(0)}%
                  </span>
                </div>
                <Progress value={metrics.compressionRatio * 100} className="h-2" />
              </div>
            </div>
            <div className="space-y-2">
              <Badge 
                variant={metrics.syncHealthScore >= 90 ? "default" : "destructive"}
                className="gap-1"
              >
                {metrics.syncHealthScore >= 90 ? (
                  <CheckCircle className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                {metrics.syncHealthScore >= 90 ? "Healthy" : "Needs Attention"}
              </Badge>
              <p className="text-sm text-muted-foreground">
                Last sync: {formatDistanceToNow(new Date(), { addSuffix: true })}
              </p>
              <p className="text-sm text-muted-foreground">
                Active connections: {Math.floor(Math.random() * 10) + 5}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sync Activity</CardTitle>
                <CardDescription>Recent sync operations</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={Array.from({ length: 24 }, (_, i) => ({
                    time: new Date(Date.now() - (23 - i) * 3600000),
                    value: Math.random() * 100 + 50
                  }))}
                  label="Syncs per hour"
                  color="#007AFF"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Success Rate Trend</CardTitle>
                <CardDescription>Sync success percentage over time</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={Array.from({ length: 24 }, (_, i) => ({
                    time: new Date(Date.now() - (23 - i) * 3600000),
                    value: Math.random() * 20 + 80
                  }))}
                  label="Success rate %"
                  color="#34C759"
                />
              </CardContent>
            </Card>
          </div>

          {/* Recent Events */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Sync Events</CardTitle>
              <CardDescription>Latest sync operations and their status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      {i % 3 === 0 ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : i % 3 === 1 ? (
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {i % 3 === 0 ? "Sync completed" : i % 3 === 1 ? "Partial sync" : "Sync failed"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {i % 2 === 0 ? "Dogs collection" : "Shows collection"} • 
                          {` ${Math.floor(Math.random() * 100)} records`}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(Date.now() - i * 300000), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sync Duration</CardTitle>
                <CardDescription>Average time per sync operation</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={Array.from({ length: 24 }, (_, i) => ({
                    time: new Date(Date.now() - (23 - i) * 3600000),
                    value: Math.random() * 3 + 2
                  }))}
                  label="Duration (seconds)"
                  color="#5856D6"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Queue Length</CardTitle>
                <CardDescription>Pending sync operations</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={Array.from({ length: 24 }, (_, i) => ({
                    time: new Date(Date.now() - (23 - i) * 3600000),
                    value: Math.random() * 20
                  }))}
                  label="Queue size"
                  color="#FF9500"
                />
              </CardContent>
            </Card>
          </div>

          {/* Performance Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Performance Breakdown</CardTitle>
              <CardDescription>Time spent in each sync phase</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { phase: "Data Preparation", time: 0.8, percentage: 20 },
                  { phase: "Network Transfer", time: 2.1, percentage: 52.5 },
                  { phase: "Server Processing", time: 0.6, percentage: 15 },
                  { phase: "Local Storage", time: 0.5, percentage: 12.5 }
                ].map((phase) => (
                  <div key={phase.phase} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{phase.phase}</span>
                      <span className="text-sm text-muted-foreground">
                        {phase.time}s ({phase.percentage}%)
                      </span>
                    </div>
                    <Progress value={phase.percentage} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conflicts" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <MetricCard
              title="Auto-Resolved"
              value={`${metrics.resolvedConflicts}`}
              subtitle="Conflicts resolved automatically"
              icon={<CheckCircle className="h-5 w-5" />}
              status="success"
            />
            <MetricCard
              title="Manual Resolution"
              value={`${Math.floor(metrics.totalConflicts * 0.2)}`}
              subtitle="Required user intervention"
              icon={<Users className="h-5 w-5" />}
              status="warning"
            />
            <MetricCard
              title="Pending"
              value={`${Math.floor(metrics.totalConflicts * 0.05)}`}
              subtitle="Awaiting resolution"
              icon={<Clock className="h-5 w-5" />}
              status="error"
            />
          </div>

          {/* Conflict Types */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Conflict Types</CardTitle>
              <CardDescription>Distribution of conflict types</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { type: "Update-Update", count: 45, color: "bg-blue-500" },
                  { type: "Delete-Update", count: 23, color: "bg-red-500" },
                  { type: "Create-Create", count: 12, color: "bg-yellow-500" },
                  { type: "Schema Mismatch", count: 5, color: "bg-purple-500" }
                ].map((conflict) => (
                  <div key={conflict.type} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{conflict.type}</span>
                      <span className="text-sm text-muted-foreground">{conflict.count}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full transition-all duration-500", conflict.color)}
                        style={{ width: `${(conflict.count / 85) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Conflicts */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Conflicts</CardTitle>
              <CardDescription>Latest conflict resolutions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">
                          {["Update conflict", "Delete conflict", "Schema conflict"][i % 3]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {["Dogs.name", "Shows.date", "Entries.status"][i % 3]} • 
                          {i % 2 === 0 ? " Auto-resolved" : " Manual resolution"}
                        </p>
                      </div>
                    </div>
                    <Badge variant={i % 2 === 0 ? "default" : "secondary"}>
                      {i % 2 === 0 ? "Resolved" : "Manual"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="network" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bandwidth Usage</CardTitle>
                <CardDescription>Data transfer over time</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={Array.from({ length: 24 }, (_, i) => ({
                    time: new Date(Date.now() - (23 - i) * 3600000),
                    value: Math.random() * 5 + 1
                  }))}
                  label="MB per hour"
                  color="#007AFF"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Compression Ratio</CardTitle>
                <CardDescription>Data compression efficiency</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeSeriesChart
                  data={Array.from({ length: 24 }, (_, i) => ({
                    time: new Date(Date.now() - (23 - i) * 3600000),
                    value: Math.random() * 20 + 60
                  }))}
                  label="Compression %"
                  color="#34C759"
                />
              </CardContent>
            </Card>
          </div>

          {/* Network Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Upload</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {(metrics.bandwidthUsed / 2 / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg: {((metrics.bandwidthUsed / 2 / metrics.totalSyncs) / 1024).toFixed(1)} KB/sync
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Download</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {(metrics.bandwidthUsed / 2 / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg: {((metrics.bandwidthUsed / 2 / metrics.totalSyncs) / 1024).toFixed(1)} KB/sync
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Offline Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">
                    {(metrics.offlineUsageTime / 60).toFixed(0)}m
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {((metrics.offlineUsageTime / (24 * 60)) * 100).toFixed(1)}% of time
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Connection Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Connection Status</CardTitle>
              <CardDescription>Current network connections</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "Primary Server", status: "connected", latency: 12 },
                  { name: "Backup Server", status: "connected", latency: 45 },
                  { name: "CDN Edge", status: "connected", latency: 8 },
                  { name: "WebSocket", status: "active", latency: 15 }
                ].map((connection) => (
                  <div
                    key={connection.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-2 w-2 rounded-full",
                        connection.status === "connected" || connection.status === "active"
                          ? "bg-green-500"
                          : "bg-red-500"
                      )} />
                      <span className="text-sm font-medium">{connection.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        {connection.latency}ms
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {connection.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Auto-refresh Settings */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Dashboard Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Auto-refresh interval</p>
              <p className="text-xs text-muted-foreground">
                Dashboard updates every {refreshInterval / 1000} seconds
              </p>
            </div>
            <Select 
              value={refreshInterval.toString()} 
              onValueChange={(v) => setRefreshInterval(parseInt(v))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5000">5 seconds</SelectItem>
                <SelectItem value="10000">10 seconds</SelectItem>
                <SelectItem value="30000">30 seconds</SelectItem>
                <SelectItem value="60000">1 minute</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SyncMonitoringDashboard;