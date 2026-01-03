import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  Settings, 
  Bell, 
  BarChart3,
  Monitor,
  Users,
  Calendar,
  Trophy,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useSyncStore } from '@/store/syncStore';
import { cn } from '@/lib/utils';

// Import dashboard components
import { SyncOverviewWidget } from './SyncOverviewWidget';
import { GlobalSyncControls } from './GlobalSyncControls';
import { SyncNotificationCenter } from './SyncNotificationCenter';
import { SyncAnalyticsDashboard } from './SyncAnalyticsDashboard';

// Import existing sync dashboards
import { ShowSyncDashboard } from '../dashboard/ShowSyncDashboard';
import { EntrySyncMetrics } from '../dashboard/EntrySyncMetrics';
import { JudgeSyncDashboard } from '../dashboard/JudgeSyncDashboard';

interface ComprehensiveSyncDashboardProps {
  className?: string;
}

export const ComprehensiveSyncDashboard: React.FC<ComprehensiveSyncDashboardProps> = ({ 
  className 
}) => {
  const { user } = useAuth();
  const { operations, syncStats } = useSyncStore();
  const [activeTab, setActiveTab] = useState('overview');

  // Get role-based tabs
  const getRoleBasedTabs = () => {
    const baseTabs = [
      { value: 'overview', label: 'Overview', icon: Monitor },
      { value: 'controls', label: 'Controls', icon: Settings },
      { value: 'notifications', label: 'Notifications', icon: Bell },
      { value: 'analytics', label: 'Analytics', icon: BarChart3 }
    ];

    // Add role-specific tabs
    if (user?.role === 'secretary' || user?.role === 'admin') {
      baseTabs.push(
        { value: 'shows', label: 'Shows', icon: Calendar },
        { value: 'entries', label: 'Entries', icon: Users }
      );
    }

    if (user?.role === 'judge' || user?.role === 'admin') {
      baseTabs.push(
        { value: 'scoring', label: 'Scoring', icon: Trophy }
      );
    }

    return baseTabs;
  };

  const tabs = getRoleBasedTabs();

  // Calculate system health
  const getSystemHealth = () => {
    const activeOps = operations.filter(op => op.status === 'syncing').length;
    const failedOps = operations.filter(op => op.status === 'error').length;
    const totalOps = operations.length;

    if (failedOps > totalOps * 0.1) return 'critical';
    if (failedOps > 0 || activeOps > 5) return 'warning';
    return 'healthy';
  };

  const systemHealth = getSystemHealth();

  return (
    <div className={cn("min-h-screen bg-background", className)}>
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Activity className="h-8 w-8 text-primary" />
                <h1 className="text-3xl font-bold">Sync Dashboard</h1>
                <Badge 
                  variant={systemHealth === 'healthy' ? 'default' : 
                          systemHealth === 'warning' ? 'secondary' : 'destructive'}
                  className="px-3 py-1"
                >
                  {systemHealth === 'healthy' ? 'All Systems Operational' :
                   systemHealth === 'warning' ? 'Minor Issues' : 'Critical Issues'}
                </Badge>
              </div>
              <p className="text-muted-foreground text-lg">
                Comprehensive sync monitoring and control center
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Welcome back</p>
                <p className="font-medium">{user?.email?.split('@')[0] || 'User'}</p>
                <Badge variant="outline" className="text-xs">
                  {user?.role || 'Unknown'}
                </Badge>
              </div>
              
              {systemHealth === 'critical' && (
                <Button variant="destructive" size="sm">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Action Required
                </Button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8"
        >
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Operations</p>
                  <p className="text-2xl font-bold">
                    {operations.filter(op => op.status === 'syncing').length}
                  </p>
                </div>
                <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold">{(syncStats as { successRate?: number }).successRate || 0}%</p>
                </div>
                <BarChart3 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Synced</p>
                  <p className="text-2xl font-bold">{((syncStats as { totalSynced?: number }).totalSynced || 0).toLocaleString()}</p>
                </div>
                <Activity className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Response</p>
                  <p className="text-2xl font-bold">{Math.round((syncStats as { avgResponseTime?: number }).avgResponseTime || 245)}ms</p>
                </div>
                <Monitor className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Dashboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 bg-muted/50">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2">
                  <SyncOverviewWidget />
                </div>
                <div>
                  <SyncNotificationCenter />
                </div>
              </div>
            </TabsContent>

            {/* Controls Tab */}
            <TabsContent value="controls" className="space-y-6">
              <GlobalSyncControls />
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="space-y-6">
              <SyncNotificationCenter />
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="space-y-6">
              <SyncAnalyticsDashboard />
            </TabsContent>

            {/* Shows Tab */}
            <TabsContent value="shows" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Show Sync Management
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ShowSyncDashboard />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Entries Tab */}
            <TabsContent value="entries" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Entry Sync Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EntrySyncMetrics />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Scoring Tab */}
            <TabsContent value="scoring" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    Judge Sync Dashboard
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <JudgeSyncDashboard />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 pt-6 border-t border-border/50"
        >
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>MyK9Show Sync Dashboard v2.0</p>
            <p>Last updated: {new Date().toLocaleString()}</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};