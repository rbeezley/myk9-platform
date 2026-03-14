export interface LandingShow {
  id: string;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
  accentColor?: string | null;
}

export interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

// User interface is now exported from './types/user-types'.
export type { User } from './types/user-types';

// Analytics types for sync monitoring
export type {
  SyncEvent,
  SyncMetrics,
  ConflictResolution,
  NetworkMetrics,
  CollectionSyncMetrics,
  SyncEventType,
  ConflictType,
  ConflictResolutionStrategy,
  SyncStatus,
  NetworkStatus,
  AnalyticsConfig,
  SyncAlert,
  PerformanceBenchmark,
  StorageMetrics,
  UserSyncBehavior,
  ResourceUsage,
  AnalyticsExport,
  DashboardState,
  SyncQueueMetrics,
  HealthCheckResult,
} from './types/analytics-types';
