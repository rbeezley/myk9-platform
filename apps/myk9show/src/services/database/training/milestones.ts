// CRUD operations for training_milestones — dated achievements within a Dog's
// training journey. Function names are entity-prefixed ("TrainingMilestone")
// to avoid grep-collision with services/database/milestones/ (the user-platform
// milestone module, which covers a different concept entirely).

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbTrainingMilestoneInsert =
  Database['public']['Tables']['training_milestones']['Insert'];
export type DbTrainingMilestoneUpdate =
  Database['public']['Tables']['training_milestones']['Update'];

export const getAllTrainingMilestones = async (dogId?: string) => {
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

export const createTrainingMilestone = async (milestone: DbTrainingMilestoneInsert) => {
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

export const updateTrainingMilestone = async (id: string, updates: DbTrainingMilestoneUpdate) => {
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

export const deleteTrainingMilestone = async (id: string) => {
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
