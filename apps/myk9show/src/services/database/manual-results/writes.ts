// Write-side operations for Manual Results.

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { DbManualResultInsert, DbManualResultUpdate } from '@/types/database-mappings';

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
