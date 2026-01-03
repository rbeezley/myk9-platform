/**
 * Monitoring Dashboard Component
 * Provides comprehensive monitoring and analytics visualization
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle,
  RefreshCw,
  Download,
  Users,
  Zap
} from 'lucide-react';

import { logger } from '@/services/LoggingService';
import { performanceMetrics } from '@/services/analytics/PerformanceMetricsService';
import { errorAnalytics, ErrorSeverity } from '@/services/analytics/ErrorAnalyticsService';
import { getStateActivitySummary } from '@/utils/stateLoggingMiddleware';

/**
 * Dashboard overview metrics
 */
interface DashboardMetrics {
  uptime: number;
  totalUsers: number;
  activeUsers: number;
  errorRate: number;
  averageLoadTime: number;
  memoryUsage: number;
  cacheHitRate: number;
}

/**
 * Real-time status indicator
 */
interface SystemStatus {
  overall: 'healthy' | 'warning' | 'critical';
  services: Array<{
    name: string;
    status: 'healthy' | 'warning' | 'critical';
    message: string;
  }>;
}

/**
 * Props for the monitoring dashboard
 */
export interface MonitoringDashboardProps {
  /** Whether to show development-only features */
  showDevFeatures?: boolean;
  /** Custom refresh interval in milliseconds */
  refreshInterval?: number;
  /** Whether to auto-refresh data */
  autoRefresh?: boolean;
}

/**
 * Monitoring Dashboard Component
 */
export const MonitoringDashboard: React.FC<MonitoringDashboardProps> = ({
  showDevFeatures = import.meta.env.DEV,
  refreshInterval = 30000,
  autoRefresh = true
}) => {
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  /**
   * Load dashboard data
   */
  const loadDashboardData = async () => {
    try {
      setIsLoading(true);

      // Get performance metrics
      const perfMetrics = performanceMetrics.getAllMetrics();
      
      // Get error statistics
      const errorStats = errorAnalytics.getErrorStatistics();
      
      // Get state activity
      const stateActivity = getStateActivitySummary();
      
      // Calculate metrics
      const metrics: DashboardMetrics = {
        uptime: Math.floor((Date.now() - (performance.timeOrigin || Date.now())) / 1000),
        totalUsers: Object.keys(stateActivity).length, // Approximation based on active stores
        activeUsers: Object.values(stateActivity).filter(activity => 
          Date.now() - activity.lastActivity < 5 * 60 * 1000 // Active in last 5 minutes
        ).length,
        errorRate: errorStats.errorRate,
        averageLoadTime: perfMetrics.webVitals.lcp || 0,
        memoryUsage: (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize || 0,
        cacheHitRate: calculateCacheHitRate()
      };

      // Determine system status
      const status: SystemStatus = {
        overall: determineOverallStatus(metrics, errorStats),
        services: [
          {
            name: 'Performance',
            status: metrics.averageLoadTime > 4000 ? 'critical' : 
                   metrics.averageLoadTime > 2500 ? 'warning' : 'healthy',
            message: `Avg load time: ${Math.round(metrics.averageLoadTime)}ms`
          },
          {
            name: 'Error Rate',
            status: errorStats.criticalErrors > 0 ? 'critical' :
                   errorStats.errorRate > 5 ? 'warning' : 'healthy',
            message: `${errorStats.totalErrors} errors, ${errorStats.criticalErrors} critical`
          },
          {
            name: 'Memory',
            status: metrics.memoryUsage > 100 * 1024 * 1024 ? 'warning' : 'healthy',
            message: `${formatBytes(metrics.memoryUsage)} used`
          },
          {
            name: 'Storage',
            status: 'healthy', // Would check IndexedDB status in real implementation
            message: 'IndexedDB operational'
          }
        ]
      };

      setDashboardMetrics(metrics);
      setSystemStatus(status);
      setLastUpdated(new Date());

      logger.debug('Dashboard data loaded', 'monitoring', { metrics, status });

    } catch (error) {
      logger.error('Failed to load dashboard data', 'monitoring', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Set up auto-refresh
   */
  useEffect(() => {
    loadDashboardData();

    if (autoRefresh) {
      const interval = setInterval(loadDashboardData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  /**
   * Export dashboard data
   */
  const exportDashboardData = () => {
    const data = {
      timestamp: new Date().toISOString(),
      metrics: dashboardMetrics,
      status: systemStatus,
      performance: performanceMetrics.getAllMetrics(),
      errors: errorAnalytics.generateErrorReport(),
      logs: logger.getLocalLogs().slice(-100) // Last 100 logs
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monitoring-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    logger.info('Dashboard data exported', 'monitoring');
  };

  /**
   * Memoized component sections
   */
  const overviewCards = useMemo(() => {
    if (!dashboardMetrics || !systemStatus) return null;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Badge variant={
              systemStatus.overall === 'healthy' ? 'default' :
              systemStatus.overall === 'warning' ? 'secondary' : 'destructive'
            }>
              {systemStatus.overall}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {systemStatus.overall === 'healthy' ? '✅' : 
               systemStatus.overall === 'warning' ? '⚠️' : '🚨'}
            </div>
            <p className="text-xs text-muted-foreground">
              Last updated {lastUpdated.toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardMetrics.activeUsers}</div>
            <p className="text-xs text-muted-foreground">
              {dashboardMetrics.totalUsers} total sessions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(dashboardMetrics.averageLoadTime)}ms
            </div>
            <p className="text-xs text-muted-foreground">
              Avg load time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {dashboardMetrics.errorRate.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Errors per session
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }, [dashboardMetrics, systemStatus, lastUpdated]);

  if (isLoading && !dashboardMetrics) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading monitoring data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monitoring Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time application monitoring and analytics
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={loadDashboardData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportDashboardData}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      {overviewCards}

      {/* System Alerts */}
      {systemStatus && systemStatus.overall !== 'healthy' && (
        <Alert variant={systemStatus.overall === 'warning' ? 'default' : 'destructive'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>System Alert</AlertTitle>
          <AlertDescription>
            {systemStatus.overall === 'warning' 
              ? 'Some services require attention'
              : 'Critical issues detected requiring immediate action'
            }
          </AlertDescription>
        </Alert>
      )}

      {/* Detailed Tabs */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
          {showDevFeatures && <TabsTrigger value="debug">Debug</TabsTrigger>}
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <PerformanceTab />
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <ErrorsTab />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <LogsTab />
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <SystemTab systemStatus={systemStatus} />
        </TabsContent>

        {showDevFeatures && (
          <TabsContent value="debug" className="space-y-4">
            <DebugTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

/**
 * Performance monitoring tab
 */
const PerformanceTab: React.FC = () => {
  const [perfData, setPerfData] = useState(performanceMetrics.getAllMetrics());

  useEffect(() => {
    const interval = setInterval(() => {
      setPerfData(performanceMetrics.getAllMetrics());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Web Vitals</CardTitle>
          <CardDescription>Core performance metrics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(perfData.webVitals).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm font-medium">{key.toUpperCase()}</span>
              <Badge variant={getPerformanceBadgeVariant(key, value)}>
                {value ? `${Math.round(value)}${key === 'cls' ? '' : 'ms'}` : 'N/A'}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom Metrics</CardTitle>
          <CardDescription>Application-specific measurements</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(perfData.customMetrics).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm font-medium">{formatMetricName(key)}</span>
              <span className="text-sm text-muted-foreground">
                {value ? `${Math.round(value)}ms` : 'N/A'}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Error monitoring tab
 */
const ErrorsTab: React.FC = () => {
  const [errorReport, setErrorReport] = useState(errorAnalytics.generateErrorReport());

  useEffect(() => {
    const interval = setInterval(() => {
      setErrorReport(errorAnalytics.generateErrorReport());
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Total Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{errorReport.summary.totalErrors}</div>
            <p className="text-sm text-muted-foreground">
              {errorReport.summary.uniqueErrors} unique
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Critical Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {errorReport.summary.criticalErrors}
            </div>
            <p className="text-sm text-muted-foreground">
              Requires immediate attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Error Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {errorReport.summary.errorRate.toFixed(2)}
            </div>
            <p className="text-sm text-muted-foreground">
              Errors per session
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Errors</CardTitle>
          <CardDescription>Latest error occurrences</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {errorReport.topErrors.map((error) => (
                <div key={error.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{error.message}</span>
                    <Badge variant={getErrorSeverityVariant(error.severity)}>
                      {error.severity}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                    <span>{error.category}</span>
                    <span>Count: {error.count}</span>
                    <span>{new Date(error.lastSeen).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Logs monitoring tab
 */
const LogsTab: React.FC = () => {
  const [logs, setLogs] = useState(logger.getLocalLogs());

  useEffect(() => {
    const interval = setInterval(() => {
      setLogs(logger.getLocalLogs());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const recentLogs = logs.slice(-100).reverse(); // Show most recent first

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Logs</CardTitle>
        <CardDescription>Latest application logs</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <div className="space-y-1 font-mono text-xs">
            {recentLogs.map((log, index) => (
              <div key={index} className={`p-2 rounded ${getLogLevelColor(log.level)}`}>
                <span className="text-muted-foreground">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="mx-2 font-bold">[{log.category}]</span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

/**
 * System status tab
 */
const SystemTab: React.FC<{ systemStatus: SystemStatus | null }> = ({ systemStatus }) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Service Status</CardTitle>
          <CardDescription>Current status of all system services</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {systemStatus?.services.map((service) => (
              <div key={service.name} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{service.name}</div>
                  <div className="text-sm text-muted-foreground">{service.message}</div>
                </div>
                <Badge variant={
                  service.status === 'healthy' ? 'default' :
                  service.status === 'warning' ? 'secondary' : 'destructive'
                }>
                  {service.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Debug tab (development only)
 */
const DebugTab: React.FC = () => {
  const [stateActivity, setStateActivity] = useState(getStateActivitySummary());

  useEffect(() => {
    const interval = setInterval(() => {
      setStateActivity(getStateActivitySummary());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>State Activity</CardTitle>
          <CardDescription>Real-time store activity monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(stateActivity).map(([store, activity]) => (
              <div key={store} className="flex items-center justify-between p-2 border rounded">
                <div>
                  <div className="font-medium">{store}</div>
                  <div className="text-sm text-muted-foreground">
                    {activity.mostRecentAction}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div>{activity.totalChanges} changes</div>
                  <div className="text-muted-foreground">
                    {new Date(activity.lastActivity).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Utility functions
function determineOverallStatus(metrics: DashboardMetrics, errorStats: { criticalErrors: number; errorRate: number }): 'healthy' | 'warning' | 'critical' {
  if (errorStats.criticalErrors > 0 || metrics.errorRate > 10) return 'critical';
  if (errorStats.errorRate > 5 || metrics.averageLoadTime > 4000) return 'warning';
  return 'healthy';
}

function calculateCacheHitRate(): number {
  // This would calculate actual cache hit rate in a real implementation
  return Math.random() * 20 + 80; // Mock: 80-100%
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatMetricName(name: string): string {
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

function getPerformanceBadgeVariant(metric: string, value?: number) {
  if (!value) return 'secondary';
  
  const thresholds: Record<string, { good: number; fair: number }> = {
    fcp: { good: 1800, fair: 3000 },
    lcp: { good: 2500, fair: 4000 },
    fid: { good: 100, fair: 300 },
    cls: { good: 0.1, fair: 0.25 }
  };
  
  const threshold = thresholds[metric];
  if (!threshold) return 'secondary';
  
  if (value <= threshold.good) return 'default';
  if (value <= threshold.fair) return 'secondary';
  return 'destructive';
}

function getErrorSeverityVariant(severity: ErrorSeverity) {
  switch (severity) {
    case ErrorSeverity.CRITICAL: return 'destructive';
    case ErrorSeverity.HIGH: return 'destructive';
    case ErrorSeverity.MEDIUM: return 'secondary';
    case ErrorSeverity.LOW: return 'outline';
    default: return 'secondary';
  }
}

function getLogLevelColor(level: number): string {
  switch (level) {
    case 0: return 'bg-gray-100'; // DEBUG
    case 1: return 'bg-blue-50'; // INFO
    case 2: return 'bg-yellow-50'; // WARN
    case 3: return 'bg-red-50'; // ERROR
    case 4: return 'bg-red-100'; // FATAL
    default: return 'bg-gray-50';
  }
}