// Read-side operations for Pedigrees (a Dog's ancestor lineage).

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

export const getPedigreeAncestors = async (dogId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('pedigree_ancestors')
      .select('*')
      .eq('dog_id', dogId)
      .order('position');

    const duration = Date.now() - startTime;
    logQuery('pedigree_ancestors', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'pedigree_ancestors', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'pedigree_ancestors', 'select_all');
    logQuery('pedigree_ancestors', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
