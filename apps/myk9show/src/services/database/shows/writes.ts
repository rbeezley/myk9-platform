import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { DbShowInsert, DbShowUpdate } from '../../../types/database-mappings';
import type { TablesUpdate } from '@/types/supabase';
import { classifyShowDeleteError } from './deleteOutcome';

// Create new show
export const createShow = async (showData: DbShowInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('shows')
      .insert([showData])
      .select(
        `
        *,
        club:clubs(
          id,
          name,
          address,
          logo_url,
          cover_image_url,
          accent_color
        )
      `
      )
      .single();

    const duration = Date.now() - startTime;
    logQuery('show', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'insert');
    logQuery('show', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update show
export const updateShow = async (id: string, updates: DbShowUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('shows')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        `
        *,
        club:clubs(
          id,
          name,
          address,
          logo_url,
          cover_image_url,
          accent_color
        )
      `
      )
      .single();

    const duration = Date.now() - startTime;
    logQuery('show', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'update');
    logQuery('show', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Soft delete show
/** Options for the soft-delete RPCs that carry the paid/scored guard. */
export interface SoftDeleteOptions {
  /** Site-admin override of the MK010 guard; the server refuses it for anyone else. */
  override?: boolean;
}

export const deleteShow = async (
  id: string,
  deletedBy?: string,
  options: SoftDeleteOptions = {}
) => {
  const startTime = Date.now();

  try {
    const updateData: TablesUpdate<'shows'> = {
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (deletedBy) {
      updateData.deleted_by = deletedBy;
    }

    // Use the existing SECURITY DEFINER RPC so show soft delete follows the
    // same RLS-safe pattern as dog soft delete while preserving permission
    // checks inside the database function.
    const { error } = await supabase.rpc('soft_delete_show', {
      p_show_id: id,
      ...(options.override ? { p_override: true } : {}),
    });

    const duration = Date.now() - startTime;
    logQuery('show', 'soft_delete', duration, error?.message);

    if (error) {
      // Already soft-deleted (a prior attempt landed, or another device did it):
      // the show is gone, which is what the caller asked for. Report success so
      // the caller still drops it from its lists instead of showing a failure.
      if (classifyShowDeleteError(error) === 'already-deleted') {
        return {
          data: { id, deleted_at: updateData.deleted_at as string, deleted_by: null },
          error: null,
          alreadyDeleted: true,
        };
      }
      throw createDatabaseError(error, 'show', 'soft_delete');
    }

    return {
      data: {
        id,
        deleted_at: updateData.deleted_at as string,
        deleted_by: (updateData.deleted_by as string | null) ?? null,
      },
      error: null,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'soft_delete');
    logQuery('show', 'soft_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Hard delete show (permanent removal). hard_delete_show owns authorization,
// locking and the eligibility checks: only an unused show is deleted, and a
// refusal (MK615) carries the sentence to show the admin (MYK9-1472). It
// returns void, so the confirmed id is returned in the usual { data, error }.
export const hardDeleteShow = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase.rpc('hard_delete_show', { p_show_id: id });

    const duration = Date.now() - startTime;
    logQuery('show', 'hard_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'hard_delete');
    }

    return { data: { id }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'hard_delete');
    logQuery('show', 'hard_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Restore soft-deleted show (admin only)
export const restoreShow = async (id: string, restoredBy?: string) => {
  const startTime = Date.now();
  void restoredBy;

  try {
    // shows_select RLS hides soft-deleted rows from every role, so a direct
    // UPDATE matches 0 rows (the SELECT policy gates the UPDATE's row-location
    // step). Restore via an admin-gated SECURITY DEFINER RPC that also
    // cascade-restores the show's trials/classes/entries (migration 20260617120000).
    const { data, error } = await supabase.rpc('restore_show', { p_show_id: id });

    const duration = Date.now() - startTime;
    logQuery('show', 'restore', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'restore');
    }

    const restored = Array.isArray(data) ? data[0] : data;
    return { data: restored ?? null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'restore');
    logQuery('show', 'restore', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get soft-deleted shows (admin only)
export const getDeletedShows = async () => {
  const startTime = Date.now();

  try {
    // shows_select RLS hides soft-deleted rows from every role; list via an
    // admin-gated SECURITY DEFINER RPC (migration 20260616140000).
    const { data, error } = await supabase.rpc('get_deleted_shows');

    const duration = Date.now() - startTime;
    logQuery('show', 'select_deleted', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'select_deleted');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'select_deleted');
    logQuery('show', 'select_deleted', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
