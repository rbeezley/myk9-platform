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
    eventNumber: undefined, // Not in current database schema
    type: undefined, // Not in current database schema
    order: undefined, // Not in current database schema
    trialType: undefined, // Not in current database schema
    image: undefined, // Not in current database schema
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
  };
};