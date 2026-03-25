/**
 * Entry statistics, search, and eligibility queries
 *
 * Read-only operations for statistics aggregation, searching, and eligibility checks.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

// Get entry statistics for a show
export const getEntryStatistics = async (showId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('entries')
      .select('entry_status, entry_fee, payment_status')
      .is('deleted_at', null);

    if (showId) {
      query = query.eq('show_id', showId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('entries', 'statistics', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'statistics');
    }

    // Calculate statistics
    const stats = {
      totalEntries: data?.length || 0,
      byStatus: {} as Record<string, number>,
      totalRevenue: 0,
      paidRevenue: 0,
      completionRate: 0,
    };

    if (data) {
      data.forEach(entry => {
        // Count by status
        const status = entry.entry_status || 'unknown';
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

        // Calculate revenue
        const fee = entry.entry_fee || 0;
        stats.totalRevenue += fee;

        if (entry.payment_status === 'paid') {
          stats.paidRevenue += fee;
        }
      });

      // Calculate completion rate
      const completedEntries = stats.byStatus['completed'] || 0;
      const paidEntries = data.filter(e => e.payment_status === 'paid').length;
      stats.completionRate = paidEntries > 0 ? (completedEntries / paidEntries) * 100 : 0;
    }

    return { data: stats, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'statistics');
    logQuery('entries', 'statistics', duration, dbError.message);
    return {
      data: {
        totalEntries: 0,
        byStatus: {},
        totalRevenue: 0,
        paidRevenue: 0,
        completionRate: 0,
      },
      error: dbError,
    };
  }
};

// Get entries for the current user
export const getUserEntries = async (userId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        id,
        dog_id,
        show_id,
        class_id,
        trial_id,
        handler,
        handler_id,
        payment_status,
        entry_status,
        entry_fee,
        armband,
        run_order,
        jump_height,
        special_requests,
        is_scored,
        result_status,
        search_time_seconds,
        total_faults,
        final_placement,
        submitted_at,
        created_at,
        updated_at,
        registration_id,
        registration:registration_id (
          id,
          confirmation_number
        ),
        dog:dog_id (
          id,
          name,
          call_name,
          breed
        ),
        show:show_id (
          id,
          name,
          start_date,
          end_date,
          venue,
          city,
          state
        ),
        class:class_id (
          id,
          name,
          class_number
        )
      `
      )
      .eq('handler_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_user_entries', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_user_entries');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_user_entries');
    logQuery('entries', 'select_user_entries', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Search entries by armband or handler name
export const searchEntries = async (searchTerm: string) => {
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
          call_name,
          breed,
          owner:owner_id (
            id,
            first_name,
            last_name,
            email
          )
        ),
        class:class_id (
          id,
          name,
          class_number,
          entry_fee
        ),
        show:show_id (
          id,
          name,
          start_date,
          end_date
        )
      `
      )
      .or(`armband.ilike.%${searchTerm}%,handler.ilike.%${searchTerm}%`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50);

    const duration = Date.now() - startTime;
    logQuery('entries', 'search', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'search');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'search');
    logQuery('entries', 'search', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Check if entry can be modified (show is still accepting entries)
export const canModifyEntry = async (
  showId: string
): Promise<{ canModify: boolean; reason?: string }> => {
  const startTime = Date.now();

  try {
    const { data: show, error } = await supabase
      .from('shows')
      .select('entry_close_date, status')
      .eq('id', showId)
      .single();

    const duration = Date.now() - startTime;
    logQuery('shows', 'check_can_modify', duration, error?.message);

    if (error || !show) {
      return { canModify: false, reason: 'Show not found' };
    }

    const now = new Date();
    const closeDate = show.entry_close_date ? new Date(show.entry_close_date) : null;

    if (closeDate && closeDate < now) {
      return { canModify: false, reason: 'Entry deadline has passed' };
    }

    if (show.status === 'completed' || show.status === 'cancelled') {
      return { canModify: false, reason: 'Show is no longer active' };
    }

    return { canModify: true };
  } catch {
    return { canModify: false, reason: 'Unable to verify modification eligibility' };
  }
};
