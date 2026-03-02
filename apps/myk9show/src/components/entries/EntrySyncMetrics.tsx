import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart, 
  Bar, 
  // LineChart, 
  // Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  Gauge, 
  // TrendingUp, 
  // TrendingDown, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  RefreshCw,
  Wifi,
  WifiOff,
  // Database,
  Users,
  CreditCard,
  // FileText,
  Timer,
  Activity,
  DollarSign
} from 'lucide-react';
import { useEntryStore } from '@/store/entryStore';

interface SyncMetrics {
  totalEntries: number;
  syncedEntries: number;
  pendingEntries: number;
  errorEntries: number;
  conflictEntries: number;
  syncSuccessRate: number;
  averageSyncTime: number;
  lastSyncAt: Date | null;
  paymentMetrics: {
    pendingPayments: number;
    completedPayments: number;
    failedPayments: number;
    totalRevenue: number;
  };
  performanceMetrics: {
    entriesPerMinute: number;
    peakSyncTime: number;
    offlineTime: number;
    retryRate: number;
  };
}

interface SyncHistory {
  timestamp: Date;
  operation: 'create' | 'update' | 'delete' | 'sync';
  entryId: string;
  duration: number;
  status: 'success' | 'error' | 'pending';
  errorMessage?: string;
}

interface EntrySyncMetricsProps {
  /** Show ID to filter metrics */
  showId?: string;
  /** Time range for metrics */
  timeRange?: '1h' | '24h' | '7d' | '30d';
  /** Refresh interval in seconds */
  refreshInterval?: number;
  /** Custom className */
  className?: string;
}

/**
 * EntrySyncMetrics - Comprehensive metrics dashboard for entry sync operations with Premium design
 * 
 * Displays real-time sync performance, payment processing status, and operational metrics.
 * Provides insights into sync efficiency, error patterns, and system health.
 */
export const EntrySyncMetrics: React.FC<EntrySyncMetricsProps> = ({
  showId,
  timeRange = '24h',
  refreshInterval = 30,
  className = ''
}) => {
  void timeRange; // Suppress unused variable warning
  const [selectedTab, setSelectedTab] = useState('overview');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Mock sync history data (in real app, this would come from sync service)
  const [syncHistory] = useState<SyncHistory[]>(() => {
    const history: SyncHistory[] = [];
    const now = new Date();
    
    // Generate sample data for the last 24 hours
    for (let i = 0; i < 100; i++) {
      const timestamp = new Date(now.getTime() - (i * 15 * 60 * 1000)); // Every 15 minutes
      const hasError = Math.random() <= 0.1;
      history.push({
        timestamp,
        operation: (['create', 'update', 'sync'] as const)[Math.floor(Math.random() * 3)],
        entryId: `entry-${i}`,
        duration: Math.random() * 2000 + 200, // 200-2200ms
        status: Math.random() > 0.1 ? 'success' : 'error',
        ...(hasError && { errorMessage: 'Network timeout' })
      });
    }
    
    return history.reverse();
  });

  // Get entry data from store
  const entries = useEntryStore((state) => state.entries);
  const getSyncStatus = useEntryStore((state) => state.getSyncStatus);

  // Filter entries by show if specified
  const filteredEntries = useMemo(() => {
    return showId ? entries.filter(entry => entry.showId === showId) : entries;
  }, [entries, showId]);

  // Calculate metrics
  const metrics: SyncMetrics = useMemo(() => {
    const total = filteredEntries.length;
    let synced = 0;
    let pending = 0;
    let error = 0;
    let conflict = 0;
    let pendingPayments = 0;
    let completedPayments = 0;
    let failedPayments = 0;
    let totalRevenue = 0;

    filteredEntries.forEach(entry => {
      const syncStatus = getSyncStatus(entry.id);
      
      switch (syncStatus) {
        case 'synced':
          synced++;
          break;
        case 'pending':
          pending++;
          break;
        case 'error':
          error++;
          break;
        case 'conflict':
          conflict++;
          break;
      }

      // Payment metrics
      switch (entry.registrationData.paymentStatus) {
        case 'pending':
          pendingPayments++;
          break;
        case 'paid':
          completedPayments++;
          totalRevenue += entry.registrationData.entryFee;
          break;
        case 'refunded':
          failedPayments++;
          break;
      }
    });

    const successfulSyncs = syncHistory.filter(h => h.status === 'success').length;
    const totalSyncs = syncHistory.length;
    const syncSuccessRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 100;
    
    const avgSyncTime = syncHistory.length > 0 
      ? syncHistory.reduce((sum, h) => sum + h.duration, 0) / syncHistory.length 
      : 0;

    const lastSync = syncHistory.length > 0 ? syncHistory[syncHistory.length - 1].timestamp : null;

    return {
      totalEntries: total,
      syncedEntries: synced,
      pendingEntries: pending,
      errorEntries: error,
      conflictEntries: conflict,
      syncSuccessRate,
      averageSyncTime: avgSyncTime,
      lastSyncAt: lastSync,
      paymentMetrics: {
        pendingPayments,
        completedPayments,
        failedPayments,
        totalRevenue
      },
      performanceMetrics: {
        entriesPerMinute: total > 0 ? (total / 60) : 0, // Simplified calculation
        peakSyncTime: Math.max(...syncHistory.map(h => h.duration), 0),
        offlineTime: 0, // Would be calculated from network status history
        retryRate: error > 0 ? (error / total) * 100 : 0
      }
    };
  }, [filteredEntries, getSyncStatus, syncHistory]);

  // Refresh metrics
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setLastRefresh(new Date());
    
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsRefreshing(false);
  };

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      const interval = setInterval(handleRefresh, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
    return;
  }, [refreshInterval]);

  // Chart data
  const syncTrendData = useMemo(() => {
    const hourly = syncHistory.reduce((acc, item) => {
      const hour = new Date(item.timestamp).getHours();
      const key = `${hour}:00`;
      
      if (!acc[key]) {
        acc[key] = { time: key, success: 0, error: 0 };
      }
      
      if (item.status === 'success') {
        acc[key].success++;
      } else {
        acc[key].error++;
      }
      
      return acc;
    }, {} as Record<string, { time: string; success: number; error: number }>);

    return Object.values(hourly).slice(-12); // Last 12 hours
  }, [syncHistory]);

  const syncStatusData = [
    { name: 'Synced', value: metrics.syncedEntries, color: '#34C759' },
    { name: 'Pending', value: metrics.pendingEntries, color: '#FF9500' },
    { name: 'Error', value: metrics.errorEntries, color: '#FF3B30' },
    { name: 'Conflict', value: metrics.conflictEntries, color: '#FFD700' }
  ];

  const paymentStatusData = [
    { name: 'Completed', value: metrics.paymentMetrics.completedPayments, color: '#34C759' },
    { name: 'Pending', value: metrics.paymentMetrics.pendingPayments, color: '#FF9500' },
    { name: 'Failed', value: metrics.paymentMetrics.failedPayments, color: '#FF3B30' }
  ];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Entry Sync Metrics</h2>
          <p className="text-muted-foreground">
            Monitor sync performance and system health
            {showId && ` for show ${showId}`}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
            <Wifi className="h-3 w-3 mr-1" />
            Online
          </Badge>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Entries</p>
                <p className="text-2xl font-bold text-foreground">{metrics.totalEntries}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sync Success Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {metrics.syncSuccessRate.toFixed(1)}%
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Sync Time</p>
                <p className="text-2xl font-bold text-blue-600">
                  {metrics.averageSyncTime.toFixed(0)}ms
                </p>
              </div>
              <Timer className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold text-green-600">
                  ${metrics.paymentMetrics.totalRevenue.toFixed(2)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sync">Sync Status</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sync Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Sync Activity (Last 12 Hours)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={syncTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="success" fill="#34C759" name="Success" />
                    <Bar dataKey="error" fill="#FF3B30" name="Error" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Status Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="h-5 w-5" />
                  Entry Status Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={syncStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {syncStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sync Status Tab */}
        <TabsContent value="sync" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-green-800">{metrics.syncedEntries}</p>
                <p className="text-sm text-green-600">Synced</p>
              </CardContent>
            </Card>

            <Card className="bg-orange-50 border-orange-200">
              <CardContent className="p-4 text-center">
                <Clock className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-orange-800">{metrics.pendingEntries}</p>
                <p className="text-sm text-orange-600">Pending</p>
              </CardContent>
            </Card>

            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <AlertTriangle className="h-8 w-8 text-red-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-red-800">{metrics.errorEntries}</p>
                <p className="text-sm text-red-600">Errors</p>
              </CardContent>
            </Card>

            <Card className="bg-yellow-50 border-yellow-200">
              <CardContent className="p-4 text-center">
                <AlertTriangle className="h-8 w-8 text-yellow-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-yellow-800">{metrics.conflictEntries}</p>
                <p className="text-sm text-yellow-600">Conflicts</p>
              </CardContent>
            </Card>
          </div>

          {/* Sync Progress Bar */}
          <Card>
            <CardHeader>
              <CardTitle>Sync Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{metrics.syncSuccessRate.toFixed(1)}%</span>
                </div>
                <Progress value={metrics.syncSuccessRate} className="h-3" />
                <div className="text-xs text-muted-foreground">
                  Last sync: {metrics.lastSyncAt ? metrics.lastSyncAt.toLocaleString() : 'Never'}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payment Status Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={paymentStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {paymentStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Payment Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Total Revenue</span>
                  <span className="text-lg font-bold text-green-600">
                    ${metrics.paymentMetrics.totalRevenue.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Completed Payments</span>
                  <span className="font-medium">{metrics.paymentMetrics.completedPayments}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Pending Payments</span>
                  <span className="font-medium text-orange-600">
                    {metrics.paymentMetrics.pendingPayments}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Failed Payments</span>
                  <span className="font-medium text-red-600">
                    {metrics.paymentMetrics.failedPayments}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <Activity className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-blue-800">
                  {metrics.performanceMetrics.entriesPerMinute.toFixed(1)}
                </p>
                <p className="text-sm text-blue-600">Entries/min</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <Timer className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-purple-800">
                  {metrics.performanceMetrics.peakSyncTime.toFixed(0)}ms
                </p>
                <p className="text-sm text-purple-600">Peak Time</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <WifiOff className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-gray-800">
                  {metrics.performanceMetrics.offlineTime.toFixed(1)}h
                </p>
                <p className="text-sm text-gray-600">Offline Time</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center">
                <RefreshCw className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                <p className="text-2xl font-bold text-orange-800">
                  {metrics.performanceMetrics.retryRate.toFixed(1)}%
                </p>
                <p className="text-sm text-orange-600">Retry Rate</p>
              </CardContent>
            </Card>
          </div>

          {/* Performance Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">System Health</span>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-green-600">Excellent</span>
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  Last updated: {lastRefresh.toLocaleTimeString()}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EntrySyncMetrics;