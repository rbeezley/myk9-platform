// Manual results database queries
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbManualResultInsert = Database['public']['Tables']['manual_results']['Insert'];
export type DbManualResultUpdate = Database['public']['Tables']['manual_results']['Update'];

export const getAllManualResults = async (dogId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('manual_results')
      .select('*')
      .eq('dog_id', dogId)
      .order('trial_date', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('manual_results', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'manual_results', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'manual_results', 'select_all');
    logQuery('manual_results', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getQualifyingManualResults = async (dogId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('manual_results')
      .select('*')
      .eq('dog_id', dogId)
      .eq('result_status', 'qualified')
      .order('trial_date', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('manual_results', 'select_qualifying', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'manual_results', 'select_qualifying');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'manual_results', 'select_qualifying');
    logQuery('manual_results', 'select_qualifying', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getManualResultById = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.from('manual_results').select('*').eq('id', id).single();

    const duration = Date.now() - startTime;
    logQuery('manual_results', 'select_by_id', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'manual_results', 'select_by_id');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'manual_results', 'select_by_id');
    logQuery('manual_results', 'select_by_id', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const createManualResult = async (entry: DbManualResultInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.from('manual_results').insert(entry).select().single();

    const duration = Date.now() - startTime;
    logQuery('manual_results', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'manual_results', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'manual_results', 'insert');
    logQuery('manual_results', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateManualResult = async (id: string, updates: DbManualResultUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('manual_results')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('manual_results', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'manual_results', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'manual_results', 'update');
    logQuery('manual_results', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteManualResult = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase.from('manual_results').delete().eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('manual_results', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'manual_results', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'manual_results', 'delete');
    logQuery('manual_results', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};
