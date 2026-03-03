// ========================================
// OFA SCREENINGS
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbOFAScreeningInsert = Database['public']['Tables']['ofa_screenings']['Insert'];
export type DbOFAScreeningUpdate = Database['public']['Tables']['ofa_screenings']['Update'];

export const getAllOFAScreenings = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('ofa_screenings')
      .select('*')
      .order('test_date', { ascending: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('ofa_screening', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'ofa_screening', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'ofa_screening', 'select_all');
    logQuery('ofa_screening', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getOFAScreeningById = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('ofa_screenings')
      .select('*')
      .eq('id', id)
      .single();

    const duration = Date.now() - startTime;
    logQuery('ofa_screening', 'select_by_id', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'ofa_screening', 'select_by_id');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'ofa_screening', 'select_by_id');
    logQuery('ofa_screening', 'select_by_id', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const createOFAScreening = async (screening: DbOFAScreeningInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('ofa_screenings')
      .insert(screening)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('ofa_screening', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'ofa_screening', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'ofa_screening', 'insert');
    logQuery('ofa_screening', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateOFAScreening = async (id: string, updates: DbOFAScreeningUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('ofa_screenings')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('ofa_screening', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'ofa_screening', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'ofa_screening', 'update');
    logQuery('ofa_screening', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteOFAScreening = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase.from('ofa_screenings').delete().eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('ofa_screening', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'ofa_screening', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'ofa_screening', 'delete');
    logQuery('ofa_screening', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};
