// Mappers for Trial data between database and application formats
import type { Trial, TrialInput } from '@/store/trialStore';
import type { Database } from '@/types/supabase';

type DbTrial = Database['public']['Tables']['trials']['Row'];
type DbTrialInsert = Database['public']['Tables']['trials']['Insert'];
type DbTrialUpdate = Database['public']['Tables']['trials']['Update'];

// Type for joined trial data from queries
export interface DbTrialWithShow extends DbTrial {
  show?: {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
  } | null;
  deleted_by_user?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
}

/**
 * Map database trial data to application Trial type
 */
export const mapDatabaseToTrial = (dbTrial: DbTrialWithShow): Trial => {
  return {
    id: dbTrial.id,
    showId: dbTrial.show_id || '',
    showName: dbTrial.show?.name || '',
    name: dbTrial.name || '',
    trialDate: dbTrial.date || '',
    trialNumber: dbTrial.trial_number || '',
    status: (dbTrial.status as Trial['status']) || 'Upcoming',
    plannedStartTime: dbTrial.planned_start_time ?? undefined,
    timeStarted: dbTrial.actual_start_time ?? undefined,
    timeEnded: dbTrial.actual_end_time ?? undefined,
    eventNumber: dbTrial.event_number ?? undefined,
    type: dbTrial.category ?? undefined,
    order:
      dbTrial.display_order !== undefined && dbTrial.display_order !== null
        ? String(dbTrial.display_order)
        : undefined,
    trialType: dbTrial.trial_type ?? undefined,
    image: dbTrial.image_url ?? undefined,
  };
};

/**
 * Map array of database trial data to application Trial array
 */
export const mapDatabaseTrialsArray = (dbTrials: DbTrialWithShow[]): Trial[] => {
  return dbTrials.map(mapDatabaseToTrial);
};

/**
 * Map TrialInput to database insert format
 */
export const mapTrialInputToInsert = (trialInput: TrialInput): DbTrialInsert => {
  return {
    show_id: trialInput.showId,
    name: trialInput.name,
    date: trialInput.trialDate,
    trial_number: trialInput.trialNumber,
    status: trialInput.status,
    planned_start_time: trialInput.plannedStartTime || null,
    trial_type: trialInput.trialType || null,
    event_number: trialInput.eventNumber || null,
    display_order: trialInput.order ? parseInt(trialInput.order, 10) : 0,
    category: trialInput.type || null,
    image_url: trialInput.image || null,
    actual_start_time: trialInput.timeStarted || null,
    actual_end_time: trialInput.timeEnded || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};

/**
 * Map partial TrialInput to database update format
 */
export const mapTrialInputToUpdate = (updates: Partial<TrialInput>): DbTrialUpdate => {
  const updateData: DbTrialUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (updates.showId !== undefined) {
    updateData.show_id = updates.showId;
  }
  if (updates.name !== undefined) {
    updateData.name = updates.name;
  }
  if (updates.trialDate !== undefined) {
    updateData.date = updates.trialDate;
  }
  if (updates.trialNumber !== undefined) {
    updateData.trial_number = updates.trialNumber;
  }
  if (updates.status !== undefined) {
    updateData.status = updates.status;
  }
  if (updates.plannedStartTime !== undefined) {
    updateData.planned_start_time = updates.plannedStartTime;
  }
  if (updates.trialType !== undefined) {
    updateData.trial_type = updates.trialType;
  }
  if (updates.eventNumber !== undefined) {
    updateData.event_number = updates.eventNumber;
  }
  if (updates.order !== undefined) {
    updateData.display_order = updates.order ? parseInt(updates.order, 10) : 0;
  }
  if (updates.type !== undefined) {
    updateData.category = updates.type;
  }
  if (updates.image !== undefined) {
    updateData.image_url = updates.image;
  }
  if (updates.timeStarted !== undefined) {
    updateData.actual_start_time = updates.timeStarted;
  }
  if (updates.timeEnded !== undefined) {
    updateData.actual_end_time = updates.timeEnded;
  }

  return updateData;
};

/**
 * Map Trial to TrialInput (for editing existing trials)
 */
export const mapTrialToTrialInput = (trial: Trial): TrialInput => {
  return {
    showId: trial.showId,
    showName: trial.showName,
    name: trial.name || '',
    trialDate: trial.trialDate,
    trialNumber: trial.trialNumber,
    status: trial.status,
    eventNumber: trial.eventNumber,
    type: trial.type,
    trialType: trial.trialType,
    plannedStartTime: trial.plannedStartTime,
    order: trial.order,
    image: trial.image,
    timeStarted: trial.timeStarted,
    timeEnded: trial.timeEnded,
  };
};

// ---------------------------------------------------------------------------
// Replication mappers — convert camelCase replicated types to snake_case DB
// row shapes so downstream consumers (stores, UI) see the same shape as
// PostgREST responses.
// ---------------------------------------------------------------------------

import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import { mapFields } from './mapperUtils';

/**
 * Convert a ReplicatedShow to the snake_case show sub-object shape returned
 * by PostgREST when selecting `show:shows(id, name, start_date, end_date)`.
 */
export const mapReplicatedShowToTrialJoinRow = (show: ReplicatedShow): Record<string, unknown> =>
  mapFields(show as unknown as Record<string, unknown>, {
    id: 'id',
    name: 'name',
    start_date: 'startDate',
    end_date: 'endDate',
  });

/**
 * Convert a ReplicatedTrial to the full snake_case DB row shape that
 * consumers expect from PostgREST `select('*')`.
 *
 * Optionally attach the joined `show` sub-object when provided.
 */
export const mapReplicatedTrialToDbRow = (
  trial: ReplicatedTrial,
  options?: {
    show?: ReplicatedShow | null;
  }
): Record<string, unknown> => {
  const row: Record<string, unknown> = {
    ...mapFields(trial as unknown as Record<string, unknown>, {
      id: 'id',
      show_id: 'showId',
      name: 'name',
      date: 'date',
      trial_number: 'trialNumber',
      status: 'status',
      trial_type: 'trialType',
      max_entries_per_dog: 'maxEntriesPerDog',
      max_total_entries: 'maxTotalEntries',
      max_entries_per_handler: 'maxEntriesPerHandler',
      planned_start_time: 'plannedStartTime',
      actual_start_time: 'actualStartTime',
      actual_end_time: 'actualEndTime',
      event_number: 'eventNumber',
      display_order: 'displayOrder',
      category: 'category',
      image_url: 'imageUrl',
    }),
    deleted_at: null,
  };

  // Attach show sub-object when provided
  if (options?.show) {
    row.show = mapReplicatedShowToTrialJoinRow(options.show);
  } else {
    row.show = null;
  }

  return row;
};
