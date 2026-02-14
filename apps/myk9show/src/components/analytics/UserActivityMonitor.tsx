/**
 * User Activity Monitor Component
 *
 * Comprehensive user activity tracking and visualization component for monitoring
 * user behavior patterns, sync activities, device usage, and engagement metrics.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { UserMetrics } from './user-activity-types';
import { generateMockSessions, generateHeatmapData } from './user-activity-mock-data';
import { UserActivityHeaderControls } from './UserActivityHeaderControls';
import { UserActivityMetricsCards } from './UserActivityMetricsCards';
import { UserActivityTab } from './UserActivityTab';
import { UserActivityUsersTab } from './UserActivityUsersTab';
import { UserActivityDevicesTab } from './UserActivityDevicesTab';
import { UserActivityFeaturesTab } from './UserActivityFeaturesTab';
import { UserActivityGeographyTab } from './UserActivityGeographyTab';

interface UserActivityMonitorProps {
  className?: string;
}

export function UserActivityMonitor({ className }: UserActivityMonitorProps) {
  const [selectedTimeRange] = useState<string>('7d');
  const [sessions, setSessions] = useState<ReturnType<typeof generateMockSessions>>([]);
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(true);
  const [userFilter, setUserFilter] = useState<string>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // Generate mock data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSessions(generateMockSessions());
      setLoading(false);
    };

    loadData();
  }, [selectedTimeRange]);

  // Calculate user metrics
  const userMetrics: UserMetrics = useMemo(() => {
    const activeSessions = sessions.filter(s => !s.endTime || s.isOnline);
    const totalUsers = new Set(sessions.map(s => s.userId)).size;
    const activeUsers = new Set(activeSessions.map(s => s.userId)).size;

    // Calculate average session duration
    const completedSessions = sessions.filter(s => s.endTime);
    const avgDuration = completedSessions.reduce((acc, s) => acc + s.duration, 0) / completedSessions.length;

    // Calculate device breakdown
    const deviceCounts = sessions.reduce((acc, s) => {
      acc[s.deviceType] = (acc[s.deviceType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const deviceBreakdown = Object.entries(deviceCounts).map(([device, count]) => ({
      device,
      count,
      percentage: (count / sessions.length) * 100
    }));

    // Calculate feature usage
    const featureUsage = sessions.reduce((acc, s) => {
      s.activeFeaturesUsed.forEach(feature => {
        acc[feature] = (acc[feature] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);

    const mostUsedFeatures = Object.entries(featureUsage)
      .map(([feature, usage]) => ({ feature, usage }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 10);

    // Calculate location stats
    const locationStats = sessions
      .filter(s => s.location)
      .reduce((acc, s) => {
        const key = `${s.location!.city}, ${s.location!.country}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const locationStatsArray = Object.entries(locationStats)
      .map(([location, users]) => ({ location, users }))
      .sort((a, b) => b.users - a.users)
      .slice(0, 5);

    return {
      totalUsers,
      activeUsers,
      newUsers: Math.floor(totalUsers * 0.1), // Mock 10% new users
      userRetention: 85, // Mock retention rate
      averageSessionDuration: avgDuration,
      totalSessions: sessions.length,
      syncOperations: sessions.reduce((acc, s) => acc + s.syncCount, 0),
      offlineUsage: sessions.reduce((acc, s) => acc + s.offlineTime, 0),
      mostUsedFeatures,
      deviceBreakdown,
      locationStats: locationStatsArray,
      engagementScore: Math.min(100, (avgDuration / 60) * 20 + (activeUsers / totalUsers) * 30 + 30)
    };
  }, [sessions]);

  // Generate activity heatmap data
  const heatmapData = useMemo(() => generateHeatmapData(sessions), [sessions]);

  // Filter sessions based on selected filters
  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      if (userFilter !== 'all' && session.userRole !== userFilter) return false;
      if (deviceFilter !== 'all' && session.deviceType !== deviceFilter) return false;
      return true;
    });
  }, [sessions, userFilter, deviceFilter]);

  // Generate timeline data
  const timelineData = useMemo(() => {
    const hourlyData = Array.from({ length: 24 }, (_, hour) => {
      const hourSessions = filteredSessions.filter(s => s.startTime.getHours() === hour);
      return {
        hour,
        sessions: hourSessions.length,
        users: new Set(hourSessions.map(s => s.userId)).size,
        syncs: hourSessions.reduce((acc, s) => acc + s.syncCount, 0)
      };
    });

    return hourlyData;
  }, [filteredSessions]);

  // Real-time simulation
  useEffect(() => {
    if (!isRealTimeEnabled) return;

    const interval = setInterval(() => {
      // Simulate real-time updates
      setSessions(prev => prev.map(session => ({
        ...session,
        lastActivity: Math.random() > 0.7 ? new Date() : session.lastActivity,
        isOnline: Math.random() > 0.2 // 80% online rate
      })));
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [isRealTimeEnabled]);

  const handleExportData = useCallback(() => {
    const exportData = {
      metrics: userMetrics,
      sessions: filteredSessions,
      generatedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user-activity-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [userMetrics, filteredSessions]);

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
      <UserActivityHeaderControls
        userFilter={userFilter}
        setUserFilter={setUserFilter}
        deviceFilter={deviceFilter}
        setDeviceFilter={setDeviceFilter}
        isRealTimeEnabled={isRealTimeEnabled}
        setIsRealTimeEnabled={setIsRealTimeEnabled}
        onExport={handleExportData}
      />

      {/* Key Metrics Cards */}
      <UserActivityMetricsCards userMetrics={userMetrics} />

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="activity" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="devices">Devices</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="geography">Geography</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="space-y-6">
          <UserActivityTab timelineData={timelineData} heatmapData={heatmapData} />
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <UserActivityUsersTab filteredSessions={filteredSessions} userMetrics={userMetrics} />
        </TabsContent>

        <TabsContent value="devices" className="space-y-6">
          <UserActivityDevicesTab sessions={sessions} userMetrics={userMetrics} />
        </TabsContent>

        <TabsContent value="features" className="space-y-6">
          <UserActivityFeaturesTab userMetrics={userMetrics} />
        </TabsContent>

        <TabsContent value="geography" className="space-y-6">
          <UserActivityGeographyTab userMetrics={userMetrics} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
