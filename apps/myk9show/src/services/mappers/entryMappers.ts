// Type mapping utilities for Entry Store <-> Database integration
// Entry Store Integration - React Query Implementation

import type {
  ShowEntry,
  ShowEntryInput,
  RegistrationData,
  CompetitionData,
  EntryStatus,
} from '@/store/entryStore';
import type { DbEntryInsert, DbEntryUpdate } from '@/types/database-mappings';
import { logger } from '@/services/LoggingService';

/**
 * Database entry with optional relations for queries that join related tables
 */
interface DbEntryWithRelations extends Record<string, unknown> {
  id: string;
  show_id: string;
  class_id: string;
  dog_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  dog?: {
    call_name?: string;
    name?: string;
    breed?: string;
    owner?: {
      first_name?: string;
      last_name?: string;
      email?: string;
    };
  };
  class?: {
    name?: string;
    class_number?: string;
  };
  show?: {
    name?: string;
    start_date?: string;
  };
  result?: Array<Record<string, unknown>>;
  entry_status_history?: Array<Record<string, unknown>>;
}

/**
 * Extended DbEntryInsert with status field
 * Note: status column exists in database but may not be in generated types yet
 */
type DbEntryInsertWithStatus = DbEntryInsert & { status?: string };

/**
 * Convert ShowEntryInput (from entryStore) to DbEntryInsert (for database)
 */
export const mapEntryInputToInsert = (input: ShowEntryInput): DbEntryInsertWithStatus => {
  const now = new Date().toISOString();

  return {
    show_id: input.showId,
    class_id: input.classId,
    dog_id: input.dogId,
    entry_status: 'draft', // Default status for new entries
    armband: input.registrationData.armband || null,
    handler: input.registrationData.handler,
    handler_id: input.registrationData.handlerId || null,
    entry_fee: input.registrationData.entryFee,
    payment_status: input.registrationData.paymentStatus,
    special_requests: input.registrationData.specialRequests || null,
    jump_height: input.registrationData.jumpHeight || null,
    preferred_judge: input.registrationData.preferredJudge || null,
    move_up_requested: input.registrationData.moveUpRequested || false,
    run_order: input.registrationData.runOrder || null,
    submitted_at: input.registrationData.submittedAt,
    created_at: now,
    updated_at: now,
  };
};

/**
 * Convert ShowEntryInput updates to DbEntryUpdate (for database)
 */
export const mapEntryInputToUpdate = (input: Partial<ShowEntryInput>): DbEntryUpdate => {
  const update: DbEntryUpdate = {};
  const now = new Date().toISOString();

  update.updated_at = now;

  if (input.showId !== undefined) update.show_id = input.showId;
  if (input.classId !== undefined) update.class_id = input.classId;
  if (input.dogId !== undefined) update.dog_id = input.dogId;

  // Map registration data fields
  if (input.registrationData) {
    const regData = input.registrationData;

    if (regData.handler !== undefined) update.handler = regData.handler;
    if (regData.handlerId !== undefined) update.handler_id = regData.handlerId || null;
    if (regData.entryFee !== undefined) update.entry_fee = regData.entryFee;
    if (regData.paymentStatus !== undefined) update.payment_status = regData.paymentStatus;
    if (regData.specialRequests !== undefined)
      update.special_requests = regData.specialRequests || null;
    if (regData.armband !== undefined) update.armband = regData.armband || null;
    if (regData.runOrder !== undefined) update.run_order = regData.runOrder || null;
    if (regData.jumpHeight !== undefined) update.jump_height = regData.jumpHeight || null;
    if (regData.preferredJudge !== undefined)
      update.preferred_judge = regData.preferredJudge || null;
    if (regData.moveUpRequested !== undefined)
      update.move_up_requested = regData.moveUpRequested || false;
    if (regData.submittedAt !== undefined) update.submitted_at = regData.submittedAt;
  }

  // Note: Competition data (score, time, placement, etc.) belongs in the result table, not entry table
  // Skip mapping competition data fields for entry updates

  return update;
};

/**
 * Convert RegistrationData updates to DbEntryUpdate (for database)
 */
export const mapRegistrationDataToUpdate = (regData: Partial<RegistrationData>): DbEntryUpdate => {
  const update: DbEntryUpdate = {};
  const now = new Date().toISOString();

  update.updated_at = now;

  if (regData.handler !== undefined) update.handler = regData.handler;
  if (regData.handlerId !== undefined) update.handler_id = regData.handlerId || null;
  if (regData.entryFee !== undefined) update.entry_fee = regData.entryFee;
  if (regData.paymentStatus !== undefined) update.payment_status = regData.paymentStatus;
  if (regData.specialRequests !== undefined)
    update.special_requests = regData.specialRequests || null;
  if (regData.armband !== undefined) update.armband = regData.armband || null;
  if (regData.runOrder !== undefined) update.run_order = regData.runOrder || null;
  if (regData.jumpHeight !== undefined) update.jump_height = regData.jumpHeight || null;
  if (regData.preferredJudge !== undefined) update.preferred_judge = regData.preferredJudge || null;
  if (regData.moveUpRequested !== undefined)
    update.move_up_requested = regData.moveUpRequested || false;
  if (regData.submittedAt !== undefined) update.submitted_at = regData.submittedAt;

  return update;
};

/**
 * Convert CompetitionData updates to DbEntryUpdate (for database)
 * Note: Competition data belongs in the result table, not entry table.
 * This function is kept for backward compatibility but should not be used for entry updates.
 * Use result-specific mappers for competition data instead.
 */
export const mapCompetitionDataToUpdate = (_compData: Partial<CompetitionData>): DbEntryUpdate => {
  const update: DbEntryUpdate = {};
  const now = new Date().toISOString();

  update.updated_at = now;

  // Competition data fields are not in the entry table - they belong in the result table
  // This function is deprecated and should not be used for actual entry updates
  logger.warn(
    'mapCompetitionDataToUpdate is deprecated - competition data belongs in the result table',
    'services',
    {}
  );

  return update;
};

/**
 * Convert database entry result to ShowEntry type (for backward compatibility)
 */
export const mapDatabaseToEntry = (dbEntry: Record<string, unknown>): ShowEntry => {
  // Build registration data from database fields
  const registrationData: RegistrationData = {
    submittedAt: (dbEntry.submitted_at as string) || new Date().toISOString(),
    handler: (dbEntry.handler as string) || '',
    handlerId: (dbEntry.handler_id as string) || undefined,
    entryFee: (dbEntry.entry_fee as number) || 0,
    paymentStatus: (dbEntry.payment_status as 'pending' | 'paid' | 'refunded') || 'pending',
    specialRequests: (dbEntry.special_requests as string) || undefined,
    armband: (dbEntry.armband as string) || undefined,
    runOrder: (dbEntry.run_order as number) || undefined,
    jumpHeight: (dbEntry.jump_height as string) || undefined,
    preferredJudge: (dbEntry.preferred_judge as string) || undefined,
    moveUpRequested: (dbEntry.move_up_requested as boolean) || false,
  };

  // Build competition data from result relationship if it exists
  let competitionData: CompetitionData | undefined;
  if (dbEntry.result && Array.isArray(dbEntry.result) && dbEntry.result.length > 0) {
    const result = dbEntry.result[0] as Record<string, unknown>; // Take the first result if multiple
    competitionData = {
      startTime: undefined, // Not available in result table
      endTime: undefined, // Not available in result table
      score: (result.score as string) || undefined,
      time: result.time ? (result.time as number).toString() : undefined,
      placement: (result.placement as string) || undefined,
      qualified: (result.qualified as boolean) || undefined,
      qualification: undefined, // Not available in result table
      qualificationReason: undefined, // Not available in result table
      faults: (result.faults as number) || undefined,
      judgeNotes: (result.judge_notes as string) || undefined,
      recordedBy: (result.recorded_by as string) || '',
      recordedAt: (result.recorded_at as string) || new Date().toISOString(),
    };
  }

  // Build status history from database entry_status_history relation
  const statusHistory = (dbEntry.entry_status_history as Array<Record<string, unknown>>)?.map(
    history => ({
      status: history.status as EntryStatus,
      timestamp: history.changed_at as string,
      userId: history.changed_by as string,
      reason: history.reason as string,
    })
  ) || [
    {
      status: (dbEntry.entry_status || dbEntry.status) as EntryStatus,
      timestamp: dbEntry.created_at as string,
      userId: 'system',
      reason: 'Entry created',
    },
  ];

  return {
    id: dbEntry.id as string,
    showId: dbEntry.show_id as string,
    classId: dbEntry.class_id as string,
    dogId: dbEntry.dog_id as string,
    status: (dbEntry.entry_status || dbEntry.status) as EntryStatus,
    registrationData,
    competitionData,
    statusHistory,
    createdAt: dbEntry.created_at as string,
    updatedAt: dbEntry.updated_at as string,
  };
};

/**
 * Convert array of database entries to ShowEntry array
 */
export const mapDatabaseEntriesArray = (dbEntries: Array<Record<string, unknown>>): ShowEntry[] => {
  return dbEntries.map(mapDatabaseToEntry);
};

/**
 * Entry with expanded relation data
 */
export interface EntryWithRelations extends ShowEntry {
  dogName?: string | undefined;
  dogBreed?: string | undefined;
  ownerName?: string | undefined;
  ownerEmail?: string | undefined;
  className?: string | undefined;
  classNumber?: string | undefined;
  showName?: string | undefined;
  showDate?: string | undefined;
}

/**
 * Convert database entry with relations to ShowEntry with expanded data
 */
export const mapDatabaseToEntryWithRelations = (
  dbEntry: DbEntryWithRelations
): EntryWithRelations => {
  const baseEntry = mapDatabaseToEntry(dbEntry);

  return {
    ...baseEntry,
    // Add dog information
    dogName: dbEntry.dog?.call_name || dbEntry.dog?.name,
    dogBreed: dbEntry.dog?.breed,
    ownerName: dbEntry.dog?.owner
      ? `${dbEntry.dog.owner.first_name} ${dbEntry.dog.owner.last_name}`.trim()
      : undefined,
    ownerEmail: dbEntry.dog?.owner?.email,
    // Add class information
    className: dbEntry.class?.name,
    classNumber: dbEntry.class?.class_number,
    // Add show information
    showName: dbEntry.show?.name,
    showDate: dbEntry.show?.start_date,
  };
};

/**
 * Convert array of database entries with relations to ShowEntry array with expanded data
 */
export const mapDatabaseEntriesWithRelationsArray = (
  dbEntries: DbEntryWithRelations[]
): EntryWithRelations[] => {
  return dbEntries.map(mapDatabaseToEntryWithRelations);
};

// ---------------------------------------------------------------------------
// Replication mappers — convert camelCase replicated types to snake_case DB
// row shapes so downstream consumers (stores, UI) see the same shape as
// PostgREST responses.
// ---------------------------------------------------------------------------

import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';

/**
 * Convert a ReplicatedEntry to the snake_case DB row shape that consumers
 * expect from PostgREST `select('*')`.
 *
 * Optionally attach joined `dog`, `class`, `show` sub-objects when provided.
 */
export const mapReplicatedEntryToDbRow = (
  entry: ReplicatedEntry,
  options?: {
    dog?: ReplicatedDog | null;
    cls?: ReplicatedClass | null;
    show?: ReplicatedShow | null;
    promoCode?: Record<string, unknown> | null;
    trial?: Record<string, unknown> | null;
  }
): Record<string, unknown> => {
  const row: Record<string, unknown> = {
    id: entry.id,
    class_id: entry.classId ?? null,
    show_id: entry.showId ?? null,
    dog_id: entry.dogId ?? null,
    handler_id: entry.handlerId ?? null,
    armband: entry.armband ?? null,
    handler: entry.handler ?? null,
    entry_status: entry.entryStatus ?? null,
    check_in_status: entry.checkInStatus ?? entry.check_in_status ?? null,
    jump_height: entry.jumpHeight ?? null,
    entry_fee: entry.entryFee ?? null,
    total_fees: entry.totalFees ?? null,
    payment_status: entry.paymentStatus ?? null,
    run_order: entry.runOrder ?? null,
    move_up_requested: entry.moveUpRequested ?? null,
    preferred_judge: entry.preferredJudge ?? null,
    special_requests: entry.specialRequests ?? null,
    submitted_at: entry.submittedAt ?? null,
    registration_id: entry.registrationId ?? null,
    is_scored: entry.isScored ?? false,
    result_status: entry.resultStatus ?? null,
    search_time_seconds: entry.searchTimeSeconds ?? null,
    total_faults: entry.totalFaults ?? null,
    final_placement: entry.finalPlacement ?? null,
    disqualification_reason: entry.disqualification_reason ?? null,
    judge_notes: entry.judgeNotes ?? null,
    scoring_completed_at: entry.scoringCompletedAt ?? null,
    ring_entry_time: entry.ring_entry_time ?? null,
    ring_exit_time: entry.ring_exit_time ?? null,
    updated_at: entry.updated_at ?? null,
    created_at: entry.submittedAt ?? entry.updated_at ?? null,
    deleted_at: null,
  };

  // Attach dog sub-object when provided
  if (options?.dog) {
    row.dog = mapReplicatedDogToEntryRow(options.dog);
  } else if (options?.dog === null) {
    row.dog = null;
  }

  // Attach class sub-object when provided
  if (options?.cls) {
    row.class = mapReplicatedClassToEntryRow(options.cls);
  } else if (options?.cls === null) {
    row.class = null;
  }

  // Attach show sub-object when provided
  if (options?.show) {
    row.show = mapReplicatedShowToEntryRow(options.show);
  } else if (options?.show === null) {
    row.show = null;
  }

  // Attach promo_code sub-object when provided (already snake_case from PostgREST batch)
  if (options?.promoCode !== undefined) {
    row.promo_code = options.promoCode;
  }

  // Attach trial sub-object when provided (already snake_case)
  if (options?.trial !== undefined) {
    row.trial = options.trial;
  }

  return row;
};

/**
 * Convert a ReplicatedDog to the snake_case dog sub-object shape returned
 * by PostgREST when selecting `dog:dog_id(...)`.
 */
export const mapReplicatedDogToEntryRow = (dog: ReplicatedDog): Record<string, unknown> => ({
  id: dog.id,
  name: dog.name,
  call_name: dog.callName ?? null,
  breed: dog.breed,
  owner: dog.ownerId
    ? {
        id: dog.ownerId,
        // Owner details are not available from ReplicatedDog — set to null
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
      }
    : null,
});

/**
 * Convert a ReplicatedDog to the detailed dog sub-object shape (includes registration_number).
 */
export const mapReplicatedDogToDetailRow = (dog: ReplicatedDog): Record<string, unknown> => ({
  id: dog.id,
  name: dog.name,
  call_name: dog.callName ?? null,
  breed: dog.breed,
  registration_number: null, // Not available from ReplicatedDog
  owner: dog.ownerId
    ? {
        id: dog.ownerId,
        first_name: null,
        last_name: null,
        email: null,
        phone: null,
        address: null,
        city: null,
        state: null,
        postal_code: null,
      }
    : null,
});

/**
 * Convert a ReplicatedClass to the snake_case class sub-object shape returned
 * by PostgREST when selecting `class:class_id(...)`.
 */
export const mapReplicatedClassToEntryRow = (cls: ReplicatedClass): Record<string, unknown> => ({
  id: cls.id,
  name: cls.name,
  class_number: null, // class_number is not on ReplicatedClass
  entry_fee: cls.entryFee ?? null,
  max_entries: cls.maxEntries ?? null,
  description: cls.description ?? null,
  jump_height: cls.jumpHeights?.[0] ?? null,
  trial_id: cls.trialId ?? null,
});

/**
 * Convert a ReplicatedShow to the snake_case show sub-object shape returned
 * by PostgREST when selecting `show:show_id(...)`.
 */
export const mapReplicatedShowToEntryRow = (show: ReplicatedShow): Record<string, unknown> => ({
  id: show.id,
  name: show.name,
  start_date: show.startDate,
  end_date: show.endDate,
  location: show.location ?? null,
  status: show.status ?? null,
});
