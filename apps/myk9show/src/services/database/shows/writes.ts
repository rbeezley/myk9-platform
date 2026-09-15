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

// Hard delete show (permanent removal)
export const hardDeleteShow = async (id: string) => {
  const startTime = Date.now();

  try {
    // MYK9-527: stripe_orders.show_id and .enrollment_id are ON DELETE RESTRICT
    // (migration 20260915191700), so a show carrying orders — directly or via
    // one of its enrollments — now fails with a raw 23503 instead of silently
    // nulling the ledger's scope columns. Check first so the admin sees what is
    // actually wrong. Counted with an explicit column, never `*`: a count over
    // `*` on a column-allowlisted table returns a bodyless 403.
    const { data: enrollmentRows, error: enrollmentError } = await supabase
      .from('enrollments')
      .select('id')
      .eq('show_id', id);
    if (enrollmentError) throw enrollmentError;

    const enrollmentIds = (enrollmentRows ?? []).map(row => row.id);
    // One query, so an order carrying BOTH the show_id and an enrollment_id of
    // that show is counted once rather than twice.
    const orFilter =
      enrollmentIds.length > 0
        ? `show_id.eq.${id},enrollment_id.in.(${enrollmentIds.join(',')})`
        : `show_id.eq.${id}`;

    const { count, error: countError } = await supabase
      .from('stripe_orders')
      .select('id', { count: 'exact', head: true })
      .or(orFilter);
    if (countError) throw countError;

    const orderCount = count ?? 0;

    if (orderCount > 0) {
      const guardError = new Error(showHasStripeOrdersMessage(orderCount)) as Error & {
        code?: string;
      };
      guardError.code = SHOW_HAS_STRIPE_ORDERS;
      throw guardError;
    }

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
