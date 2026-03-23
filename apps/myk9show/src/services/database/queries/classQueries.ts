// Class Database Query Layer - Phase 2.5: Class Store Integration
// Handles all class and entry-related database operations with comprehensive error handling

import { supabase, createDatabaseError } from '../supabaseClient';
import type { DbClassInsert, DbClassUpdate } from '@/types/database-mappings';

// Re-export entry operations from sibling module for backward compatibility
export {
  getAllEntries,
  getEntriesByClassId,
  createEntry,
  updateEntry,
  deleteEntry,
  hardDeleteEntry,
  restoreEntry,
  getDeletedEntries,
} from './classQueries.entries';

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
      .from('classes')
      .select(
        `
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number,
          status
        ),
        entries (
          id
        ),
        judge_assignments!judge_assignments_class_id_fkey (
          person_id,
          people!inner (
            first_name,
            last_name
          )
        )
      `
      )
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
      .from('classes')
      .select(
        `
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
          entry_status,
          points_earned,
          search_time_seconds,
          final_placement,
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
      `
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error) {
      log('getClassById', 'Error fetching class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('getClassById', 'Successfully fetched class', {
      id,
      entryCount: data?.entries?.length || 0,
    });
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
      .from('classes')
      .select(
        `
        *,
        entries (
          id
        )
      `
      )
      .eq('trial_id', trialId)
      .is('deleted_at', null)
      .order('start_time', { ascending: true });

    if (error) {
      log('getClassesByTrialId', 'Error fetching classes by trial', { trialId, error });
      return { data: [], error: createDatabaseError(error) };
    }

    log('getClassesByTrialId', 'Successfully fetched classes by trial', {
      trialId,
      count: data?.length || 0,
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
      .from('classes')
      .insert([
        {
          ...classData,
          created_at: new Date().toISOString(),
        },
      ])
      .select(
        `
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number
        )
      `
      )
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
      .from('classes')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        `
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number
        )
      `
      )
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
      .from('classes')
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
      .from('classes')
      .select(
        `
        *,
        trial:trials (
          id,
          name,
          date
        )
      `
      )
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
      resultCount: data?.length || 0,
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
      .from('classes')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    if (error) {
      log('getClassStatistics', 'Error fetching class statistics', { error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('getClassStatistics', 'Successfully fetched class statistics', { total: count });
    return {
      data: { total: count || 0 },
      error: null,
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

    const { data, error } = await supabase.from('classes').delete().eq('id', id);

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
      .from('classes')
      .update({
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString(),
        updated_by: restoredBy || null,
      })
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select(
        `
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number
        )
      `
      )
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
      .from('classes')
      .select(
        `
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
      `
      )
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
