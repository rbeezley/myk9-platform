// ========================================
// ALLERGIES
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbAllergyInsert = Database['public']['Tables']['allergies']['Insert'];
export type DbAllergyUpdate = Database['public']['Tables']['allergies']['Update'];

export const getAllAllergies = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('allergies')
      .select('*')
      .order('diagnosed_date', { ascending: false, nullsFirst: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('allergy', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'allergy', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'allergy', 'select_all');
    logQuery('allergy', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getActiveAllergies = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('allergies')
      .select('*')
      .order('severity', { ascending: false, nullsFirst: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('allergy', 'select_active', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'allergy', 'select_active');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'allergy', 'select_active');
    logQuery('allergy', 'select_active', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const createAllergy = async (allergy: DbAllergyInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('allergies')
      .insert(allergy)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('allergy', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'allergy', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'allergy', 'insert');
    logQuery('allergy', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateAllergy = async (id: string, updates: DbAllergyUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('allergies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('allergy', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'allergy', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'allergy', 'update');
    logQuery('allergy', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteAllergy = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('allergies')
      .delete()
      .eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('allergy', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'allergy', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'allergy', 'delete');
    logQuery('allergy', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};
