// Entry-related database queries
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
        dog(
          id,
          name,
          call_name,
          breed,
          owner:"user"(
            id,
            first_name,
            last_name,
            email,
            phone
          )
        ),
        class(
          id,
          name,
          class_number,
          show_id,
          entry_fee,
          entry_limit
        ),
        show(
          id,
          name,
          start_date,
          end_date,
          location,
          status
        ),
        entry_status_history(
          status,
          changed_at,
          changed_by,
          reason,
          user:changed_by("first_name", "last_name")
        )
      `)
      .order('created_at', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'select_all_with_details', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'select_all');
    logQuery('entry', 'select_all_with_details', duration, dbError.message);
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
        dog(
          id,
          name,
          call_name,
          breed,
          registration_number,
          owner:"user"(
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
        class(
          id,
          name,
          class_number,
          description,
          entry_fee,
          entry_limit,
          jump_height,
          show_id,
          show(
            id,
            name,
            start_date,
            end_date,
            location,
            status
          )
        ),
        entry_status_history(
          status,
          changed_at,
          changed_by,
          reason,
          user:changed_by("first_name", "last_name")
        ),
        result(
          id,
          placement,
          score,
          time,
          qualified,
          faults,
          judge_notes,
          recorded_at,
          recorded_by,
          judge:recorded_by("first_name", "last_name")
        )
      `)
      .eq('id', id)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'select_by_id_detailed', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'select_by_id');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'select_by_id');
    logQuery('entry', 'select_by_id_detailed', duration, dbError.message);
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
        dog(
          id,
          name,
          call_name,
          breed,
          owner:"user"(
            id,
            first_name,
            last_name,
            email
          )
        ),
        class(
          id,
          name,
          class_number,
          entry_fee
        ),
        entry_status_history(
          status,
          changed_at,
          changed_by,
          reason
        )
      `)
      .eq('show_id', showId)
      .order('created_at', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'select_by_show', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'select_by_show');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'select_by_show');
    logQuery('entry', 'select_by_show', duration, dbError.message);
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
        dog(
          id,
          name,
          call_name,
          breed,
          owner:"user"(
            id,
            first_name,
            last_name,
            email
          )
        ),
        entry_status_history(
          status,
          changed_at,
          changed_by,
          reason
        ),
        result(
          id,
          placement,
          score,
          time,
          qualified,
          faults,
          recorded_at
        )
      `)
      .eq('class_id', classId)
      .order('armband_number', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'select_by_class', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'select_by_class');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'select_by_class');
    logQuery('entry', 'select_by_class', duration, dbError.message);
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
        class(
          id,
          name,
          class_number,
          entry_fee
        ),
        show(
          id,
          name,
          start_date,
          end_date,
          location
        ),
        entry_status_history(
          status,
          changed_at,
          changed_by,
          reason
        ),
        result(
          id,
          placement,
          score,
          time,
          qualified,
          faults,
          recorded_at
        )
      `)
      .eq('dog_id', dogId)
      .order('created_at', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'select_by_dog', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'select_by_dog');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'select_by_dog');
    logQuery('entry', 'select_by_dog', duration, dbError.message);
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
        dog(
          id,
          name,
          call_name,
          breed,
          owner:"user"(
            id,
            first_name,
            last_name,
            email
          )
        ),
        class(
          id,
          name,
          class_number,
          entry_fee
        ),
        show(
          id,
          name,
          start_date,
          end_date
        )
      `)
      .eq('status', status)
      .order('created_at', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'select_by_status', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'select_by_status');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'select_by_status');
    logQuery('entry', 'select_by_status', duration, dbError.message);
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
        dog(
          id,
          name,
          call_name,
          breed,
          owner:"user"(
            id,
            first_name,
            last_name,
            email
          )
        ),
        class(
          id,
          name,
          class_number,
          entry_fee
        ),
        show(
          id,
          name,
          start_date,
          end_date
        )
      `)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'insert');
    logQuery('entry', 'insert', duration, dbError.message);
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
        dog(
          id,
          name,
          call_name,
          breed,
          owner:"user"(
            id,
            first_name,
            last_name,
            email
          )
        ),
        class(
          id,
          name,
          class_number,
          entry_fee
        ),
        show(
          id,
          name,
          start_date,
          end_date
        )
      `)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'update');
    logQuery('entry', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Delete entry
export const deleteEntry = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id);
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'delete');
    }
    
    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'delete');
    logQuery('entry', 'delete', duration, dbError.message);
    return { error: dbError };
  }
};

// Update entry status with history tracking
export const updateEntryStatus = async (params: {
  id: string;
  status: string;
  userId: string;
  reason?: string;
}) => {
  const { id, status, userId, reason } = params;
  const startTime = Date.now();
  
  try {
    // Update entry status and create status history in separate operations
    // First update the entry status
    const { data: entryData, error: entryError } = await supabase
      .from('entries')
      .update({ 
        status,
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select()
      .single();

    if (entryError) {
      throw createDatabaseError(entryError, 'entry', 'update_status');
    }

    // Then create status history record
    const { error: historyError } = await supabase
      .from('entry_status_history')
      .insert({
        entry_id: id,
        new_status: status,
        changed_by: userId,
        changed_at: new Date().toISOString(),
        reason: reason || null,
      });

    if (historyError) {
      logger.warn('Failed to create status history:', 'database', {}, historyError as Error);
      // Don't fail the entire operation if history creation fails
    }
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'update_status', duration);
    
    return { data: entryData, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'update_status');
    logQuery('entry', 'update_status', duration, dbError.message);
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
        dog(
          id,
          name,
          call_name,
          breed,
          owner:"user"(
            id,
            first_name,
            last_name,
            email
          )
        ),
        class(
          id,
          name,
          class_number,
          entry_fee
        ),
        show(
          id,
          name,
          start_date,
          end_date
        )
      `);
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'bulk_insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'bulk_insert');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'bulk_insert');
    logQuery('entry', 'bulk_insert', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entry statistics for a show
export const getEntryStatistics = async (showId?: string) => {
  const startTime = Date.now();
  
  try {
    let query = supabase
      .from('entries')
      .select('entry_status, entry_fee, payment_status');
    
    if (showId) {
      query = query.eq('show_id', showId);
    }
    
    const { data, error } = await query;
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'statistics', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'statistics');
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
      const paidEntries = data.filter(e => e.payment_status === 'paid').length;
      stats.completionRate = paidEntries > 0 ? (completedEntries / paidEntries) * 100 : 0;
    }
    
    return { data: stats, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'statistics');
    logQuery('entry', 'statistics', duration, dbError.message);
    return { 
      data: {
        totalEntries: 0,
        byStatus: {},
        totalRevenue: 0,
        paidRevenue: 0,
        completionRate: 0,
      }, 
      error: dbError 
    };
  }
};

// Search entries by dog name, owner name, or entry number
export const searchEntries = async (searchTerm: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('entries')
      .select(`
        *,
        dog(
          id,
          name,
          call_name,
          breed,
          owner:"user"(
            id,
            first_name,
            last_name,
            email
          )
        ),
        class(
          id,
          name,
          class_number,
          entry_fee
        ),
        show(
          id,
          name,
          start_date,
          end_date
        )
      `)
      .or(`entry_number.ilike.%${searchTerm}%,armband_number.ilike.%${searchTerm}%`)
      .order('created_at', { ascending: false })
      .limit(50);
    
    const duration = Date.now() - startTime;
    logQuery('entry', 'search', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'entry', 'search');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'search');
    logQuery('entry', 'search', duration, dbError.message);
    return { data: [], error: dbError };
  }
};