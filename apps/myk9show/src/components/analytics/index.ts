/**
 * Analytics Components Index
 *
 * Exports admin monitoring components (PerformanceGraphs, UserActivityMonitor,
 * EnhancedAnalyticsDashboard) and re-exports shared analytics types.
 */

export { PerformanceGraphs } from './PerformanceGraphs';
export { UserActivityMonitor } from './UserActivityMonitor';
export { EnhancedAnalyticsDashboard } from './EnhancedAnalyticsDashboard';
export { ShowStatsSubTab } from './ShowStatsSubTab';
export { JudgeStatsSubTab } from './JudgeStatsSubTab';
export { ClassBreakdownTable } from './ClassBreakdownTable';

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
  SyncQueueMetrics,
} from '@/types/analytics-types';
