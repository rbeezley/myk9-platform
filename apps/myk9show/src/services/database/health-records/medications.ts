// ========================================
// MEDICATIONS
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbMedicationInsert = Database['public']['Tables']['medications']['Insert'];
export type DbMedicationUpdate = Database['public']['Tables']['medications']['Update'];

export const getAllMedications = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('medications')
      .select('*')
      .order('start_date', { ascending: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('medication', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'medication', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'medication', 'select_all');
    logQuery('medication', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getActiveMedications = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('medications')
      .select('*')
      .eq('is_active', true)
      .order('start_date', { ascending: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('medication', 'select_active', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'medication', 'select_active');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'medication', 'select_active');
    logQuery('medication', 'select_active', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const createMedication = async (medication: DbMedicationInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('medications')
      .insert(medication)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('medication', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'medication', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'medication', 'insert');
    logQuery('medication', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateMedication = async (id: string, updates: DbMedicationUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('medications')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('medication', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'medication', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'medication', 'update');
    logQuery('medication', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteMedication = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('medications')
      .delete()
      .eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('medication', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'medication', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'medication', 'delete');
    logQuery('medication', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};
