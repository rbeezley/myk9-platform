import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { DbShowInsert, DbShowUpdate } from '../../../types/database-mappings';
import type { TablesUpdate } from '@/types/supabase';

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
export const deleteShow = async (id: string, deletedBy?: string) => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('soft_delete_show', { p_show_id: id });

    const duration = Date.now() - startTime;
    logQuery('show', 'soft_delete', duration, error?.message);

    if (error) {
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

// Hard delete show (permanent removal)
export const hardDeleteShow = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.from('shows').delete().eq('id', id).select('id, name');

    const duration = Date.now() - startTime;
    logQuery('show', 'hard_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'hard_delete');
    }

    // RLS silently returns 0 rows instead of an error when the policy rejects
    // the DELETE: without this check, the UI would claim success while the row
    // persisted. Same class of silent-failure bug as migration 135.
    const deletedShow = Array.isArray(data) ? data[0] : data;
    if (!deletedShow) {
      throw new Error(
        'Show was not deleted. You may not have permission to permanently delete this show, or it no longer exists.'
      );
    }
    return { data: deletedShow, error: null };
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
    const updateData: TablesUpdate<'shows'> = {
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('shows')
      .update(updateData)
      .eq('id', id)
      .select('id, name')
      .single();

    const duration = Date.now() - startTime;
    logQuery('show', 'restore', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'restore');
    }

    return { data, error: null };
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
    const { data, error } = await supabase
      .from('shows')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

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
