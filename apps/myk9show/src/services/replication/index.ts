/**
 * Replication Service Exports
 *
 * This module provides offline-first data replication using @myk9/replication.
 * All tables use IndexedDB for local storage with automatic sync to Supabase.
 */

// Clubs
export {
  ReplicatedClubsTable,
  replicatedClubsTable,
  type ReplicatedClub,
} from './ReplicatedClubsTable';

// Shows
export {
  ReplicatedShowsTable,
  replicatedShowsTable,
  type ReplicatedShow,
} from './ReplicatedShowsTable';

// Trials
export {
  ReplicatedTrialsTable,
  replicatedTrialsTable,
  type ReplicatedTrial,
} from './ReplicatedTrialsTable';

// Classes
export {
  ReplicatedClassesTable,
  replicatedClassesTable,
  type ReplicatedClass,
} from './ReplicatedClassesTable';

// Entries
export {
  ReplicatedEntriesTable,
  replicatedEntriesTable,
  type ReplicatedEntry,
} from './ReplicatedEntriesTable';

// Dogs
export {
  ReplicatedDogsTable,
  replicatedDogsTable,
  type ReplicatedDog,
} from './ReplicatedDogsTable';

// Re-export core types from @myk9/replication
export type {
  ReplicatedRow,
  SyncResult,
  SyncMetadata,
  SyncStatus,
  PendingMutation,
  CacheStats,
} from '@myk9/replication';
