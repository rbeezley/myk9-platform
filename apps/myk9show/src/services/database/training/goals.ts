// CRUD operations for training_goals — open-ended training objectives per Dog.

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbTrainingGoalInsert = Database['public']['Tables']['training_goals']['Insert'];
export type DbTrainingGoalUpdate = Database['public']['Tables']['training_goals']['Update'];

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
