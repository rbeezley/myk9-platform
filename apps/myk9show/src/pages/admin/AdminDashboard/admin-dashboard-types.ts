/**
 * AdminDashboard Types
 *
 * Type definitions for the admin dashboard components.
 */

import { SystemHealthMetrics, PerformanceMetrics } from '@/services/SystemHealthService';
import { Show } from '@/types/show-types';
import { User } from '@/types/user-types';

// Activity type for timeline component
export type ActivityType = 'success' | 'info' | 'warning' | 'error';

// Stats card props
export interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  priority?: 'urgent' | 'high' | 'normal';
  actionable?: boolean;
  onClick?: () => void;
}

// Activity item for recent activity timeline
export interface ActivityItem {
  id: string;
  type: ActivityType;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  timestamp: string;
}

// System status item
export interface SystemStatusItem {
  label: string;
  status: string;
  uptime: string;
  responseTime?: string;
  lastError?: string;
}

// Performance item for performance overview
export interface PerformanceItem {
  label: string;
  value: string;
  status: 'healthy' | 'warning' | 'error';
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

// Props for CollapsibleSystemHealth component
export interface CollapsibleSystemHealthProps {
  healthMetrics: SystemHealthMetrics | null;
  hasError: boolean;
  isLoading: boolean;
  shows: Show[];
  users: User[];
}

// Props for PerformanceOverview component
export interface PerformanceOverviewProps {
  performance: PerformanceMetrics | null;
  isLoading: boolean;
}

// Props for RecentActivity component
export interface RecentActivityProps {
  shows: Show[];
  users: User[];
  isLoading: boolean;
}

// Props for SystemStatus component
export interface SystemStatusProps {
  healthMetrics: SystemHealthMetrics | null;
  hasError: boolean;
  isLoading: boolean;
}

// Props for PlatformAdministrationSection component
export interface PlatformAdministrationSectionProps {
  userCount: number;
}

// Props for PlatformStatisticsSection component
export interface PlatformStatisticsSectionProps {
  isLoading: boolean;
  totalUsers: number;
  activeShows: number;
  totalShows: number;
  totalDogs: number;
}

// Admin dashboard data from hooks
export interface AdminDashboardData {
  users: User[];
  shows: Show[];
  dogs: { id: string }[];
  isLoading: boolean;
  hasError: boolean;
}

// System health metrics data
export interface SystemHealthData {
  healthMetrics: SystemHealthMetrics | null;
  systemUptime: string;
}
