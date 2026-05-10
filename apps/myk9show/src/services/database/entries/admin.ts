/**
 * Entry admin operations.
 *
 * These are permanent deletion and restore flows for lifecycle management.
 * Normal Entry creation, updates, and soft deletion live in writes.ts.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

export const hardDeleteEntry = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase.from('entries').delete().eq('id', id);
    const duration = Date.now() - startTime;
    logQuery('entries', 'hard_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'hard_delete');
    }

    return { data: null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'hard_delete');
    logQuery('entries', 'hard_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const restoreEntry = async (id: string, restoredBy?: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString(),
        updated_by: restoredBy || null,
      })
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select(
        `
        *,
        dog:dog_id (
          id,
          name,
          breed
        ),
        class:class_id (
          id,
          name,
          level
        )
      `
      )
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'restore', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'restore');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'restore');
    logQuery('entries', 'restore', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const getDeletedEntries = async () => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        *,
        dog:dog_id (
          id,
          name,
          breed,
          owner:owner_id (
            id,
            first_name,
            last_name
          )
        ),
        class:class_id (
          id,
          name,
          level,
          trial:trial_id (
            id,
            name,
            date
          )
        ),
        deleted_by_user:deleted_by (
          id,
          first_name,
          last_name,
          email
        )
      `
      )
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_deleted', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_deleted');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_deleted');
    logQuery('entries', 'select_deleted', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
