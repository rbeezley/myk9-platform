export interface UserActivityMonitorProps {
  className?: string;
}

export interface UserSession {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  startTime: Date;
  endTime?: Date | undefined;
  duration: number; // minutes
  deviceType: 'mobile' | 'tablet' | 'desktop';
  platform: string;
  location?: {
    city: string;
    country: string;
    lat: number;
    lng: number;
  } | undefined;
  syncCount: number;
  offlineTime: number; // minutes
  activeFeaturesUsed: string[];
  lastActivity: Date;
  isOnline: boolean;
}

export interface UserMetrics {
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

export interface ActivityHeatmapData {
  hour: number;
  day: string;
  value: number;
  sessions: number;
}

export interface TimelineDataPoint {
  hour: number;
  sessions: number;
  users: number;
  syncs: number;
}
