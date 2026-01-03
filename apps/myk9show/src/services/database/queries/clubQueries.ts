// Club-related database queries
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type {
  DbClubInsert,
  DbClubUpdate,
} from '../../../types/database-mappings';

// Get all clubs
export const getAllClubs = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('club')
      .select(`
        *,
        show(
          id,
          name,
          start_date,
          end_date,
          status
        )
      `)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('club', 'select_all_with_shows', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'select_all');
    logQuery('club', 'select_all_with_shows', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get club by ID with complete details
export const getClubById = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('club')
      .select(`
        *,
        show(
          id,
          name,
          start_date,
          end_date,
          status,
          location,
          show_trials(
            id,
            trial_name,
            trial_type,
            trial_date,
            class(
              id,
              name,
              entry(id)
            )
          )
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('club', 'select_by_id_detailed', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'select_by_id');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'select_by_id');
    logQuery('club', 'select_by_id_detailed', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get clubs by search term (since clubs table doesn't have state column)
export const searchClubsByLocation = async (searchTerm: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('club')
      .select('*')
      .or(`address.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%`)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('club', 'search_by_location', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'search_by_location');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'search_by_location');
    logQuery('club', 'search_by_location', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get clubs with basic info (organization field doesn't exist in schema)
export const getActiveClubs = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('club')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('club', 'select_active', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'select_active');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'select_active');
    logQuery('club', 'select_active', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Create new club
export const createClub = async (clubData: DbClubInsert) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('club')
      .insert([clubData])
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('club', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'insert');
    logQuery('club', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update club
export const updateClub = async (id: string, updates: DbClubUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('club')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('club', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'update');
    logQuery('club', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Soft delete club (sets deleted_at timestamp and tracks who deleted it)
export const deleteClub = async (id: string, deletedBy?: string) => {
  const startTime = Date.now();
  
  console.log('🗑️ Database deleteClub called:', { id, deletedBy });
  
  try {
    const updateData: Record<string, unknown> = {
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    if (deletedBy) {
      updateData.deleted_by = deletedBy;
      updateData.updated_by = deletedBy;
    }
    
    console.log('📝 Update data being sent:', updateData);
    
    const { data, error } = await supabase
      .from('club')
      .update(updateData)
      .eq('id', id)
      .select('id, name, deleted_at, deleted_by')
      .single();
    
    console.log('📊 Database response:', { data, error });
    
    const duration = Date.now() - startTime;
    logQuery('club', 'soft_delete', duration, error?.message);
    
    if (error) {
      console.error('❌ Supabase error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw createDatabaseError(error, 'club', 'soft_delete');
    }

    if (!data) {
      console.error('❌ No data returned from delete operation');
      throw new Error('Delete operation returned no data');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'soft_delete');
    logQuery('club', 'soft_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Hard delete club (permanent removal - admin only)
export const hardDeleteClub = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('club')
      .delete()
      .eq('id', id)
      .select('id, name')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('club', 'hard_delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'hard_delete');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'hard_delete');
    logQuery('club', 'hard_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Restore soft-deleted club (admin only)
export const restoreClub = async (id: string, restoredBy?: string) => {
  const startTime = Date.now();
  
  try {
    const updateData: Record<string, unknown> = {
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString()
    };
    
    if (restoredBy) {
      updateData.updated_by = restoredBy;
    }
    
    const { data, error } = await supabase
      .from('club')
      .update(updateData)
      .eq('id', id)
      .select('id, name')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('club', 'restore', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'restore');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'restore');
    logQuery('club', 'restore', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get soft-deleted clubs (admin only)
export const getDeletedClubs = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('club')
      .select(`
        *,
        deleted_by_user:deleted_by(id, email, first_name, last_name)
      `)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('club', 'select_deleted', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'select_deleted');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'select_deleted');
    logQuery('club', 'select_deleted', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Search clubs by name or address
export const searchClubs = async (searchTerm: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('club')
      .select('*')
      .or(`name.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%`)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('club', 'search', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'search');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'search');
    logQuery('club', 'search', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get clubs with show counts
export const getClubsWithShowCounts = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('club')
      .select(`
        *,
        show(id)
      `)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('club', 'select_with_show_counts', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'select_with_show_counts');
    }
    
    // Transform data to include show count
    const dataWithCounts = data?.map(club => ({
      ...club,
      show_count: club.show?.length || 0,
    })) || [];
    
    return { data: dataWithCounts, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'select_with_show_counts');
    logQuery('club', 'select_with_show_counts', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get club statistics
export const getClubStatistics = async () => {
  const startTime = Date.now();
  
  try {
    const { error, count } = await supabase
      .from('club')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    
    const duration = Date.now() - startTime;
    
    if (error) {
      throw createDatabaseError(error, 'club', 'statistics');
    }
    
    const stats = {
      total: count || 0,
    };
    
    logQuery('club', 'statistics', duration);
    return { data: stats, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'statistics');
    logQuery('club', 'statistics', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Check if club name exists
export const checkClubNameExists = async (name: string, excludeId?: string) => {
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('club')
      .select('id, name')
      .eq('name', name)
      .is('deleted_at', null);
    
    if (excludeId) {
      query = query.neq('id', excludeId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('club', 'check_name_exists', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'club', 'check_name_exists');
    }
    
    return { 
      exists: (data && data.length > 0), 
      data: data?.[0] || null, 
      error: null 
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'club', 'check_name_exists');
    logQuery('club', 'check_name_exists', duration, dbError.message);
    return { exists: false, data: null, error: dbError };
  }
};