/**
 * Analytics Components Index
 * 
 * Exports all analytics dashboard and monitoring components for Phase 5.2.4
 * implementation of performance graphs and user activity monitoring.
 */

export { AnalyticsDashboard } from './AnalyticsDashboard';
export { PerformanceGraphs } from './PerformanceGraphs';
export { UserActivityMonitor } from './UserActivityMonitor';
export { EnhancedAnalyticsDashboard } from './EnhancedAnalyticsDashboard';

// Re-export types for convenience
export type {
  SyncMetrics,
  SyncEvent,
  SyncAlert,
  HealthCheckResult,
  AnalyticsConfig,
  UserSyncBehavior,
  ResourceUsage,
  PerformanceBenchmark,
  StorageMetrics,
  SyncQueueMetrics
} from '@/types/analytics-types';