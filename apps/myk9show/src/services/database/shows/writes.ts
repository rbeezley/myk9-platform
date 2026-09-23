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

// MYK9-527: the code the ledger guard below stamps on its refusal. The Data
// Lifecycle tab keys on it to render the guard's own message instead of its
// generic "please try again", because retrying is exactly the wrong advice —
// the delete is refused until the orders are resolved, not failing transiently.
export const SHOW_HAS_STRIPE_ORDERS = 'SHOW_HAS_STRIPE_ORDERS';

export const showHasStripeOrdersMessage = (count: number) =>
  `This show has ${count} Stripe order${count === 1 ? '' : 's'}; refunds and reconciliation still reference them. Resolve or reassign those orders before deleting the show permanently.`;

const HARD_DELETE_SHOW_ERROR_MESSAGES: Record<string, string> = {
  '23503':
    'This show has records that must be kept for history and reconciliation, so it cannot be permanently deleted.',
  '55P03':
    'Show deletion could not be completed because the database is busy. No data was deleted. An operator may retry during a quiet window; automatic retries are disabled.',
  '40P01':
    'Show deletion could not be completed because the database is busy. No data was deleted. An operator may retry during a quiet window; automatic retries are disabled.',
  '42501': 'Only a site administrator can permanently delete a show.',
};

// Hard delete show (permanent removal)
export const hardDeleteShow = async (id: string) => {
  const startTime = Date.now();

  try {
    // The RPC owns authorization, eligibility checks, locking, and the FK-safe
    // delete sequence. It returns void, so the service returns the confirmed ID
    // in the established { data, error } shape for its callers.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('hard_delete_show', { p_show_id: id });

    const duration = Date.now() - startTime;
    logQuery('show', 'hard_delete', duration, error?.message);

    if (error) {
      const dbError = createDatabaseError(error, 'show', 'hard_delete');
      const specificMessage = dbError.code ? HARD_DELETE_SHOW_ERROR_MESSAGES[dbError.code] : null;
      if (specificMessage) dbError.message = specificMessage;
      throw dbError;
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
