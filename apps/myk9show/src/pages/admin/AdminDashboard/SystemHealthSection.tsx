/**
 * SystemHealthSection Components
 *
 * Components for displaying system health metrics, performance overview,
 * recent activity timeline, and system status.
 */

import { useState } from 'react';
import {
  Activity,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  Server,
  Trophy,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  CollapsibleSystemHealthProps,
  PerformanceOverviewProps,
  RecentActivityProps,
  SystemStatusProps,
  ActivityType,
  PerformanceItem,
} from './admin-dashboard-types';

const APPLE_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif';

/**
 * Loading skeleton for performance overview
 */
function PerformanceOverviewSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between p-3 rounded-lg bg-muted/30 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-200" />
            <div className="h-4 bg-gray-200 rounded w-20" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * Performance Overview Component
 */
export function PerformanceOverview({ performance, isLoading }: PerformanceOverviewProps) {
  if (isLoading || !performance) {
    return <PerformanceOverviewSkeleton />;
  }

  const performanceItems: PerformanceItem[] = [
    {
      label: 'Memory Usage',
      value: `${performance.memoryUsage}%`,
      status:
        performance.memoryUsage > 80
          ? 'error'
          : performance.memoryUsage > 60
            ? 'warning'
            : 'healthy',
      icon: Cpu,
      color:
        performance.memoryUsage > 80
          ? 'text-error-red'
          : performance.memoryUsage > 60
            ? 'text-warning-orange'
            : 'text-success-green',
    },
    {
      label: 'Network Latency',
      value: `${performance.networkLatency}ms`,
      status:
        performance.networkLatency > 200
          ? 'error'
          : performance.networkLatency > 100
            ? 'warning'
            : 'healthy',
      icon: Wifi,
      color:
        performance.networkLatency > 200
          ? 'text-error-red'
          : performance.networkLatency > 100
            ? 'text-warning-orange'
            : 'text-success-green',
    },
    {
      label: 'Page Load Time',
      value: `${performance.pageLoadTime}ms`,
      status:
        performance.pageLoadTime > 3000
          ? 'error'
          : performance.pageLoadTime > 1500
            ? 'warning'
            : 'healthy',
      icon: Zap,
      color:
        performance.pageLoadTime > 3000
          ? 'text-error-red'
          : performance.pageLoadTime > 1500
            ? 'text-warning-orange'
            : 'text-success-green',
    },
    {
      label: 'Active Connections',
      value: performance.activeConnections.toString(),
      status: 'healthy',
      icon: Server,
      color: 'text-primary',
    },
  ];

  return (
    <div className="space-y-3">
      {performanceItems.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 shadow-sm">
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </div>
            <span className="text-sm font-medium">{item.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">{item.value}</span>
            <div
              className={`w-2 h-2 rounded-full ${
                item.status === 'healthy'
                  ? 'bg-success-green'
                  : item.status === 'warning'
                    ? 'bg-warning-orange'
                    : 'bg-error-red'
              }`}
            />
          </div>
        </div>
      ))}

      {performance.errorRate > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-error-red/10 border border-error-red/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-error-red">Error Rate</span>
            <span className="text-sm font-mono text-error-red">
              {performance.errorRate.toFixed(2)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Loading skeleton for recent activity
 */
function RecentActivitySkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="w-8 h-8 rounded-full bg-gray-200" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded mb-2" />
            <div className="h-3 bg-gray-200 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Recent Activity Timeline Component
 */
export function RecentActivity({ shows, users, isLoading }: RecentActivityProps) {
  if (isLoading) {
    return <RecentActivitySkeleton />;
  }

  // Generate recent activities from real data
  const recentShows = shows.slice(0, 2).map((show) => ({
    id: `show-${show.id}`,
    type: 'success' as ActivityType,
    icon: Trophy,
    title: 'Show scheduled',
    description: `${show.name} at ${show.location}`,
    timestamp: new Date(show.startDate).toLocaleDateString(),
  }));

  const activities = [
    ...recentShows,
    {
      id: 'users-stat',
      type: 'info' as ActivityType,
      icon: Users,
      title: 'Total Users',
      description: `${users.length} users in the system`,
      timestamp: 'Current',
    },
    {
      id: 'system-status',
      type: 'success' as ActivityType,
      icon: Activity,
      title: 'System Status',
      description: 'All services running normally',
      timestamp: 'Live',
    },
  ].slice(0, 3);

  return (
    <div className="space-y-4">
      {activities.map((activity, index) => (
        <div key={activity.id} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                activity.type === 'success'
                  ? 'bg-success-green/10 text-success-green'
                  : activity.type === 'warning'
                    ? 'bg-warning-orange/10 text-warning-orange'
                    : activity.type === 'error'
                      ? 'bg-error-red/10 text-error-red'
                      : 'bg-primary/10 text-primary'
              }`}
            >
              <activity.icon className="h-4 w-4" />
            </div>
            {index < activities.length - 1 && <div className="w-0.5 h-8 bg-border mt-2" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{activity.title}</p>
                <p className="text-sm text-muted-foreground mt-1">{activity.description}</p>
              </div>
              <time className="text-xs text-muted-foreground">{activity.timestamp}</time>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * System Status Component
 */
export function SystemStatus({ healthMetrics, hasError, isLoading }: SystemStatusProps) {
  // If health metrics are available, use them; otherwise fall back to basic status
  const statusItems = healthMetrics
    ? [
        {
          label: 'Database',
          status: healthMetrics.database.status,
          uptime: `${healthMetrics.database.uptime.toFixed(1)}%`,
          responseTime: `${healthMetrics.database.responseTime}ms`,
          lastError: healthMetrics.database.lastError,
        },
        {
          label: 'API Services',
          status: healthMetrics.api.status,
          uptime: `${healthMetrics.api.uptime.toFixed(1)}%`,
          responseTime: `${healthMetrics.api.responseTime}ms`,
          lastError: healthMetrics.api.lastError,
        },
        {
          label: 'Authentication',
          status: healthMetrics.authentication.status,
          uptime: `${healthMetrics.authentication.uptime.toFixed(1)}%`,
          responseTime: `${healthMetrics.authentication.responseTime}ms`,
          lastError: healthMetrics.authentication.lastError,
        },
        {
          label: 'Storage',
          status: healthMetrics.storage.status,
          uptime: `${healthMetrics.storage.uptime.toFixed(1)}%`,
          responseTime: `${healthMetrics.storage.responseTime}ms`,
          lastError: healthMetrics.storage.lastError,
        },
      ]
    : [
        // Fallback to basic status when health service is not available
        {
          label: 'Database',
          status: hasError ? 'error' : 'healthy',
          uptime: hasError ? 'Connection Error' : 'Checking...',
          responseTime: 'N/A',
        },
        {
          label: 'User Management',
          status: isLoading ? 'warning' : 'healthy',
          uptime: isLoading ? 'Loading...' : 'Checking...',
          responseTime: 'N/A',
        },
        {
          label: 'Show Management',
          status: isLoading ? 'warning' : 'healthy',
          uptime: isLoading ? 'Loading...' : 'Checking...',
          responseTime: 'N/A',
        },
        {
          label: 'System Status',
          status: 'healthy',
          uptime: 'Checking...',
          responseTime: 'N/A',
        },
      ];

  return (
    <div className="space-y-3">
      {statusItems.map((item) => (
        <div
          key={item.label}
          className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full ${
                item.status === 'healthy'
                  ? 'bg-success-green'
                  : item.status === 'warning'
                    ? 'bg-warning-orange'
                    : 'bg-error-red'
              }`}
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{item.label}</span>
              {'lastError' in item && item.lastError && (
                <span
                  className="text-xs text-error-red truncate max-w-[150px]"
                  title={item.lastError}
                >
                  {item.lastError}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{item.uptime}</span>
              <Badge
                variant={
                  item.status === 'healthy'
                    ? 'default'
                    : item.status === 'error'
                      ? 'destructive'
                      : 'secondary'
                }
                className="text-xs"
              >
                {item.status}
              </Badge>
            </div>
            {item.responseTime && item.responseTime !== 'N/A' && (
              <span className="text-xs text-muted-foreground">{item.responseTime}</span>
            )}
          </div>
        </div>
      ))}

      {healthMetrics && (
        <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Health</span>
            <Badge
              variant={
                healthMetrics.overallHealth === 'healthy'
                  ? 'default'
                  : healthMetrics.overallHealth === 'degraded'
                    ? 'secondary'
                    : 'destructive'
              }
              className="text-xs capitalize"
            >
              {healthMetrics.overallHealth}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Last checked: {healthMetrics.lastChecked.toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Collapsible System Health Section
 */
export function CollapsibleSystemHealth({
  healthMetrics,
  hasError,
  isLoading,
  shows,
  users,
}: CollapsibleSystemHealthProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-16">
      <div
        className="flex items-center justify-between cursor-pointer p-5 rounded-2xl border border-border
                   bg-gradient-to-br from-card to-card/80 hover:shadow-lg hover:-translate-y-0.5
                   transition-all duration-300 mb-6 backdrop-blur-xl shadow-sm"
        style={{
          fontFamily: APPLE_FONT_FAMILY,
          transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-slate-500/20 to-slate-500/10 rounded-xl shadow-sm">
            <Server className="h-6 w-6 text-slate-600" />
          </div>
          <div>
            <h2 className="text-xl" style={{ fontWeight: 590, lineHeight: '1.3' }}>
              System Health & Performance
            </h2>
            <p className="text-sm text-muted-foreground" style={{ fontWeight: 500 }}>
              All systems operational • Click to {isExpanded ? 'collapse' : 'expand'} details
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-sm text-muted-foreground" style={{ fontWeight: 500 }}>
              Healthy
            </span>
          </div>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-300" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform duration-300" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-top-4 duration-300">
          {/* Performance Overview Card */}
          <div className="lg:col-span-1">
            <Card
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                         border border-border rounded-2xl shadow-sm backdrop-blur-xl
                         transition-all duration-500 hover:shadow-xl hover:scale-[1.01] hover:-translate-y-1 h-full"
            >
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />
              <CardHeader className="relative pb-6">
                <CardTitle className="flex items-center gap-3 group-hover:text-primary transition-colors duration-300 text-lg">
                  <div className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg shadow-sm">
                    <BarChart3 className="h-5 w-5 text-primary" />
                  </div>
                  Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="relative">
                {/* Key Performance Metric */}
                <div className="text-center py-8 border-b border-border/50 mb-6">
                  <div className="text-4xl font-bold mb-2">
                    {healthMetrics ? `${healthMetrics.performance.memoryUsage}%` : 'Loading...'}
                  </div>
                  <div className="text-sm text-muted-foreground font-medium">Memory Usage</div>
                  {healthMetrics && (
                    <div className="text-xs text-muted-foreground mt-2 space-x-3">
                      <span>{healthMetrics.performance.networkLatency}ms latency</span>
                      <span>•</span>
                      <span>{healthMetrics.performance.activeConnections} connections</span>
                    </div>
                  )}
                </div>
                <PerformanceOverview
                  performance={healthMetrics?.performance || null}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          </div>

          {/* System Status Card */}
          <div className="lg:col-span-1">
            <Card
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                         border border-border rounded-2xl shadow-sm backdrop-blur-xl
                         transition-all duration-500 hover:shadow-xl hover:scale-[1.01] hover:-translate-y-1 h-full"
            >
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />
              <CardHeader className="relative pb-6">
                <CardTitle className="flex items-center gap-3 group-hover:text-primary transition-colors duration-300 text-lg">
                  <div className="p-2 bg-gradient-to-br from-success-green/20 to-success-green/10 rounded-lg shadow-sm">
                    <Activity className="h-5 w-5 text-success-green" />
                  </div>
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="relative">
                <SystemStatus
                  healthMetrics={healthMetrics}
                  hasError={!!hasError}
                  isLoading={isLoading}
                />
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity Card */}
          <div className="lg:col-span-1">
            <Card
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80
                         border border-border rounded-2xl shadow-sm backdrop-blur-xl
                         transition-all duration-500 hover:shadow-xl hover:scale-[1.01] hover:-translate-y-1 h-full"
            >
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent
                           opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />
              <CardHeader className="relative pb-6">
                <CardTitle className="flex items-center gap-3 group-hover:text-primary transition-colors duration-300 text-lg">
                  <div className="p-2 bg-gradient-to-br from-secondary/20 to-secondary/10 rounded-lg shadow-sm">
                    <Clock className="h-5 w-5 text-secondary" />
                  </div>
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="relative">
                <RecentActivity shows={shows} users={users} isLoading={isLoading} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
