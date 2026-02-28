/**
 * AdminDashboard Module
 *
 * Exports all components and hooks for the admin dashboard.
 */

// Types
export * from './admin-dashboard-types';

// Hooks
export { useAdminDashboardData, calculateDashboardStats } from './useAdminDashboardData';

// Components
export { StatsCard } from './StatsCard';
export { PlatformAdministrationSection } from './PlatformAdministrationSection';
export { PlatformStatisticsSection } from './PlatformStatisticsSection';
