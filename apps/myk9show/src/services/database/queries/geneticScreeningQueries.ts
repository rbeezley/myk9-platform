// ========================================
// GENETIC SCREENINGS
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbGeneticScreeningInsert =
  Database['public']['Tables']['genetic_screenings']['Insert'];
export type DbGeneticScreeningUpdate =
  Database['public']['Tables']['genetic_screenings']['Update'];

export const getAllGeneticScreenings = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('genetic_screenings')
      .select('*')
      .order('test_date', { ascending: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('genetic_screening', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'genetic_screening', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'genetic_screening', 'select_all');
    logQuery('genetic_screening', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getGeneticScreeningById = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('genetic_screenings')
      .select('*')
      .eq('id', id)
      .single();

    const duration = Date.now() - startTime;
    logQuery('genetic_screening', 'select_by_id', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'genetic_screening', 'select_by_id');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'genetic_screening', 'select_by_id');
    logQuery('genetic_screening', 'select_by_id', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const createGeneticScreening = async (screening: DbGeneticScreeningInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('genetic_screenings')
      .insert(screening)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('genetic_screening', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'genetic_screening', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'genetic_screening', 'insert');
    logQuery('genetic_screening', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateGeneticScreening = async (id: string, updates: DbGeneticScreeningUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('genetic_screenings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('genetic_screening', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'genetic_screening', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'genetic_screening', 'update');
    logQuery('genetic_screening', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteGeneticScreening = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase.from('genetic_screenings').delete().eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('genetic_screening', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'genetic_screening', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'genetic_screening', 'delete');
    logQuery('genetic_screening', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};
