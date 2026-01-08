// Show-related database queries
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type {
  DbShowInsert,
  DbShowUpdate,
} from '../../../types/database-mappings';

// Get all shows with club and trial information (excluding soft-deleted)
export const getAllShows = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('shows' as 'show')
      .select(`
        *,
        club:clubs(
          id,
          name
        ),
        trials(
          id,
          name,
          date,
          trial_number,
          status,
          max_entries_per_dog,
          max_total_entries,
          max_entries_per_handler
        )
      `)
      .is('deleted_at', null)
      .order('start_date', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('show', 'select_all_detailed', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'select_all');
    logQuery('show', 'select_all_detailed', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get show by ID with complete details (excluding soft-deleted)
export const getShowById = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('shows' as 'show')
      .select(`
        *,
        club:clubs(
          id,
          name,
          address,
          phone,
          email,
          website
        ),
        trials(
          id,
          name,
          date,
          trial_number,
          status,
          max_entries_per_dog,
          max_total_entries,
          max_entries_per_handler
        ),
        judge_assignments(
          id,
          judge_id,
          assignment_type,
          assigned_classes,
          assigned_rings,
          assignment_date,
          assignment_status,
          compensation_amount,
          expenses_covered,
          travel_provided,
          special_requirements,
          notes,
          confirmed_by,
          confirmed_at,
          judge:user(
            id,
            first_name,
            last_name,
            email
          )
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    const duration = Date.now() - startTime;
    logQuery('show', 'select_by_id_complete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show', 'select_by_id');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'select_by_id');
    logQuery('show', 'select_by_id_complete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get upcoming shows (excluding soft-deleted)
export const getUpcomingShows = async (limit = 10) => {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const { data, error } = await supabase
      .from('shows' as 'show')
      .select(`
        *,
        club:clubs(
          id,
          name
        ),
        trials(
          id,
          name,
          date,
          trial_number,
          status
        )
      `)
      .gte('start_date', today)
      .is('deleted_at', null)
      .order('start_date', { ascending: true })
      .limit(limit);
    
    const duration = Date.now() - startTime;
    logQuery('show', 'select_upcoming', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show', 'select_upcoming');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'select_upcoming');
    logQuery('show', 'select_upcoming', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get shows by date range (excluding soft-deleted)
export const getShowsByDateRange = async (startDate: string, endDate: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('shows' as 'show')
      .select(`
        *,
        club:clubs(
          id,
          name
        ),
        trials(
          id,
          name,
          date,
          trial_number,
          status
        )
      `)
      .gte('start_date', startDate)
      .lte('end_date', endDate)
      .is('deleted_at', null)
      .order('start_date', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('show', 'select_by_date_range', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show', 'select_by_date_range');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'select_by_date_range');
    logQuery('show', 'select_by_date_range', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get shows by club (excluding soft-deleted)
export const getShowsByClub = async (clubId: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('shows' as 'show')
      .select(`
        *,
        club:clubs(
          id,
          name
        ),
        trials(
          id,
          name,
          date,
          trial_number,
          status
        )
      `)
      .eq('club_id', clubId)
      .is('deleted_at', null)
      .order('start_date', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('show', 'select_by_club', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show', 'select_by_club');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'select_by_club');
    logQuery('show', 'select_by_club', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Create new show
export const createShow = async (showData: DbShowInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('shows' as 'show')
      .insert([showData])
      .select(`
        *,
        club:clubs(
          id,
          name,
          address
        )
      `)
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
      .from('shows' as 'show')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        club:clubs(
          id,
          name,
          address
        )
      `)
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
    const updateData: Record<string, unknown> = {
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (deletedBy) {
      updateData.deleted_by = deletedBy;
    }

    const { data, error } = await supabase
      .from('shows' as 'show')
      .update(updateData)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id, name')
      .single();

    const duration = Date.now() - startTime;
    logQuery('show', 'soft_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'soft_delete');
    }

    return { data, error: null };
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
    const { data, error } = await supabase
      .from('shows' as 'show')
      .delete()
      .eq('id', id)
      .select('id, name');
    
    const duration = Date.now() - startTime;
    logQuery('show', 'hard_delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show', 'hard_delete');
    }
    
    const deletedShow = Array.isArray(data) ? data[0] : data;
    return { data: deletedShow || null, error: null };
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

  try {
    const updateData: Record<string, unknown> = {
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString(),
    };

    if (restoredBy) {
      updateData.updated_by = restoredBy;
    }

    const { data, error } = await supabase
      .from('shows' as 'show')
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
      .from('shows' as 'show')
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

// Legacy hard delete show (kept for compatibility)
export const legacyDeleteShow = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('shows' as 'show')
      .delete()
      .eq('id', id)
      .select('id, name')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('show', 'delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show', 'delete');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'delete');
    logQuery('show', 'delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Search shows by name or location (excluding soft-deleted)
export const searchShows = async (searchTerm: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('shows' as 'show')
      .select('*')
      .or(`name.ilike.%${searchTerm}%,location.ilike.%${searchTerm}%`)
      .is('deleted_at', null)
      .order('start_date', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('show', 'search', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show', 'search');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'search');
    logQuery('show', 'search', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get show statistics (excluding soft-deleted)
export const getShowStatistics = async () => {
  const startTime = Date.now();
  
  try {
    const { error, count } = await supabase
      .from('shows' as 'show')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    
    const duration = Date.now() - startTime;
    
    if (error) {
      throw createDatabaseError(error, 'show', 'statistics');
    }
    
    const stats = {
      total: count || 0,
    };
    
    logQuery('show', 'statistics', duration);
    return { data: stats, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'statistics');
    logQuery('show', 'statistics', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get shows with entry counts (simplified, excluding soft-deleted)
export const getShowsWithEntryCounts = async () => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('shows' as 'show')
      .select(`
        *,
        club:clubs(
          id,
          name
        )
      `)
      .is('deleted_at', null)
      .order('start_date', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('show', 'select_with_entry_counts', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show', 'select_with_entry_counts');
    }
    
    // Add basic entry count as 0 for now
    const dataWithCounts = data?.map(show => ({
      ...show,
      entry_count: 0,
    })) || [];
    
    return { data: dataWithCounts, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'select_with_entry_counts');
    logQuery('show', 'select_with_entry_counts', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get shows by status (excluding soft-deleted)
export const getShowsByStatus = async (status: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('shows' as 'show')
      .select('*')
      .eq('status', status)
      .is('deleted_at', null)
      .order('start_date', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('show', 'select_by_status', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'show', 'select_by_status');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'select_by_status');
    logQuery('show', 'select_by_status', duration, dbError.message);
    return { data: [], error: dbError };
  }
};