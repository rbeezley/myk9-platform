// Read-side operations for Manual Results (owner-entered competition results).

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

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
