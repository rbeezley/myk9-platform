// ========================================
// HEALTH RECORDS (Parent table)
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbHealthRecordInsert = Database['public']['Tables']['health_records']['Insert'];
export type DbHealthRecordUpdate = Database['public']['Tables']['health_records']['Update'];

export const getAllHealthRecords = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('health_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('health_record', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'health_record', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_record', 'select_all');
    logQuery('health_record', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getHealthRecordById = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('health_records')
      .select('*')
      .eq('id', id)
      .single();

    const duration = Date.now() - startTime;
    logQuery('health_record', 'select_by_id', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'health_record', 'select_by_id');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_record', 'select_by_id');
    logQuery('health_record', 'select_by_id', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const createHealthRecord = async (healthRecord: DbHealthRecordInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('health_records')
      .insert(healthRecord)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('health_record', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'health_record', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_record', 'insert');
    logQuery('health_record', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateHealthRecord = async (id: string, updates: DbHealthRecordUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('health_records')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('health_record', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'health_record', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_record', 'update');
    logQuery('health_record', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteHealthRecord = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('health_records')
      .delete()
      .eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('health_record', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'health_record', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'health_record', 'delete');
    logQuery('health_record', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};
