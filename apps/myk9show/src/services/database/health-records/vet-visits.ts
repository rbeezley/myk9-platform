// ========================================
// VET VISITS
// ========================================

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';

export type DbVetVisitInsert = Database['public']['Tables']['vet_visits']['Insert'];
export type DbVetVisitUpdate = Database['public']['Tables']['vet_visits']['Update'];

export const getAllVetVisits = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('vet_visits')
      .select('*')
      .order('visit_date', { ascending: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('vet_visit', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vet_visit', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vet_visit', 'select_all');
    logQuery('vet_visit', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const getVetVisitsRequiringFollowUp = async (dogId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('vet_visits')
      .select('*')
      .not('follow_up_date', 'is', null)
      .order('follow_up_date', { ascending: true, nullsFirst: false });

    if (dogId) {
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('vet_visit', 'select_follow_up', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vet_visit', 'select_follow_up');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vet_visit', 'select_follow_up');
    logQuery('vet_visit', 'select_follow_up', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export const createVetVisit = async (vetVisit: DbVetVisitInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('vet_visits')
      .insert(vetVisit)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('vet_visit', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vet_visit', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vet_visit', 'insert');
    logQuery('vet_visit', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updateVetVisit = async (id: string, updates: DbVetVisitUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('vet_visits')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('vet_visit', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vet_visit', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vet_visit', 'update');
    logQuery('vet_visit', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deleteVetVisit = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('vet_visits')
      .delete()
      .eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('vet_visit', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'vet_visit', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'vet_visit', 'delete');
    logQuery('vet_visit', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};
