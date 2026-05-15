// Write-side operations for Pedigrees (ancestor rows in the pedigree_ancestors table).

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { DbPedigreeAncestorInsert, DbPedigreeAncestorUpdate } from '@/types/database-mappings';

export const upsertPedigreeAncestor = async (entry: DbPedigreeAncestorInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('pedigree_ancestors')
      .upsert(entry, { onConflict: 'dog_id,position' })
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('pedigree_ancestors', 'upsert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'pedigree_ancestors', 'upsert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'pedigree_ancestors', 'upsert');
    logQuery('pedigree_ancestors', 'upsert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const updatePedigreeAncestor = async (id: string, updates: DbPedigreeAncestorUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('pedigree_ancestors')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('pedigree_ancestors', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'pedigree_ancestors', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'pedigree_ancestors', 'update');
    logQuery('pedigree_ancestors', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const deletePedigreeAncestor = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase.from('pedigree_ancestors').delete().eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('pedigree_ancestors', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'pedigree_ancestors', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'pedigree_ancestors', 'delete');
    logQuery('pedigree_ancestors', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};
