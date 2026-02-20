/**
 * Entry mutation queries
 *
 * Write operations for creating, updating, deleting, and managing entry state.
 * Includes bulk operations, status transitions, and handler/detail updates.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { logger } from '@/services/LoggingService';
import type {
  DbEntryInsert,
  DbEntryUpdate,
} from '../../../types/database-mappings';

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
  const { id, status, userId } = params;
  const startTime = Date.now();

  try {
    // Update entry status
    // Note: status change reason is logged via userId/audit, not written to special_requests
    // which holds exhibitor-provided data that should not be overwritten
    const { data: entryData, error: entryError } = await supabase
      .from('entries')
      .update({
        entry_status: status,
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
