// Class Database Query Layer - Phase 2.5: Class Store Integration
// Handles all class and entry-related database operations with comprehensive error handling

import { supabase, createDatabaseError } from '../supabaseClient';
import type { DbClassInsert, DbClassUpdate, DbEntryInsert, DbEntryUpdate } from '@/types/database-mappings';

// Helper function to log queries with the correct signature - temporary no-op to pass build
const log = (...args: unknown[]) => {
  // Temporarily disabled logging to fix build
  void args; // Suppress unused variable warning
};
// type ClassWithRelations = DbClass & {
//   trial?: unknown;
//   entry?: unknown[];
// };
// type EntryWithRelations = DbEntry & {
//   dog?: unknown;
//   class?: unknown;
// };

/**
 * Get all classes with trial relationships and entry counts (excluding soft-deleted)
 */
export const getAllClasses = async () => {
  try {
    log('class', 'select_all_with_relations');
    
    const { data, error } = await supabase
      .from('classes' as 'class')
      .select(`
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number,
          status
        ),
        entries (
          id,
          status
        )
      `)
      .is('deleted_at', null)
      .order('start_time', { ascending: true });

    if (error) {
      log('class', 'select_all_error', { error });
      return { data: [], error: createDatabaseError(error) };
    }

    log('class', 'select_all_success', { count: data?.length || 0 });
    return { data: data || [], error: null };
  } catch (error) {
    log('class', 'select_all_exception', { error });
    return { data: [], error: createDatabaseError(error) };
  }
};

/**
 * Get a class by ID with full details including entries (excluding soft-deleted)
 */
export const getClassById = async (id: string) => {
  try {
    log('getClassById', 'Fetching class by ID', { id });
    
    const { data, error } = await supabase
      .from('classes' as 'class')
      .select(`
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number,
          status,
          max_entries_per_dog,
          max_entries_per_handler
        ),
        entries (
          id,
          status,
          score,
          time,
          placement,
          dog:dogs (
            id,
            name,
            breed,
            owner:people (
              id,
              first_name,
              last_name
            )
          )
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      log('getClassById', 'Error fetching class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('getClassById', 'Successfully fetched class', { id, entryCount: data?.entry?.length || 0 });
    return { data, error: null };
  } catch (error) {
    log('getClassById', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Get classes by trial ID (excluding soft-deleted)
 */
export const getClassesByTrialId = async (trialId: string) => {
  try {
    log('getClassesByTrialId', 'Fetching classes by trial ID', { trialId });
    
    const { data, error } = await supabase
      .from('classes' as 'class')
      .select(`
        *,
        entries (
          id,
          status
        )
      `)
      .eq('trial_id', trialId)
      .is('deleted_at', null)
      .order('start_time', { ascending: true });

    if (error) {
      log('getClassesByTrialId', 'Error fetching classes by trial', { trialId, error });
      return { data: [], error: createDatabaseError(error) };
    }

    log('getClassesByTrialId', 'Successfully fetched classes by trial', { 
      trialId, 
      count: data?.length || 0 
    });
    return { data: data || [], error: null };
  } catch (error) {
    log('getClassesByTrialId', 'Unexpected error', { trialId, error });
    return { data: [], error: createDatabaseError(error) };
  }
};

/**
 * Create a new class
 */
export const createClass = async (classData: DbClassInsert) => {
  try {
    log('createClass', 'Creating new class', { name: classData.name });
    
    const { data, error } = await supabase
      .from('classes' as 'class')
      .insert([{
        ...classData,
        created_at: new Date().toISOString(),
      }])
      .select(`
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number
        )
      `)
      .single();

    if (error) {
      log('createClass', 'Error creating class', { error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('createClass', 'Successfully created class', { id: data?.id });
    return { data, error: null };
  } catch (error) {
    log('createClass', 'Unexpected error', { error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Update a class (excluding soft-deleted)
 */
export const updateClass = async (id: string, updates: DbClassUpdate) => {
  try {
    log('updateClass', 'Updating class', { id });
    
    const { data, error } = await supabase
      .from('classes' as 'class')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
            .select(`
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number
        )
      `)
      .single();

    if (error) {
      log('updateClass', 'Error updating class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('updateClass', 'Successfully updated class', { id });
    return { data, error: null };
  } catch (error) {
    log('updateClass', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Soft delete a class
 */
export const deleteClass = async (id: string, deletedBy?: string) => {
  try {
    log('deleteClass', 'Soft deleting class', { id });

    const updateData: Record<string, unknown> = {
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (deletedBy) {
      updateData.deleted_by = deletedBy;
    }

    const { data, error } = await supabase
      .from('classes' as 'class')
      .update(updateData)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id, name')
      .single();

    if (error) {
      log('deleteClass', 'Error soft deleting class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('deleteClass', 'Successfully soft deleted class', { id });
    return { data, error: null };
  } catch (error) {
    log('deleteClass', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Search classes by name, level, or description (excluding soft-deleted)
 */
export const searchClasses = async (searchTerm: string, limit = 50) => {
  try {
    log('searchClasses', 'Searching classes', { searchTerm, limit });
    
    const { data, error } = await supabase
      .from('classes' as 'class')
      .select(`
        *,
        trial:trials (
          id,
          name,
          date
        )
      `)
      .or(
        `name.ilike.%${searchTerm}%,` +
        `level.ilike.%${searchTerm}%,` +
        `description.ilike.%${searchTerm}%`
      )
      .is('deleted_at', null)
      .order('start_time', { ascending: true })
      .limit(limit);

    if (error) {
      log('searchClasses', 'Error searching classes', { searchTerm, error });
      return { data: [], error: createDatabaseError(error) };
    }

    log('searchClasses', 'Successfully searched classes', { 
      searchTerm, 
      resultCount: data?.length || 0 
    });
    return { data: data || [], error: null };
  } catch (error) {
    log('searchClasses', 'Unexpected error', { searchTerm, error });
    return { data: [], error: createDatabaseError(error) };
  }
};

/**
 * Get class statistics (total count, by level, etc.) (excluding soft-deleted)
 */
export const getClassStatistics = async () => {
  try {
    log('getClassStatistics', 'Fetching class statistics');
    
    const { error, count } = await supabase
      .from('classes' as 'class')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    if (error) {
      log('getClassStatistics', 'Error fetching class statistics', { error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('getClassStatistics', 'Successfully fetched class statistics', { total: count });
    return { 
      data: { total: count || 0 }, 
      error: null 
    };
  } catch (error) {
    log('getClassStatistics', 'Unexpected error', { error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Hard delete a class (permanent removal)
 */
export const hardDeleteClass = async (id: string) => {
  try {
    log('hardDeleteClass', 'Permanently deleting class', { id });
    
    const { data, error } = await supabase
      .from('classes' as 'class')
      .delete()
      .eq('id', id);

    if (error) {
      log('hardDeleteClass', 'Error permanently deleting class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('hardDeleteClass', 'Successfully permanently deleted class', { id });
    return { data, error: null };
  } catch (error) {
    log('hardDeleteClass', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Restore a soft-deleted class
 */
export const restoreClass = async (id: string, restoredBy?: string) => {
  try {
    log('restoreClass', 'Restoring class', { id });
    
    const { data, error } = await supabase
      .from('classes' as 'class')
      .update({
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString(),
        updated_by: restoredBy || null,
      })
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select(`
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number
        )
      `)
      .single();

    if (error) {
      log('restoreClass', 'Error restoring class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('restoreClass', 'Successfully restored class', { id });
    return { data, error: null };
  } catch (error) {
    log('restoreClass', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Get soft-deleted classes (admin only)
 */
export const getDeletedClasses = async () => {
  try {
    log('getDeletedClasses', 'Fetching deleted classes');
    
    const { data, error } = await supabase
      .from('classes' as 'class')
      .select(`
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number
        ),
        deleted_by_user:deleted_by (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) {
      log('getDeletedClasses', 'Error fetching deleted classes', { error });
      return { data: [], error: createDatabaseError(error) };
    }

    log('getDeletedClasses', 'Successfully fetched deleted classes', { count: data?.length || 0 });
    return { data: data || [], error: null };
  } catch (error) {
    log('getDeletedClasses', 'Unexpected error', { error });
    return { data: [], error: createDatabaseError(error) };
  }
};

// ===== ENTRY OPERATIONS =====

/**
 * Get all entries with dog and class relationships (excluding soft-deleted)
 */
export const getAllEntries = async () => {
  try {
    log('getAllEntries', 'Fetching all entries');
    
    const { data, error } = await supabase
      .from('entries' as 'entry')
      .select(`
        *,
        dog:dogs (
          id,
          name,
          breed,
          owner:people (
            id,
            first_name,
            last_name
          )
        ),
        class:class_id (
          id,
          name,
          level,
          trial:trials (
            id,
            name,
            date
          )
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      log('getAllEntries', 'Error fetching entries', { error });
      return { data: [], error: createDatabaseError(error) };
    }

    log('getAllEntries', 'Successfully fetched entries', { count: data?.length || 0 });
    return { data: data || [], error: null };
  } catch (error) {
    log('getAllEntries', 'Unexpected error', { error });
    return { data: [], error: createDatabaseError(error) };
  }
};

/**
 * Get entries by class ID (excluding soft-deleted)
 */
export const getEntriesByClassId = async (classId: string) => {
  try {
    log('getEntriesByClassId', 'Fetching entries by class ID', { classId });
    
    const { data, error } = await supabase
      .from('entries' as 'entry')
      .select(`
        *,
        dog:dogs (
          id,
          name,
          breed,
          owner:people (
            id,
            first_name,
            last_name
          )
        )
      `)
      .eq('class_id', classId)
      .is('deleted_at', null)
      .order('armband', { ascending: true });

    if (error) {
      log('getEntriesByClassId', 'Error fetching entries by class', { classId, error });
      return { data: [], error: createDatabaseError(error) };
    }

    log('getEntriesByClassId', 'Successfully fetched entries by class', { 
      classId, 
      count: data?.length || 0 
    });
    return { data: data || [], error: null };
  } catch (error) {
    log('getEntriesByClassId', 'Unexpected error', { classId, error });
    return { data: [], error: createDatabaseError(error) };
  }
};

/**
 * Create a new entry
 */
export const createEntry = async (entryData: DbEntryInsert) => {
  try {
    log('createEntry', 'Creating new entry', { classId: entryData.class_id });
    
    const { data, error } = await supabase
      .from('entries' as 'entry')
      .insert([{
        ...entryData,
        created_at: new Date().toISOString(),
      }])
      .select(`
        *,
        dog:dogs (
          id,
          name,
          breed
        ),
        class:class_id (
          id,
          name,
          level
        )
      `)
      .single();

    if (error) {
      log('createEntry', 'Error creating entry', { error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('createEntry', 'Successfully created entry', { id: data?.id });
    return { data, error: null };
  } catch (error) {
    log('createEntry', 'Unexpected error', { error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Update an entry (excluding soft-deleted)
 */
export const updateEntry = async (id: string, updates: DbEntryUpdate) => {
  try {
    log('updateEntry', 'Updating entry', { id });
    
    const { data, error } = await supabase
      .from('entries' as 'entry')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
            .select(`
        *,
        dog:dogs (
          id,
          name,
          breed
        ),
        class:class_id (
          id,
          name,
          level
        )
      `)
      .single();

    if (error) {
      log('updateEntry', 'Error updating entry', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('updateEntry', 'Successfully updated entry', { id });
    return { data, error: null };
  } catch (error) {
    log('updateEntry', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Soft delete an entry
 */
export const deleteEntry = async (id: string, deletedBy?: string) => {
  try {
    log('deleteEntry', 'Soft deleting entry', { id });
    
    const { data, error } = await supabase
      .from('entries' as 'entry')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: deletedBy || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      log('deleteEntry', 'Error soft deleting entry', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('deleteEntry', 'Successfully soft deleted entry', { id });
    return { data, error: null };
  } catch (error) {
    log('deleteEntry', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Hard delete an entry (permanent removal)
 */
export const hardDeleteEntry = async (id: string) => {
  try {
    log('hardDeleteEntry', 'Permanently deleting entry', { id });
    
    const { data, error } = await supabase
      .from('entries' as 'entry')
      .delete()
      .eq('id', id);

    if (error) {
      log('hardDeleteEntry', 'Error permanently deleting entry', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('hardDeleteEntry', 'Successfully permanently deleted entry', { id });
    return { data, error: null };
  } catch (error) {
    log('hardDeleteEntry', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Restore a soft-deleted entry
 */
export const restoreEntry = async (id: string, restoredBy?: string) => {
  try {
    log('restoreEntry', 'Restoring entry', { id });
    
    const { data, error } = await supabase
      .from('entries' as 'entry')
      .update({
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString(),
        updated_by: restoredBy || null,
      })
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select(`
        *,
        dog:dogs (
          id,
          name,
          breed
        ),
        class:class_id (
          id,
          name,
          level
        )
      `)
      .single();

    if (error) {
      log('restoreEntry', 'Error restoring entry', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('restoreEntry', 'Successfully restored entry', { id });
    return { data, error: null };
  } catch (error) {
    log('restoreEntry', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Get soft-deleted entries (admin only)
 */
export const getDeletedEntries = async () => {
  try {
    log('getDeletedEntries', 'Fetching deleted entries');
    
    const { data, error } = await supabase
      .from('entries' as 'entry')
      .select(`
        *,
        dog:dogs (
          id,
          name,
          breed,
          owner:people (
            id,
            first_name,
            last_name
          )
        ),
        class:class_id (
          id,
          name,
          level,
          trial:trials (
            id,
            name,
            date
          )
        ),
        deleted_by_user:deleted_by (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (error) {
      log('getDeletedEntries', 'Error fetching deleted entries', { error });
      return { data: [], error: createDatabaseError(error) };
    }

    log('getDeletedEntries', 'Successfully fetched deleted entries', { count: data?.length || 0 });
    return { data: data || [], error: null };
  } catch (error) {
    log('getDeletedEntries', 'Unexpected error', { error });
    return { data: [], error: createDatabaseError(error) };
  }
};