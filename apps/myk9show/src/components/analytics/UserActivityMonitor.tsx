/**
 * User Activity Monitor Component
 * 
 * Comprehensive user activity tracking and visualization component for monitoring
 * user behavior patterns, sync activities, device usage, and engagement metrics.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  RadialBarChart,
  RadialBar
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
// Avatar component placeholder - replace with actual implementation if needed
const Avatar = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("rounded-full bg-muted flex items-center justify-center", className)}>{children}</div>
);
const AvatarFallback = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <span className={cn("text-xs font-medium", className)} data-testid="avatar-fallback">{children}</span>
);
import { Progress } from '@/components/ui/progress';
import {
  Users,
  Activity,
  Clock,
  Smartphone,
  Monitor,
  Tablet,
  Download,
  MapPin,
  Zap,
  UserCheck,
  Wifi,
  WifiOff
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserActivityMonitorProps {
  className?: string;
}

interface UserSession {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  startTime: Date;
  endTime?: Date;
  duration: number; // minutes
  deviceType: 'mobile' | 'tablet' | 'desktop';
  platform: string;
  location?: {
    city: string;
    country: string;
    lat: number;
    lng: number;
  };
  syncCount: number;
  offlineTime: number; // minutes
  activeFeaturesUsed: string[];
  lastActivity: Date;
  isOnline: boolean;
}

interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  userRetention: number;
  averageSessionDuration: number;
  totalSessions: number;
  syncOperations: number;
  offlineUsage: number;
  mostUsedFeatures: Array<{ feature: string; usage: number }>;
  deviceBreakdown: Array<{ device: string; count: number; percentage: number }>;
  locationStats: Array<{ location: string; users: number }>;
  engagementScore: number;
}

interface ActivityHeatmapData {
  hour: number;
  day: string;
  value: number;
  sessions: number;
}

// Mock data generators
const generateMockSessions = (): UserSession[] => {
  const sessions: UserSession[] = [];
  const now = new Date();
  
  const users = [
    { id: '1', name: 'Sarah Johnson', role: 'Judge' },
    { id: '2', name: 'Mike Wilson', role: 'Secretary' },
    { id: '3', name: 'Emma Davis', role: 'Exhibitor' },
    { id: '4', name: 'John Smith', role: 'Admin' },
    { id: '5', name: 'Lisa Brown', role: 'Exhibitor' },
    { id: '6', name: 'David Miller', role: 'Judge' },
    { id: '7', name: 'Anna Taylor', role: 'Secretary' },
    { id: '8', name: 'Tom Anderson', role: 'Exhibitor' }
  ];

  const devices = ['mobile', 'tablet', 'desktop'] as const;
  const platforms = ['iOS', 'Android', 'Windows', 'macOS', 'Linux'];
  const locations = [
    { city: 'New York', country: 'USA', lat: 40.7128, lng: -74.0060 },
    { city: 'Los Angeles', country: 'USA', lat: 34.0522, lng: -118.2437 },
    { city: 'Chicago', country: 'USA', lat: 41.8781, lng: -87.6298 },
    { city: 'Houston', country: 'USA', lat: 29.7604, lng: -95.3698 },
    { city: 'Toronto', country: 'Canada', lat: 43.6532, lng: -79.3832 }
  ];

  const features = [
    'Dog Registration', 'Show Management', 'Score Entry', 'Reports',
    'Calendar', 'Entries', 'Results', 'Judging', 'Check-in', 'Analytics'
  ];

  // Generate sessions for last 7 days
  for (let i = 0; i < 50; i++) {
    const user = users[Math.floor(Math.random() * users.length)];
    const startTime = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000);
    const duration = Math.random() * 120 + 15; // 15-135 minutes
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
    
    sessions.push({
      id: `session-${i}`,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      startTime,
      endTime: Math.random() > 0.1 ? endTime : undefined, // 10% ongoing sessions
      duration,
      deviceType: devices[Math.floor(Math.random() * devices.length)],
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      location: Math.random() > 0.3 ? locations[Math.floor(Math.random() * locations.length)] : undefined,
      syncCount: Math.floor(Math.random() * 50) + 5,
      offlineTime: Math.random() * 30,
      activeFeaturesUsed: features.slice(0, Math.floor(Math.random() * 5) + 2),
      lastActivity: new Date(now.getTime() - Math.random() * 60 * 60 * 1000),
      isOnline: Math.random() > 0.3
    });
  }

  return sessions;
};

const generateHeatmapData = (sessions: UserSession[]): ActivityHeatmapData[] => {
  const heatmapData: ActivityHeatmapData[] = [];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const dayName = days[day];
      const sessionsInHour = sessions.filter(session => {
        const sessionDay = session.startTime.getDay();
        const sessionHour = session.startTime.getHours();
        return sessionDay === day && sessionHour === hour;
      });
      
      heatmapData.push({
        hour,
        day: dayName,
        value: sessionsInHour.length,
        sessions: sessionsInHour.length
      });
    }
  }
  
  return heatmapData;
};

// Helper component to display time since last activity with interval updates
function LastActivityDisplay({ lastActivity }: { lastActivity: Date }) {
  const [minutesAgo, setMinutesAgo] = useState(() =>
    Math.floor((Date.now() - lastActivity.getTime()) / 60000)
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setMinutesAgo(Math.floor((Date.now() - lastActivity.getTime()) / 60000));
    }, 60000);
    return () => clearInterval(interval);
  }, [lastActivity]);

  return (
    <p className="text-xs text-muted-foreground mt-1">
      {minutesAgo}m ago
    </p>
  );
}

export function UserActivityMonitor({ className }: UserActivityMonitorProps) {
  const [selectedTimeRange] = useState<string>('7d');
  const [sessions, setSessions] = useState<UserSession[]>([]);
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            User Activity Monitor
          </h2>
          <p className="text-muted-foreground">Real-time user behavior and engagement analytics</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="Judge">Judges</SelectItem>
              <SelectItem value="Secretary">Secretaries</SelectItem>
              <SelectItem value="Exhibitor">Exhibitors</SelectItem>
              <SelectItem value="Admin">Admins</SelectItem>
            </SelectContent>
          </Select>

          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="tablet">Tablet</SelectItem>
              <SelectItem value="desktop">Desktop</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch
              checked={isRealTimeEnabled}
              onCheckedChange={setIsRealTimeEnabled}
            />
            <span className="text-sm text-muted-foreground">Live</span>
          </div>

          <Button variant="outline" size="sm" onClick={handleExportData}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">{userMetrics.activeUsers}</p>
                <p className="text-xs text-green-600">+{userMetrics.newUsers} new</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <UserCheck className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Engagement Score</p>
                <p className="text-2xl font-bold">{userMetrics.engagementScore.toFixed(0)}%</p>
                <Progress value={userMetrics.engagementScore} className="w-16 h-1 mt-1" />
              </div>
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Session</p>
                <p className="text-2xl font-bold">{userMetrics.averageSessionDuration.toFixed(0)}m</p>
                <p className="text-xs text-muted-foreground">
                  {userMetrics.totalSessions} total sessions
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sync Operations</p>
                <p className="text-2xl font-bold">{userMetrics.syncOperations}</p>
                <p className="text-xs text-muted-foreground">
                  {(userMetrics.offlineUsage / 60).toFixed(1)}h offline
                </p>
              </div>
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                <Zap className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Activity Timeline */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  24-Hour Activity Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="hour" tickFormatter={(hour) => `${hour}:00`} />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip 
                      labelFormatter={(hour) => `${hour}:00 - ${hour + 1}:00`}
                      formatter={(value, name) => [value, name === 'sessions' ? 'Sessions' : name === 'users' ? 'Active Users' : 'Sync Operations']}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="sessions" fill="#3b82f6" name="Sessions" />
                    <Line yAxisId="right" type="monotone" dataKey="users" stroke="#10b981" strokeWidth={2} name="Active Users" />
                    <Line yAxisId="right" type="monotone" dataKey="syncs" stroke="#f59e0b" strokeWidth={2} name="Sync Operations" />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Activity Heatmap */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Weekly Activity Heatmap</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-24 gap-1">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <React.Fragment key={day}>
                      <div className="col-span-24 text-xs text-muted-foreground mb-1">{day}</div>
                      {Array.from({ length: 24 }, (_, hour) => {
                        const data = heatmapData.find(d => d.day === day && d.hour === hour);
                        const intensity = data ? Math.min(data.value / 5, 1) : 0;
                        return (
                          <div
                            key={`${day}-${hour}`}
                            className="aspect-square rounded-sm border"
                            style={{
                              backgroundColor: `rgba(59, 130, 246, ${intensity})`,
                              borderColor: 'rgba(0, 0, 0, 0.1)'
                            }}
                            title={`${day} ${hour}:00 - ${data?.sessions || 0} sessions`}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                  <span>Less</span>
                  <div className="flex gap-1">
                    {[0, 0.2, 0.4, 0.6, 0.8, 1].map(intensity => (
                      <div
                        key={intensity}
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: `rgba(59, 130, 246, ${intensity})` }}
                      />
                    ))}
                  </div>
                  <span>More</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Users List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Active Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredSessions
                    .filter(s => s.isOnline)
                    .slice(0, 10)
                    .map(session => (
                    <div key={session.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {session.userName.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{session.userName}</p>
                          <p className="text-xs text-muted-foreground">{session.userRole}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <Badge variant={session.isOnline ? "default" : "secondary"}>
                            {session.isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            {session.deviceType === 'mobile' && <Smartphone className="h-4 w-4" />}
                            {session.deviceType === 'tablet' && <Tablet className="h-4 w-4" />}
                            {session.deviceType === 'desktop' && <Monitor className="h-4 w-4" />}
                          </div>
                        </div>
                        <LastActivityDisplay lastActivity={session.lastActivity} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* User Engagement Metrics */}
            <Card>
              <CardHeader>
                <CardTitle>User Engagement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Session Duration</span>
                      <span>{userMetrics.averageSessionDuration.toFixed(0)}m avg</span>
                    </div>
                    <Progress value={(userMetrics.averageSessionDuration / 120) * 100} />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>User Retention</span>
                      <span>{userMetrics.userRetention}%</span>
                    </div>
                    <Progress value={userMetrics.userRetention} />
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Sync Activity</span>
                      <span>{(userMetrics.syncOperations / userMetrics.totalSessions).toFixed(1)} per session</span>
                    </div>
                    <Progress value={Math.min(100, (userMetrics.syncOperations / userMetrics.totalSessions) * 10)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="devices" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Device Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Device Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={userMetrics.deviceBreakdown}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="count"
                      label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {userMetrics.deviceBreakdown.map((entry, index) => {
                        const colors = ['#3b82f6', '#10b981', '#f59e0b'];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Platform Statistics */}
            <Card>
              <CardHeader>
                <CardTitle>Platform Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {['iOS', 'Android', 'Windows', 'macOS', 'Linux'].map((platform) => {
                    const count = sessions.filter(s => s.platform === platform).length;
                    const percentage = (count / sessions.length) * 100;
                    
                    return (
                      <div key={platform} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{platform}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-muted rounded-full h-2">
                            <div 
                              className="h-2 rounded-full bg-primary"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground w-12">{count}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="features" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Feature Usage Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={userMetrics.mostUsedFeatures}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="feature" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="usage" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="geography" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Geographic Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Geographic Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {userMetrics.locationStats.map((location) => (
                    <div key={location.location} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{location.location}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-muted rounded-full h-2">
                          <div 
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${(location.users / Math.max(...userMetrics.locationStats.map(l => l.users))) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm text-muted-foreground">{location.users}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Session Distribution by Location */}
            <Card>
              <CardHeader>
                <CardTitle>Session Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <RadialBarChart data={userMetrics.locationStats.slice(0, 5).map((loc, index) => ({
                    ...loc,
                    fill: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index]
                  }))}>
                    <RadialBar dataKey="users" cornerRadius={10} fill="#8884d8" />
                    <Tooltip />
                  </RadialBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}