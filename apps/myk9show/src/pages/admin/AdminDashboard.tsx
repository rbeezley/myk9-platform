import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Calendar, 
  Trophy, 
  TrendingUp, 
  AlertCircle, 
  Activity,
  FileText,
  Settings,
  BarChart3,
  Clock,
  Cpu,
  Wifi,
  Zap,
  Server,
  ChevronDown,
  ChevronRight,
  // UserCheck,
  // Timer,
  DollarSign
  // Flag
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Real database hooks
import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
import { useShowsQuery, useShowStatisticsQuery } from '@/hooks/queries/useShowsDatabase';
import { useDogsQuery } from '@/hooks/queries/useDogsDatabase';

// System health monitoring
import { systemHealthService, SystemHealthMetrics, PerformanceMetrics } from '@/services/SystemHealthService';
import { Show } from '@/types/show-types';
import { User } from '@/types/user-types';

// Apple-inspired Stats Card Component with premium styling and perfect proportions
const StatsCard = ({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  trendValue,
  // priority = 'normal',
  actionable = false,
  onClick
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  priority?: 'urgent' | 'high' | 'normal';
  actionable?: boolean;
  onClick?: () => void;
}) => (
  <div 
    className={`group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                transition-all duration-300 hover:shadow-xl hover:-translate-y-1 
                min-h-[140px] ${actionable ? 'cursor-pointer' : ''}`}
    style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
      transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    }}
    onClick={actionable ? onClick : undefined}
  >
    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                     opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    <div className="relative h-full flex flex-col justify-between">
      {/* Header with Icon */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2" 
             style={{ fontWeight: 590, letterSpacing: '0.02em' }}>
            {title}
          </p>
        </div>
        <div className="p-2.5 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm 
                        group-hover:shadow-lg group-hover:scale-105 transition-all duration-300">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
      
      {/* Main Value */}
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-2xl font-bold mb-1 group-hover:text-primary transition-colors duration-300"
           style={{ fontWeight: 650, lineHeight: '1.25' }}>
          {value}
        </p>
        {subtitle && (
          <p className="text-sm text-muted-foreground" style={{ fontWeight: 500 }}>
            {subtitle}
          </p>
        )}
      </div>
      
      {/* Trend Information */}
      {trend && trendValue && (
        <div className={`flex items-center text-sm mt-3 ${
          trend === 'up' ? 'text-emerald-600' : 
          trend === 'down' ? 'text-red-500' : 
          'text-muted-foreground'
        }`} style={{ fontWeight: 500 }}>
          {trend === 'up' && <TrendingUp className="h-4 w-4 mr-1.5" />}
          {trend === 'down' && <TrendingUp className="h-4 w-4 mr-1.5 rotate-180" />}
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  </div>
);

/* 
// Urgent Actions Component for Secretary Workflows
const UrgentActions = ({ shows, isLoading }: { shows: Show[], isLoading: boolean }) => {
  const now = new Date();
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  // Calculate urgent items based on show data
  const urgentDeadlines = shows.filter(show => {
    const entryCloseDate = new Date(show.entryCloseDate);
    return entryCloseDate <= oneWeekFromNow && entryCloseDate > now && show.status === 'upcoming';
  });

  const showsWithoutJudges = shows.filter(show => 
    show.status === 'upcoming' && 
    (!show.assignedJudges || show.assignedJudges.length === 0)
  );

  const showsAtCapacity = shows.filter(show => 
    show.status === 'upcoming' && 
    show.maxTotalEntries && 
    show.entryCount >= show.maxTotalEntries * 0.9 // 90% capacity
  );

  const urgentActions = [
    {
      id: 'entry-deadlines',
      title: 'Entry Deadlines This Week',
      count: urgentDeadlines.length,
      priority: 'urgent' as const,
      icon: Timer,
      description: `${urgentDeadlines.length} show${urgentDeadlines.length !== 1 ? 's' : ''} closing entries soon`,
      action: 'Review Entry Status'
    },
    {
      id: 'judge-assignments',
      title: 'Shows Missing Judges',
      count: showsWithoutJudges.length,
      priority: 'high' as const,
      icon: UserCheck,
      description: `${showsWithoutJudges.length} upcoming show${showsWithoutJudges.length !== 1 ? 's need' : ' needs'} judge assignments`,
      action: 'Assign Judges'
    },
    {
      id: 'capacity-alerts',
      title: 'Shows Near Capacity',
      count: showsAtCapacity.length,
      priority: 'high' as const,
      icon: Flag,
      description: `${showsAtCapacity.length} show${showsAtCapacity.length !== 1 ? 's are' : ' is'} approaching entry limits`,
      action: 'Manage Waitlist'
    }
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gradient-to-br from-card to-card/80 border border-border 
                                  rounded-2xl p-6 shadow-sm backdrop-blur-xl">
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 bg-muted rounded-xl animate-pulse" />
                <div className="w-12 h-5 bg-muted rounded-full animate-pulse" />
              </div>
              <div className="space-y-2">
                <div className="w-24 h-4 bg-muted rounded animate-pulse" />
                <div className="w-32 h-3 bg-muted rounded animate-pulse" />
              </div>
              <div className="flex items-center justify-between">
                <div className="w-20 h-7 bg-muted rounded-lg animate-pulse" />
                <div className="w-4 h-4 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {urgentActions.map((action) => (
        <div
          key={action.id}
          className={`group relative overflow-hidden p-6 rounded-xl border backdrop-blur-xl shadow-sm 
                      transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:-translate-y-1 ${
            action.priority === 'urgent' 
              ? 'border-error-red/30 bg-gradient-to-br from-error-red/10 to-error-red/5 hover:border-error-red/50 hover:shadow-error-red/20' 
              : 'border-warning-orange/30 bg-gradient-to-br from-warning-orange/10 to-warning-orange/5 hover:border-warning-orange/50 hover:shadow-warning-orange/20'
          } hover:shadow-xl`}
        >
          <div className={`absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${
            action.priority === 'urgent' ? 'from-error-red/15 to-transparent' : 'from-warning-orange/15 to-transparent'
          }`} />
          
          <div className="relative">
            <div className="flex items-start justify-between mb-4">
              <div className={`p-3 rounded-lg shadow-sm ${
                action.priority === 'urgent' 
                  ? 'bg-error-red/20 text-error-red' 
                  : 'bg-warning-orange/20 text-warning-orange'
              }`}>
                <action.icon className="h-5 w-5" />
              </div>
              <Badge 
                variant={action.priority === 'urgent' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {action.count}
              </Badge>
            </div>
            
            <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors">
              {action.title}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">{action.description}</p>
            
            <div className="flex items-center justify-between">
              <Button 
                size="sm" 
                variant="outline"
                className={`text-xs border-current ${
                  action.priority === 'urgent' ? 'text-error-red hover:bg-error-red/10' : 'text-warning-orange hover:bg-warning-orange/10'
                }`}
              >
                {action.action}
              </Button>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
*/

// Collapsible System Health Component
const CollapsibleSystemHealth = ({ 
  healthMetrics, 
  hasError, 
  isLoading,
  shows,
  users
}: { 
  healthMetrics: SystemHealthMetrics | null; 
  hasError: boolean; 
  isLoading: boolean;
  shows: Show[];
  users: User[];
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-16">
      <div 
        className="flex items-center justify-between cursor-pointer p-5 rounded-2xl border border-border 
                   bg-gradient-to-br from-card to-card/80 hover:shadow-lg hover:-translate-y-0.5 
                   transition-all duration-300 mb-6 backdrop-blur-xl shadow-sm"
        style={{ 
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
          transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
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
            <span className="text-sm text-muted-foreground" style={{ fontWeight: 500 }}>Healthy</span>
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
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                           transition-all duration-500 hover:shadow-xl hover:scale-[1.01] hover:-translate-y-1 h-full">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
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
                    {healthMetrics ? `${healthMetrics.performance.memoryUsage}%` : "Loading..."}
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
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                           transition-all duration-500 hover:shadow-xl hover:scale-[1.01] hover:-translate-y-1 h-full">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
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
            <Card className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                           transition-all duration-500 hover:shadow-xl hover:scale-[1.01] hover:-translate-y-1 h-full">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
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
};

// Performance Overview Component
const PerformanceOverview = ({ 
  performance, 
  isLoading 
}: { 
  performance: PerformanceMetrics | null; 
  isLoading: boolean; 
}) => {
  if (isLoading || !performance) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-200"></div>
              <div className="h-4 bg-gray-200 rounded w-20"></div>
            </div>
            <div className="h-4 bg-gray-200 rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  const performanceItems = [
    {
      label: 'Memory Usage',
      value: `${performance.memoryUsage}%`,
      status: performance.memoryUsage > 80 ? 'error' : performance.memoryUsage > 60 ? 'warning' : 'healthy',
      icon: Cpu,
      color: performance.memoryUsage > 80 ? 'text-error-red' : performance.memoryUsage > 60 ? 'text-warning-orange' : 'text-success-green'
    },
    {
      label: 'Network Latency',
      value: `${performance.networkLatency}ms`,
      status: performance.networkLatency > 200 ? 'error' : performance.networkLatency > 100 ? 'warning' : 'healthy',
      icon: Wifi,
      color: performance.networkLatency > 200 ? 'text-error-red' : performance.networkLatency > 100 ? 'text-warning-orange' : 'text-success-green'
    },
    {
      label: 'Page Load Time',
      value: `${performance.pageLoadTime}ms`,
      status: performance.pageLoadTime > 3000 ? 'error' : performance.pageLoadTime > 1500 ? 'warning' : 'healthy',
      icon: Zap,
      color: performance.pageLoadTime > 3000 ? 'text-error-red' : performance.pageLoadTime > 1500 ? 'text-warning-orange' : 'text-success-green'
    },
    {
      label: 'Active Connections',
      value: performance.activeConnections.toString(),
      status: 'healthy',
      icon: Server,
      color: 'text-primary'
    }
  ];

  return (
    <div className="space-y-3">
      {performanceItems.map((item) => (
        <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 shadow-sm`}>
              <item.icon className={`h-4 w-4 ${item.color}`} />
            </div>
            <span className="text-sm font-medium">{item.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">{item.value}</span>
            <div className={`w-2 h-2 rounded-full ${
              item.status === 'healthy' ? 'bg-success-green' :
              item.status === 'warning' ? 'bg-warning-orange' :
              'bg-error-red'
            }`} />
          </div>
        </div>
      ))}
      
      {performance.errorRate > 0 && (
        <div className="mt-4 p-3 rounded-lg bg-error-red/10 border border-error-red/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-error-red">Error Rate</span>
            <span className="text-sm font-mono text-error-red">{performance.errorRate.toFixed(2)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

// Types for activity status
type ActivityType = 'success' | 'info' | 'warning' | 'error';

// Recent Activity Timeline Component
const RecentActivity = ({ shows, users, isLoading }: { shows: Show[], users: User[], isLoading: boolean }) => {
  // Generate recent activities from real data
  const recentShows = shows.slice(0, 2).map(show => ({
    id: `show-${show.id}`,
    type: 'success' as ActivityType,
    icon: Trophy,
    title: 'Show scheduled',
    description: `${show.name} at ${show.location}`,
    timestamp: new Date(show.startDate).toLocaleDateString()
  }));

  const activities = [
    ...recentShows,
    {
      id: 'users-stat',
      type: 'info' as ActivityType,
      icon: Users,
      title: 'Total Users',
      description: `${users.length} users in the system`,
      timestamp: 'Current'
    },
    {
      id: 'system-status',
      type: 'success' as ActivityType,
      icon: Activity,
      title: 'System Status',
      description: 'All services running normally',
      timestamp: 'Live'
    }
  ].slice(0, 3);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-gray-200"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((activity, index) => (
        <div key={activity.id} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              activity.type === 'success' ? 'bg-success-green/10 text-success-green' :
              activity.type === 'warning' ? 'bg-warning-orange/10 text-warning-orange' :
              activity.type === 'error' ? 'bg-error-red/10 text-error-red' :
              'bg-primary/10 text-primary'
            }`}>
              <activity.icon className="h-4 w-4" />
            </div>
            {index < activities.length - 1 && (
              <div className="w-0.5 h-8 bg-border mt-2" />
            )}
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
};

// System Status Component with real health monitoring
const SystemStatus = ({ 
  healthMetrics, 
  hasError, 
  isLoading 
}: { 
  healthMetrics: SystemHealthMetrics | null; 
  hasError: boolean; 
  isLoading: boolean; 
}) => {
  // If health metrics are available, use them; otherwise fall back to basic status
  const statusItems = healthMetrics ? [
    {
      label: 'Database',
      status: healthMetrics.database.status,
      uptime: `${healthMetrics.database.uptime.toFixed(1)}%`,
      responseTime: `${healthMetrics.database.responseTime}ms`,
      lastError: healthMetrics.database.lastError
    },
    {
      label: 'API Services',
      status: healthMetrics.api.status,
      uptime: `${healthMetrics.api.uptime.toFixed(1)}%`,
      responseTime: `${healthMetrics.api.responseTime}ms`,
      lastError: healthMetrics.api.lastError
    },
    {
      label: 'Authentication',
      status: healthMetrics.authentication.status,
      uptime: `${healthMetrics.authentication.uptime.toFixed(1)}%`,
      responseTime: `${healthMetrics.authentication.responseTime}ms`,
      lastError: healthMetrics.authentication.lastError
    },
    {
      label: 'Storage',
      status: healthMetrics.storage.status,
      uptime: `${healthMetrics.storage.uptime.toFixed(1)}%`,
      responseTime: `${healthMetrics.storage.responseTime}ms`,
      lastError: healthMetrics.storage.lastError
    }
  ] : [
    // Fallback to basic status when health service is not available
    { 
      label: 'Database', 
      status: hasError ? 'error' : 'healthy', 
      uptime: hasError ? 'Connection Error' : 'Checking...',
      responseTime: 'N/A'
    },
    { 
      label: 'User Management', 
      status: isLoading ? 'warning' : 'healthy', 
      uptime: isLoading ? 'Loading...' : 'Checking...',
      responseTime: 'N/A'
    },
    { 
      label: 'Show Management', 
      status: isLoading ? 'warning' : 'healthy', 
      uptime: isLoading ? 'Loading...' : 'Checking...',
      responseTime: 'N/A'
    },
    { 
      label: 'System Status', 
      status: 'healthy', 
      uptime: 'Checking...',
      responseTime: 'N/A'
    }
  ];

  return (
    <div className="space-y-3">
      {statusItems.map((item) => (
        <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${
              item.status === 'healthy' ? 'bg-success-green' :
              item.status === 'warning' ? 'bg-warning-orange' :
              'bg-error-red'
            }`} />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{item.label}</span>
              {'lastError' in item && item.lastError && (
                <span className="text-xs text-error-red truncate max-w-[150px]" title={item.lastError}>
                  {item.lastError}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{item.uptime}</span>
              <Badge 
                variant={item.status === 'healthy' ? 'default' : item.status === 'error' ? 'destructive' : 'secondary'} 
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
                healthMetrics.overallHealth === 'healthy' ? 'default' : 
                healthMetrics.overallHealth === 'degraded' ? 'secondary' : 
                'destructive'
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
};

const AdminDashboard: React.FC = () => {
  // System health state
  const [healthMetrics, setHealthMetrics] = useState<SystemHealthMetrics | null>(null);
  // const [_healthUpdateInterval, _setHealthUpdateInterval] = useState<NodeJS.Timeout | null>(null);

  // Fetch real data from database
  const { data: users = [], isLoading: usersLoading, error: usersError } = useUsersQuery();
  const { data: shows = [], isLoading: showsLoading, error: showsError } = useShowsQuery();
  const { data: dogs = [], isLoading: dogsLoading, error: dogsError } = useDogsQuery();
  const { data: showStats } = useShowStatisticsQuery();
  // const { data: _upcomingShows = [] } = useUpcomingShowsQuery();
  // const { data: _showsWithEntryCounts = [] } = useShowsWithEntryCountsQuery();

  // Initialize and update health monitoring
  useEffect(() => {
    // Get initial health metrics
    const updateHealthMetrics = () => {
      try {
        const metrics = systemHealthService.getSystemHealth();
        setHealthMetrics(metrics);
      } catch (error) {
        console.warn('Failed to get system health metrics:', error);
        setHealthMetrics(null);
      }
    };

    // Update immediately
    updateHealthMetrics();

    // Set up periodic updates every 30 seconds
    const interval = setInterval(updateHealthMetrics, 30000);
    // _setHealthUpdateInterval(interval);

    // Cleanup on unmount
    return () => {
      if (interval) {
        clearInterval(interval);
      }
      // Note: We don't destroy the health service as other components might be using it
    };
  }, []);

  // Calculate dog show management statistics
  const activeShows = shows.filter(show => show.status === 'active' || show.status === 'upcoming').length;
  const totalUsers = users.length;
  const totalRevenue = (showStats as {totalRevenue?: number})?.totalRevenue || 0;
  
  // Calculate upcoming deadlines (within next 7 days)
  // const now = new Date();
  // const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  // const _upcomingDeadlines = shows.filter(show => {
  //   const entryCloseDate = new Date(show.entryCloseDate);
  //   return entryCloseDate <= oneWeekFromNow && entryCloseDate > now && show.status === 'upcoming';
  // }).length;

  // Calculate shows with entry data
  // const _showsWithEntries = _showsWithEntryCounts.filter(show => show.entryCount > 0).length;
  // const _totalEntries = _showsWithEntryCounts.reduce((total, show) => total + (show.entryCount || 0), 0);

  // Get system uptime from health metrics or fallback
  const systemUptime = healthMetrics 
    ? `${Math.min(
        healthMetrics.database.uptime,
        healthMetrics.api.uptime,
        healthMetrics.authentication.uptime,
        healthMetrics.storage.uptime
      ).toFixed(1)}%`
    : '99.9%';

  // Handle loading states
  const isLoading = usersLoading || showsLoading || dogsLoading;
  const hasError = usersError || showsError || dogsError;

  if (hasError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center" 
             style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}>
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl mb-3" style={{ fontWeight: 590, lineHeight: '1.3' }}>
            Error Loading Dashboard
          </h2>
          <p className="text-muted-foreground" style={{ fontWeight: 500 }}>
            Unable to load dashboard data. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-8 pt-24 pb-12 max-w-8xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-12"
             style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}>
          <div>
            <h1 className="text-4xl tracking-tight mb-3" 
                style={{ fontWeight: 700, lineHeight: '1.15', letterSpacing: '-0.01em' }}>
              System Administration
            </h1>
            <p className="text-lg text-muted-foreground" style={{ fontWeight: 500, lineHeight: '1.4' }}>
              Admin console for platform management, user administration, and system oversight
            </p>
          </div>
          <div className="flex items-center gap-3 mt-6 md:mt-0">
            <Button variant="outline" 
                    className="border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 
                               hover:-translate-y-0.5 transition-all duration-300 shadow-sm rounded-xl px-6 py-2.5"
                    style={{ 
                      fontWeight: 500,
                      transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                    }}>
              <FileText className="h-4 w-4 mr-2" />
              System Report
            </Button>
            <Button className="bg-gradient-to-r from-primary to-secondary text-primary-foreground 
                             hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] 
                             transition-all duration-300 shadow-sm px-6 py-2.5 rounded-xl"
                    style={{ 
                      fontWeight: 500,
                      transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                    }}>
              <Settings className="h-4 w-4 mr-2" />
              System Settings
            </Button>
          </div>
        </div>

        {/* System Administration Section - TOP PRIORITY */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-8"
               style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}>
            <div className="p-3 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl shadow-sm">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl" style={{ fontWeight: 590, lineHeight: '1.25' }}>
                Platform Administration
              </h2>
              <p className="text-sm text-muted-foreground mt-1" style={{ fontWeight: 500 }}>
                System administration and user management overview
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* User Management Card */}
            <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                            border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                            transition-all duration-300 cursor-pointer hover:shadow-xl hover:-translate-y-1"
                 style={{ 
                   fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                   transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                 }}>
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                               opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 shadow-sm 
                                  group-hover:shadow-lg group-hover:scale-105 transition-all duration-300">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="default" className="text-xs" style={{ fontWeight: 590 }}>
                    {users.length}
                  </Badge>
                </div>
                <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors duration-300"
                    style={{ fontWeight: 590, fontSize: '1rem' }}>
                  User Management
                </h3>
                <p className="text-sm text-muted-foreground mb-4" style={{ fontWeight: 500 }}>
                  Manage platform users, roles, and permissions
                </p>
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="outline" 
                          className="text-xs border-primary/20 text-primary hover:bg-primary/5 
                                     hover:border-primary/40 transition-all duration-300 rounded-lg"
                          style={{ fontWeight: 500 }}>
                    Manage Users
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary 
                                          transition-colors duration-300" />
                </div>
              </div>
            </div>
            
            {/* System Health Card */}
            <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                            border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                            transition-all duration-300 cursor-pointer hover:shadow-xl hover:-translate-y-1"
                 style={{ 
                   fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                   transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                 }}>
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent 
                               opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 shadow-sm 
                                  group-hover:shadow-lg group-hover:scale-105 transition-all duration-300">
                    <Activity className="h-5 w-5 text-emerald-600" />
                  </div>
                  <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-700" 
                         style={{ fontWeight: 590 }}>
                    Active
                  </Badge>
                </div>
                <h3 className="font-semibold mb-2 group-hover:text-emerald-600 transition-colors duration-300"
                    style={{ fontWeight: 590, fontSize: '1rem' }}>
                  System Health
                </h3>
                <p className="text-sm text-muted-foreground mb-4" style={{ fontWeight: 500 }}>
                  Monitor performance and system status
                </p>
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="outline" 
                          className="text-xs border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/5 
                                     hover:border-emerald-500/40 transition-all duration-300 rounded-lg"
                          style={{ fontWeight: 500 }}>
                    View Status
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald-600 
                                          transition-colors duration-300" />
                </div>
              </div>
            </div>
            
            {/* System Configuration Card */}
            <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                            border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                            transition-all duration-300 cursor-pointer hover:shadow-xl hover:-translate-y-1"
                 style={{ 
                   fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
                   transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                 }}>
              <div className="absolute inset-0 bg-gradient-to-br from-slate-500/5 to-transparent 
                               opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-slate-500/20 to-slate-500/10 shadow-sm 
                                  group-hover:shadow-lg group-hover:scale-105 transition-all duration-300">
                    <Settings className="h-5 w-5 text-slate-600" />
                  </div>
                  <Badge variant="outline" className="text-xs border-slate-500/20 text-slate-600" 
                         style={{ fontWeight: 590 }}>
                    Config
                  </Badge>
                </div>
                <h3 className="font-semibold mb-2 group-hover:text-slate-600 transition-colors duration-300"
                    style={{ fontWeight: 590, fontSize: '1rem' }}>
                  System Configuration
                </h3>
                <p className="text-sm text-muted-foreground mb-4" style={{ fontWeight: 500 }}>
                  Platform settings and configuration management
                </p>
                <div className="flex items-center justify-between">
                  <Button size="sm" variant="outline" 
                          className="text-xs border-slate-500/20 text-slate-600 hover:bg-slate-500/5 
                                     hover:border-slate-500/40 transition-all duration-300 rounded-lg"
                          style={{ fontWeight: 500 }}>
                    Configure
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-slate-600 
                                          transition-colors duration-300" />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Platform Statistics - HIGH PRIORITY */}
        <div className="mb-16">
          <div className="flex items-center gap-4 mb-8"
               style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif' }}>
            <div className="p-3 bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 rounded-xl shadow-sm">
              <BarChart3 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-2xl" style={{ fontWeight: 590, lineHeight: '1.25' }}>
                Platform Statistics
              </h2>
              <p className="text-sm text-muted-foreground mt-1" style={{ fontWeight: 500 }}>
                Key metrics for platform usage and system performance
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <StatsCard 
              title="Total Users" 
              value={isLoading ? "Loading..." : totalUsers.toString()} 
              icon={Users}
              subtitle="Platform users"
              trend="neutral" 
              trendValue={`All user types`} 
              priority="normal"
              actionable={true}
            />
            <StatsCard 
              title="Active Shows" 
              value={isLoading ? "Loading..." : activeShows.toString()} 
              icon={Calendar}
              subtitle="Currently running"
              trend="neutral" 
              trendValue={`${shows.length} total shows`} 
              priority="normal"
            />
            <StatsCard 
              title="System Uptime" 
              value={systemUptime} 
              icon={Activity}
              subtitle="Platform availability"
              trend="up" 
              trendValue="Last 30 days" 
              priority="normal"
            />
            <StatsCard 
              title="Database Records" 
              value={isLoading ? "Loading..." : (dogs.length + shows.length + users.length).toLocaleString()} 
              icon={Server}
              subtitle="Total data entries"
              trend="up" 
              trendValue={`Growing`} 
              priority="normal"
            />
            <StatsCard 
              title="Platform Revenue" 
              value={isLoading ? "Loading..." : `$${totalRevenue.toLocaleString()}`} 
              icon={DollarSign}
              subtitle="Total collected"
              trend="up" 
              trendValue="All time" 
              priority="normal"
            />
          </div>
        </div>

        {/* Collapsible System Health Section - SECONDARY PRIORITY */}
        <CollapsibleSystemHealth 
          healthMetrics={healthMetrics} 
          hasError={!!hasError} 
          isLoading={isLoading}
          shows={shows}
          users={users}
        />

      </div>
    </div>
  );
};

export default AdminDashboard;