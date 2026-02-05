/**
 * AdminDashboard Module
 *
 * Exports all components and hooks for the admin dashboard.
 */

// Types
export * from './admin-dashboard-types';

// Hooks
export { useAdminDashboardData, calculateDashboardStats } from './useAdminDashboardData';
export { useSystemHealthMetrics } from './useSystemHealthMetrics';

// Components
export { StatsCard } from './StatsCard';
export {
  CollapsibleSystemHealth,
  PerformanceOverview,
  RecentActivity,
  SystemStatus,
} from './SystemHealthSection';
export { PlatformAdministrationSection } from './PlatformAdministrationSection';
export { PlatformStatisticsSection } from './PlatformStatisticsSection';
