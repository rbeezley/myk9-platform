// ========================================
// VACCINATIONS
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbVaccinationInsert = Database['public']['Tables']['vaccinations']['Insert'];
export type DbVaccinationUpdate = Database['public']['Tables']['vaccinations']['Update'];

export const getAllVaccinations = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('vaccinations')
      .select('*')
      .order('date_administered', { ascending: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('vaccination', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vaccination', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'select_all');
    logQuery('vaccination', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getVaccinationById = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('vaccinations')
      .select('*')
      .eq('id', id)
      .single();

    const duration = Date.now() - startTime;
    logQuery('vaccination', 'select_by_id', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vaccination', 'select_by_id');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'select_by_id');
    logQuery('vaccination', 'select_by_id', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const createVaccination = async (vaccination: DbVaccinationInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('vaccinations')
      .insert(vaccination)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('vaccination', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vaccination', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'insert');
    logQuery('vaccination', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateVaccination = async (id: string, updates: DbVaccinationUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('vaccinations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('vaccination', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vaccination', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'update');
    logQuery('vaccination', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteVaccination = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('vaccinations')
      .delete()
      .eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('vaccination', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vaccination', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'delete');
    logQuery('vaccination', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};

// Get upcoming vaccinations (due within next 30 days)
export const getUpcomingVaccinations = async (dogId?: string) => {
  const startTime = Date.now();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  try {
    let query = supabase
      .from('vaccinations')
      .select('*')
      .not('expiration_date', 'is', null)
      .lte('expiration_date', thirtyDaysFromNow.toISOString())
      .order('expiration_date', { ascending: true });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('vaccination', 'select_upcoming', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vaccination', 'select_upcoming');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vaccination', 'select_upcoming');
    logQuery('vaccination', 'select_upcoming', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
