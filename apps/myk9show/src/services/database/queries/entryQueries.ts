/**
 * Entry-related database queries
 *
 * Note: Each row in the entries table represents one dog's entry into one class.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { logger } from '@/services/LoggingService';
import type {
  DbEntryInsert,
  DbEntryUpdate,
} from '../../../types/database-mappings';

// Get all entries with related data
export const getAllEntries = async () => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(`
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
      `)
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
      .select(`
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
      `)
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
      .select(`
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
      `)
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

// Get entries by class ID
export const getEntriesByClass = async (classId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(`
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
      `)
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
      .select(`
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
      `)
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
      .select(`
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
      `)
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

// Create new entry
export const createEntry = async (entryData: DbEntryInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .insert(entryData)
      .select(`
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
      `)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'insert');
    logQuery('entries', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update entry
export const updateEntry = async (params: { id: string; updates: DbEntryUpdate }) => {
  const { id, updates } = params;
  const startTime = Date.now();

  try {
    // Add updated_at timestamp
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('entries')
      .update(updateData)
      .eq('id', id)
      .select(`
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
      `)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update');
    logQuery('entries', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Delete entry (soft delete)
export const deleteEntry = async (id: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('entries', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'delete');
    }

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'delete');
    logQuery('entries', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};

// Update entry status
export const updateEntryStatus = async (params: {
  id: string;
  status: string;
  userId: string;
  reason?: string;
}) => {
  const { id, status, userId, reason } = params;
  const startTime = Date.now();

  try {
    // Update entry status
    const { data: entryData, error: entryError } = await supabase
      .from('entries')
      .update({
        entry_status: status,
        special_requests: reason ? `Status changed: ${reason}` : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (entryError) {
      throw createDatabaseError(entryError, 'entries', 'update_status');
    }

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_status', duration);

    // Log for debugging (userId is for audit purposes)
    logger.debug(`Entry ${id} status updated to ${status} by user ${userId}`, 'database', {});

    return { data: entryData, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_status');
    logQuery('entries', 'update_status', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Bulk create entries
export const createMultipleEntries = async (entriesData: DbEntryInsert[]) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .insert(entriesData)
      .select(`
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
      `);

    const duration = Date.now() - startTime;
    logQuery('entries', 'bulk_insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'bulk_insert');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'bulk_insert');
    logQuery('entries', 'bulk_insert', duration, dbError.message);
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
      data.forEach((entry) => {
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
      const paidEntries = data.filter((e) => e.payment_status === 'paid').length;
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
      .select(`
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
      `)
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

// Update entry details (jump height, handler, etc.)
export const updateEntryDetails = async (params: {
  entryId: string;
  updates: {
    entry_status?: string;
    jump_height?: string;
    handler?: string;
  };
}) => {
  const startTime = Date.now();
  const { entryId, updates } = params;

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_details', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update_details');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_details');
    logQuery('entries', 'update_details', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update entry handler
export const updateEntryHandler = async (params: { entryId: string; handler: string }) => {
  const startTime = Date.now();
  const { entryId, handler } = params;

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        handler,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_handler', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update_handler');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_handler');
    logQuery('entries', 'update_handler', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Withdraw (scratch) an entry
export const withdrawEntry = async (entryId: string) => {
  return updateEntryDetails({
    entryId,
    updates: { entry_status: 'withdrawn' },
  });
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

// Search entries by armband or handler name
export const searchEntries = async (searchTerm: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(`
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
      `)
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
