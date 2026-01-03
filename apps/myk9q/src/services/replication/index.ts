/**
 * Full Table Replication System - Public API
 *
 * This module provides the complete replication infrastructure for
 * offline-first data synchronization between Supabase and IndexedDB.
 *
 * **Phase 2 Complete** - Core sync infrastructure ready
 */

// Core infrastructure
export { ReplicatedTable, REPLICATION_STORES } from './ReplicatedTable';
export { SyncEngine } from './SyncEngine';
export type { SyncOptions, SyncEngineConfig } from './SyncEngine';
export { ConflictResolver, conflictResolver } from './ConflictResolver';
export type {
  ConflictResolutionResult,
  FieldAuthority,
} from './ConflictResolver';
export {
  ReplicationManager,
  initReplicationManager,
  getReplicationManager,
  destroyReplicationManager,
} from './ReplicationManager';
export type { ReplicationManagerConfig } from './ReplicationManager';
export { PrefetchManager } from './PrefetchManager';

// Type definitions
export type {
  ReplicatedRow,
  SyncMetadata,
  PendingMutation,
  SyncResult,
  PerformanceReport,
  SyncProgress,
  SyncFailure,
  ConflictStrategy,
  TableFilter,
  QueryOptions,
} from './types';

// Concrete table implementations
export { replicatedEntriesTable } from './tables/ReplicatedEntriesTable';
export type { Entry } from './tables/ReplicatedEntriesTable';
export { replicatedClassesTable } from './tables/ReplicatedClassesTable';
export type { Class } from './tables/ReplicatedClassesTable';
export { replicatedTrialsTable } from './tables/ReplicatedTrialsTable';
export type { Trial } from './tables/ReplicatedTrialsTable';
export { replicatedShowsTable } from './tables/ReplicatedShowsTable';
export type { Show } from './tables/ReplicatedShowsTable';
export { replicatedClassRequirementsTable } from './tables/ReplicatedClassRequirementsTable';
export type { ClassRequirement } from './tables/ReplicatedClassRequirementsTable';
export { replicatedShowVisibilityDefaultsTable } from './tables/ReplicatedShowVisibilityDefaultsTable';
export type { ShowVisibilityDefaults } from './tables/ReplicatedShowVisibilityDefaultsTable';
export { replicatedTrialVisibilityOverridesTable } from './tables/ReplicatedTrialVisibilityOverridesTable';
export type { TrialVisibilityOverrides } from './tables/ReplicatedTrialVisibilityOverridesTable';
export { replicatedClassVisibilityOverridesTable } from './tables/ReplicatedClassVisibilityOverridesTable';
export type { ClassVisibilityOverrides } from './tables/ReplicatedClassVisibilityOverridesTable';

// Announcements & Push Notifications (Day 16-17)
export { replicatedAnnouncementsTable } from './tables/ReplicatedAnnouncementsTable';
export type { Announcement } from './tables/ReplicatedAnnouncementsTable';
export { replicatedAnnouncementReadsTable } from './tables/ReplicatedAnnouncementReadsTable';
export type { AnnouncementRead } from './tables/ReplicatedAnnouncementReadsTable';
export { replicatedPushSubscriptionsTable } from './tables/ReplicatedPushSubscriptionsTable';
export type { PushSubscription, NotificationPreferences } from './tables/ReplicatedPushSubscriptionsTable';
export { replicatedPushNotificationConfigTable } from './tables/ReplicatedPushNotificationConfigTable';
export type { PushNotificationConfig } from './tables/ReplicatedPushNotificationConfigTable';

// Statistics Views (Day 18)
export { replicatedStatsViewTable } from './tables/ReplicatedStatsViewTable';
export type { StatsView } from './tables/ReplicatedStatsViewTable';

// Nationals Tables (Day 19 - Dormant)
export { replicatedEventStatisticsTable } from './tables/ReplicatedEventStatisticsTable';
export type { EventStatistics } from './tables/ReplicatedEventStatisticsTable';
export { replicatedNationalsRankingsTable } from './tables/ReplicatedNationalsRankingsTable';
export type { NationalsRankings } from './tables/ReplicatedNationalsRankingsTable';

// Audit Log View (Day 20)
export { replicatedAuditLogViewTable } from './tables/ReplicatedAuditLogViewTable';
export type { AuditLog } from './tables/ReplicatedAuditLogViewTable';
