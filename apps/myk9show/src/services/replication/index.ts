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

// Armbands
export {
  ReplicatedArmbandsTable,
  replicatedArmbandsTable,
  type ReplicatedArmband,
} from './ReplicatedArmbandsTable';

// Dogs
export {
  ReplicatedDogsTable,
  replicatedDogsTable,
  type ReplicatedDog,
} from './ReplicatedDogsTable';

// Dog registrations
export {
  ReplicatedDogRegistrationsTable,
  replicatedDogRegistrationsTable,
  type ReplicatedDogRegistration,
} from './ReplicatedDogRegistrationsTable';

// Show-desk people queue
export {
  ReplicatedShowDeskPeopleTable,
  replicatedShowDeskPeopleTable,
  type ReplicatedShowDeskPerson,
  type ShowDeskPersonInput,
} from './ReplicatedShowDeskPeopleTable';

// Paperwork print confirmations
export {
  ReplicatedPaperworkPrintsTable,
  replicatedPaperworkPrintsTable,
  rowToPaperworkPrint,
  type ConfirmPaperworkPrintInput,
  type ReplicatedPaperworkPrint,
} from './ReplicatedPaperworkPrintsTable';

// Judge Assignments
export {
  ReplicatedJudgeAssignmentsTable,
  replicatedJudgeAssignmentsTable,
  type ReplicatedJudgeAssignment,
} from './ReplicatedJudgeAssignmentsTable';

// Re-export core types from @myk9/replication
export type {
  ReplicatedRow,
  SyncResult,
  SyncMetadata,
  SyncStatus,
  PendingMutation,
  CacheStats,
} from '@myk9/replication';
