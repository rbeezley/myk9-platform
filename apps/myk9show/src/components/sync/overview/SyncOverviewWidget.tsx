import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  XCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { useSyncStore } from '@/store/syncStore';
import { cn } from '@/lib/utils';

interface SyncMetric {
  label: string;
  value: number;
  total: number;
  trend: 'up' | 'down' | 'stable';
  trendValue: number;
}

interface SyncOverviewWidgetProps {
  className?: string;
}

export const SyncOverviewWidget: React.FC<SyncOverviewWidgetProps> = ({ className }) => {
  const { operations, syncStats } = useSyncStore();

  // Calculate overall sync health
  const calculateSyncHealth = () => {
    const activeOps = operations.filter(op => op.status === 'syncing').length;
    const failedOps = operations.filter(op => op.status === 'error').length;
    const totalOps = operations.length;

    if (failedOps > totalOps * 0.1) return 'critical';
    if (failedOps > 0 || activeOps > 5) return 'warning';
    return 'healthy';
  };

  const syncHealth = calculateSyncHealth();

  // Calculate sync metrics
  const metrics: SyncMetric[] = [
    {
      label: 'Total Synced',
      value: syncStats.totalSynced,
      total: syncStats.totalRecords,
      trend: syncStats.syncTrend > 0 ? 'up' : syncStats.syncTrend < 0 ? 'down' : 'stable',
      trendValue: Math.abs(syncStats.syncTrend)
    },
    {
      label: 'Success Rate',
      value: syncStats.successRate,
      total: 100,
      trend: syncStats.successTrend > 0 ? 'up' : syncStats.successTrend < 0 ? 'down' : 'stable',
      trendValue: Math.abs(syncStats.successTrend)
    },
    {
      label: 'Active Operations',
      value: operations.filter(op => op.status === 'syncing').length,
      total: operations.length,
      trend: 'stable',
      trendValue: 0
    },
    {
      label: 'Conflicts',
      value: syncStats.conflicts,
      total: syncStats.totalSynced,
      trend: syncStats.conflictTrend > 0 ? 'down' : syncStats.conflictTrend < 0 ? 'up' : 'stable',
      trendValue: Math.abs(syncStats.conflictTrend)
    }
  ];

  const healthConfig = {
    healthy: {
      icon: CheckCircle2,
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      label: 'All Systems Operational'
    },
    warning: {
      icon: AlertCircle,
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
      label: 'Minor Issues Detected'
    },
    critical: {
      icon: XCircle,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      label: 'Critical Issues Require Attention'
    }
  };

  const config = healthConfig[syncHealth];
  const Icon = config.icon;

  return (
    <div className={cn("space-y-6", className)}>
      {/* Overall Health Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="border-0 shadow-lg bg-gradient-to-br from-card to-card/80">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-semibold">Sync System Health</CardTitle>
              <div className={cn(
                "p-3 rounded-full",
                config.bg
              )}>
                <Icon className={cn("h-6 w-6", config.color)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge 
                  variant={syncHealth === 'healthy' ? 'default' : syncHealth === 'warning' ? 'secondary' : 'destructive'}
                  className="px-3"
                >
                  {config.label}
                </Badge>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">System Load</span>
                  <span className="font-medium">
                    {Math.round((operations.filter(op => op.status === 'syncing').length / Math.max(operations.length, 1)) * 100)}%
                  </span>
                </div>
                <Progress 
                  value={(operations.filter(op => op.status === 'syncing').length / Math.max(operations.length, 1)) * 100}
                  className="h-2"
                />
              </div>

              <div className="text-xs text-muted-foreground">
                Last sync: {syncStats.lastSync && typeof syncStats.lastSync === 'string' 
                  ? formatDistanceToNow(new Date(syncStats.lastSync), { addSuffix: true }) 
                  : 'Never'}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Sync Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{metric.label}</span>
                    {metric.trend !== 'stable' && (
                      <div className="flex items-center gap-1">
                        {metric.trend === 'up' ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <span className={cn(
                          "text-xs font-medium",
                          metric.trend === 'up' ? 'text-green-500' : 'text-red-500'
                        )}>
                          {metric.trendValue}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-bold">
                        {metric.label === 'Success Rate' ? `${metric.value}%` : metric.value.toLocaleString()}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        / {metric.label === 'Success Rate' ? '100%' : metric.total.toLocaleString()}
                      </span>
                    </div>
                    <Progress 
                      value={(metric.value / metric.total) * 100}
                      className="h-1.5"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {operations.filter(op => op.status === 'syncing').length} operations in progress
              </span>
            </div>
            <Badge variant="outline" className="text-xs">
              Auto-sync enabled
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};