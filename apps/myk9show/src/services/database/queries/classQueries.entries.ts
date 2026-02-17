// Class Queries - Entry Operations
// Extracted from classQueries.ts to keep files under 500 lines

import { supabase, createDatabaseError } from '../supabaseClient';
import type { DbEntryInsert, DbEntryUpdate } from '@/types/database-mappings';

// Helper function to log queries with the correct signature - temporary no-op to pass build
const log = (...args: unknown[]) => {
  // Temporarily disabled logging to fix build
  void args; // Suppress unused variable warning
};

/**
 * Get all entries with dog and class relationships (excluding soft-deleted)
 */
export const getAllEntries = async () => {
  try {
    log('getAllEntries', 'Fetching all entries');

    const { data, error } = await supabase
      .from('entries')
      .select(
        `
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
      `
      )
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
      .from('entries')
      .select(
        `
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
      `
      )
      .eq('class_id', classId)
      .is('deleted_at', null)
      .order('armband', { ascending: true });

    if (error) {
      log('getEntriesByClassId', 'Error fetching entries by class', { classId, error });
      return { data: [], error: createDatabaseError(error) };
    }

    log('getEntriesByClassId', 'Successfully fetched entries by class', {
      classId,
      count: data?.length || 0,
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
      .from('entries')
      .insert([
        {
          ...entryData,
          created_at: new Date().toISOString(),
        },
      ])
      .select(
        `
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
      `
      )
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
      .from('entries')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        `
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
      `
      )
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
      .from('entries')
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

    const { data, error } = await supabase.from('entries').delete().eq('id', id);

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
      .from('entries')
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
      `
      )
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
      .from('entries')
      .select(
        `
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
      `
      )
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
