/**
 * Entry lookup and search queries
 *
 * Read-only operations for fetching, filtering, and searching entries.
 * Includes statistics aggregation and eligibility checks.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

// Get all entries with related data
export const getAllEntries = async () => {
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
            email,
            phone
          )
        ),
        class:class_id (
          id,
          name,
          class_number,
          entry_fee,
          max_entries
        ),
        show:show_id (
          id,
          name,
          start_date,
          end_date,
          location,
          status
        )
      `
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_all_with_details', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_all');
    logQuery('entries', 'select_all_with_details', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entry by ID with full details
export const getEntryById = async (id: string) => {
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
          registration_number,
          owner:owner_id (
            id,
            first_name,
            last_name,
            email,
            phone,
            address,
            city,
            state,
            postal_code
          )
        ),
        class:class_id (
          id,
          name,
          class_number,
          description,
          entry_fee,
          max_entries,
          jump_height
        ),
        show:show_id (
          id,
          name,
          start_date,
          end_date,
          location,
          status
        )
      `
      )
      .eq('id', id)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_id_detailed', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_id');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_id');
    logQuery('entries', 'select_by_id_detailed', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get entries by show ID
export const getEntriesByShow = async (showId: string) => {
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
        )
      `
      )
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_show', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_show');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_show');
    logQuery('entries', 'select_by_show', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entries by show ID with financial joins (promo_code, trial name)
export const getEntriesByShowForFinancials = async (showId: string) => {
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
        promo_code:promo_code_id (
          id,
          code,
          discount_type,
          discount_value
        ),
        trial:trial_id (
          id,
          name
        )
      `
      )
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_show_financials', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_show_financials');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_show_financials');
    logQuery('entries', 'select_by_show_financials', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entries by trial ID (for financial summary)
export const getEntriesByTrial = async (trialId: string) => {
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
        promo_code:promo_code_id (
          id,
          code,
          discount_type,
          discount_value
        )
      `
      )
      .eq('trial_id', trialId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_trial', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_trial');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_trial');
    logQuery('entries', 'select_by_trial', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entries by class ID
export const getEntriesByClass = async (classId: string) => {
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
        )
      `
      )
      .eq('class_id', classId)
      .is('deleted_at', null)
      .order('armband', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_class', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_class');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_class');
    logQuery('entries', 'select_by_class', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entries by dog ID
export const getEntriesByDog = async (dogId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        *,
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
          end_date,
          location
        )
      `
      )
      .eq('dog_id', dogId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_dog', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_dog');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_dog');
    logQuery('entries', 'select_by_dog', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entries by status
export const getEntriesByStatus = async (status: string) => {
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
      .eq('entry_status', status)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_status', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_status');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_status');
    logQuery('entries', 'select_by_status', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

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
