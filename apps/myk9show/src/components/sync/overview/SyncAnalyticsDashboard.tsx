import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
 
  Clock, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Download,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format, subDays } from 'date-fns';
import { useSyncStore } from '@/store/syncStore';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SyncAnalyticsDashboardProps {
  className?: string;
}

interface MetricCard {
  title: string;
  value: string | number;
  change: number;
  trend: 'up' | 'down' | 'stable';
  icon: React.ElementType;
  color: string;
}

export const SyncAnalyticsDashboard: React.FC<SyncAnalyticsDashboardProps> = ({ className }) => {
  const { operations, syncStats, conflicts } = useSyncStore();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  // Generate mock analytics data
  const generateTimeSeriesData = (days: number, type: 'success' | 'error' | 'performance') => {
    const data = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(now, i);
      const baseValue = type === 'performance' ? 
        Math.random() * 1000 + 200 : 
        Math.floor(Math.random() * 50) + 10;
      
      data.push({
        date: format(date, 'MMM dd'),
        value: baseValue,
        success: type === 'success' ? baseValue : Math.floor(Math.random() * 40) + 20,
        error: type === 'error' ? baseValue : Math.floor(Math.random() * 5) + 1,
        performance: type === 'performance' ? baseValue : Math.random() * 800 + 100
      });
    }
    
    return data;
  };

  const syncData = useMemo(() => {
    const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : 30;
    return generateTimeSeriesData(days, 'success');
  }, [timeRange]);

  const performanceData = useMemo(() => {
    const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : 30;
    return generateTimeSeriesData(days, 'performance');
  }, [timeRange]);

  // Calculate metrics
  const metrics: MetricCard[] = [
    {
      title: 'Total Operations',
      value: operations.length.toLocaleString(),
      change: 12.5,
      trend: 'up',
      icon: Activity,
      color: 'text-blue-500'
    },
    {
      title: 'Success Rate',
      value: `${syncStats.successRate}%`,
      change: 3.2,
      trend: 'up',
      icon: CheckCircle2,
      color: 'text-green-500'
    },
    {
      title: 'Avg Response Time',
      value: `${Math.round((syncStats as { avgResponseTime?: number }).avgResponseTime || 245)}ms`,
      change: -8.1,
      trend: 'down',
      icon: Clock,
      color: 'text-orange-500'
    },
    {
      title: 'Active Conflicts',
      value: conflicts.length.toString(),
      change: conflicts.length > 0 ? 25.0 : -15.0,
      trend: conflicts.length > 0 ? 'up' : 'down',
      icon: AlertTriangle,
      color: 'text-red-500'
    }
  ];

  // Sync type distribution
  const syncTypeData = [
    { name: 'Shows', value: 35, color: '#3b82f6' },
    { name: 'Entries', value: 28, color: '#10b981' },
    { name: 'Scoring', value: 22, color: '#f59e0b' },
    { name: 'Other', value: 15, color: '#8b5cf6' }
  ];

  const exportData = () => {
    const data = {
      metrics,
      operations: operations.slice(0, 100), // Limit for export
      syncStats,
      conflicts,
      timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync-analytics-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Sync Analytics</h2>
          <p className="text-muted-foreground">Performance insights and system metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(value: string) => setTimeRange(value as '24h' | '7d' | '30d')}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportData}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
          >
            <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      {metric.title}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold">{metric.value}</span>
                      <div className="flex items-center gap-1">
                        {metric.trend === 'up' ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : metric.trend === 'down' ? (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        ) : null}
                        <span className={cn(
                          "text-xs font-medium",
                          metric.trend === 'up' ? 'text-green-500' : 
                          metric.trend === 'down' ? 'text-red-500' : 
                          'text-muted-foreground'
                        )}>
                          {metric.change > 0 ? '+' : ''}{metric.change}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={cn("p-3 rounded-full bg-muted", metric.color)}>
                    <metric.icon className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="operations" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
        </TabsList>

        {/* Operations Tab */}
        <TabsContent value="operations" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Sync Operations Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={syncData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="success" 
                      stackId="1"
                      stroke="#10b981" 
                      fill="#10b981" 
                      fillOpacity={0.3}
                      name="Successful" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="error" 
                      stackId="1"
                      stroke="#ef4444" 
                      fill="#ef4444" 
                      fillOpacity={0.3}
                      name="Failed" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Response Time Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={performanceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }} 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="performance" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                      name="Response Time (ms)" 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Sync Type Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={syncTypeData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {syncTypeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Sync Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {syncTypeData.map((item) => (
                  <div key={item.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{item.value}%</span>
                    </div>
                    <Progress value={item.value} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Conflicts Tab */}
        <TabsContent value="conflicts" className="space-y-6">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle>Conflict Resolution Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-500" />
                      <span className="font-medium">Active Conflicts</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600 mt-2">{conflicts.length}</p>
                  </div>
                  
                  <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="font-medium">Resolved</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600 mt-2">
                      {Math.floor(Math.random() * 50) + 10}
                    </p>
                  </div>
                  
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-blue-500" />
                      <span className="font-medium">Avg Resolution Time</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-600 mt-2">2.5h</p>
                  </div>
                </div>

                {conflicts.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <p className="text-muted-foreground">No active conflicts detected</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conflicts.slice(0, 5).map((conflict) => (
                      <div key={conflict.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <p className="font-medium">{(conflict as { entityType?: string }).entityType || 'Unknown'} Conflict</p>
                            <p className="text-sm text-muted-foreground">
                              Field: {(conflict as { field?: string }).field || 'Unknown'}
                            </p>
                          </div>
                          <Badge variant="destructive">Pending</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};