/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// TODO: Fix type errors - 'status' property not in DbEntryInsert type
// Type mapping utilities for Entry Store <-> Database integration
// Entry Store Integration - React Query Implementation

import type { ShowEntry, ShowEntryInput, RegistrationData, CompetitionData, EntryStatus } from '@/store/entryStore';
import type { DbEntryInsert, DbEntryUpdate } from '@/types/database-mappings';
import { logger } from '@/services/LoggingService';

/**
 * Convert ShowEntryInput (from entryStore) to DbEntryInsert (for database)
 */
export const mapEntryInputToInsert = (input: ShowEntryInput): DbEntryInsert => {
  const now = new Date().toISOString();
  
  return {
    show_id: input.showId,
    class_id: input.classId,
    dog_id: input.dogId,
    status: 'draft', // Default status for new entries
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
    if (regData.specialRequests !== undefined) update.special_requests = regData.specialRequests || null;
    if (regData.armband !== undefined) update.armband = regData.armband || null;
    if (regData.runOrder !== undefined) update.run_order = regData.runOrder || null;
    if (regData.jumpHeight !== undefined) update.jump_height = regData.jumpHeight || null;
    if (regData.preferredJudge !== undefined) update.preferred_judge = regData.preferredJudge || null;
    if (regData.moveUpRequested !== undefined) update.move_up_requested = regData.moveUpRequested || false;
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
  if (regData.specialRequests !== undefined) update.special_requests = regData.specialRequests || null;
  if (regData.armband !== undefined) update.armband = regData.armband || null;
  if (regData.runOrder !== undefined) update.run_order = regData.runOrder || null;
  if (regData.jumpHeight !== undefined) update.jump_height = regData.jumpHeight || null;
  if (regData.preferredJudge !== undefined) update.preferred_judge = regData.preferredJudge || null;
  if (regData.moveUpRequested !== undefined) update.move_up_requested = regData.moveUpRequested || false;
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
  logger.warn('mapCompetitionDataToUpdate is deprecated - competition data belongs in the result table', 'services', {});

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
  const statusHistory = (dbEntry.entry_status_history as Array<Record<string, unknown>>)?.map((history) => ({
    status: history.status as EntryStatus,
    timestamp: history.changed_at as string,
    userId: history.changed_by as string,
    reason: history.reason as string,
  })) || [{
    status: dbEntry.status as EntryStatus,
    timestamp: dbEntry.created_at as string,
    userId: 'system',
    reason: 'Entry created',
  }];

  return {
    id: dbEntry.id as string,
    showId: dbEntry.show_id as string,
    classId: dbEntry.class_id as string,
    dogId: dbEntry.dog_id as string,
    status: dbEntry.status as EntryStatus,
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
 * Convert database entry with relations to ShowEntry with expanded data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mapDatabaseToEntryWithRelations = (dbEntry: any): ShowEntry & {
  dogName?: string;
  dogBreed?: string;
  ownerName?: string;
  ownerEmail?: string;
  className?: string;
  classNumber?: string;
  showName?: string;
  showDate?: string;
} => {
  const baseEntry = mapDatabaseToEntry(dbEntry);

  return {
    ...baseEntry,
    // Add dog information
    dogName: dbEntry.dog?.call_name || dbEntry.dog?.name,
    dogBreed: dbEntry.dog?.breed,
    ownerName: dbEntry.dog?.owner ? `${dbEntry.dog.owner.first_name} ${dbEntry.dog.owner.last_name}`.trim() : undefined,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mapDatabaseEntriesWithRelationsArray = (dbEntries: any[]): (ShowEntry & {
  dogName?: string;
  dogBreed?: string;
  ownerName?: string;
  ownerEmail?: string;
  className?: string;
  classNumber?: string;
  showName?: string;
  showDate?: string;
})[] => {
  return dbEntries.map(mapDatabaseToEntryWithRelations);
};