// ========================================
// TRAINING JOURNAL ENTRIES
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbTrainingJournalEntryInsert =
  Database['public']['Tables']['training_journal_entries']['Insert'];
export type DbTrainingJournalEntryUpdate =
  Database['public']['Tables']['training_journal_entries']['Update'];
export type DbTrainingMilestoneInsert =
  Database['public']['Tables']['training_milestones']['Insert'];
export type DbTrainingMilestoneUpdate =
  Database['public']['Tables']['training_milestones']['Update'];
export type DbTrainingGoalInsert = Database['public']['Tables']['training_goals']['Insert'];
export type DbTrainingGoalUpdate = Database['public']['Tables']['training_goals']['Update'];

// --- Training Journal Entries ---

export const getAllTrainingEntries = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('training_journal_entries')
      .select('*')
      .order('date', { ascending: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('training_journal_entries', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_journal_entries', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_journal_entries', 'select_all');
    logQuery('training_journal_entries', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getTrainingEntryById = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('training_journal_entries')
      .select('*')
      .eq('id', id)
      .single();

    const duration = Date.now() - startTime;
    logQuery('training_journal_entries', 'select_by_id', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_journal_entries', 'select_by_id');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_journal_entries', 'select_by_id');
    logQuery('training_journal_entries', 'select_by_id', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const createTrainingEntry = async (entry: DbTrainingJournalEntryInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('training_journal_entries')
      .insert(entry)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('training_journal_entries', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_journal_entries', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_journal_entries', 'insert');
    logQuery('training_journal_entries', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateTrainingEntry = async (id: string, updates: DbTrainingJournalEntryUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('training_journal_entries')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('training_journal_entries', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_journal_entries', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_journal_entries', 'update');
    logQuery('training_journal_entries', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteTrainingEntry = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase.from('training_journal_entries').delete().eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('training_journal_entries', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_journal_entries', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_journal_entries', 'delete');
    logQuery('training_journal_entries', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};

// --- Training Goals ---

export const getAllTrainingGoals = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('training_goals')
      .select('*')
      .order('created_at', { ascending: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('training_goals', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_goals', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_goals', 'select_all');
    logQuery('training_goals', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const createTrainingGoal = async (goal: DbTrainingGoalInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.from('training_goals').insert(goal).select().single();

    const duration = Date.now() - startTime;
    logQuery('training_goals', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_goals', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_goals', 'insert');
    logQuery('training_goals', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateTrainingGoal = async (id: string, updates: DbTrainingGoalUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('training_goals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('training_goals', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_goals', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_goals', 'update');
    logQuery('training_goals', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// --- Training Milestones ---

export const getAllMilestones = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('training_milestones')
      .select('*')
      .order('date', { ascending: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('training_milestones', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_milestones', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_milestones', 'select_all');
    logQuery('training_milestones', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const createMilestone = async (milestone: DbTrainingMilestoneInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('training_milestones')
      .insert(milestone)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('training_milestones', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_milestones', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_milestones', 'insert');
    logQuery('training_milestones', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateMilestone = async (id: string, updates: DbTrainingMilestoneUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('training_milestones')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('training_milestones', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_milestones', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_milestones', 'update');
    logQuery('training_milestones', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteMilestone = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase.from('training_milestones').delete().eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('training_milestones', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'training_milestones', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'training_milestones', 'delete');
    logQuery('training_milestones', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};
