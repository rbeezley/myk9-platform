// Users-related database queries
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { logger } from '@/services/LoggingService';
import type { DbUserInsert, DbUserUpdate } from '../../../types/database-mappings';

// Get all users (excluding soft-deleted)
export const getAllUsers = async () => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .select('*, user_roles(role:roles(name))')
      .is('deleted_at', null)
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    const duration = Date.now() - startTime;

    // Enhanced debug logging
    logger.debug('🔍 Database query result:', 'database', {
      data: {
        data: data?.slice(0, 3), // First 3 for debugging
        dataLength: data?.length,
        error: error?.message,
        tableName: 'user',
        supabaseUrl: 'hidden_for_security',
        duration,
      },
    });

    logQuery('user', 'select_all', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'select_all');
    logger.error('💥 Database query failed:', 'database', { data: { error: dbError, duration } });
    logQuery('user', 'select_all', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get user by ID with full details (excluding soft-deleted)
export const getUserById = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .select(
        `
        *,
        user_roles(role:roles(name)),
        dogs!dogs_owner_id_fkey(
          id,
          name,
          breed,
          call_name,
          date_of_birth,
          active
        ),
        judge_qualifications(
          id,
          organization,
          qualification_level,
          disciplines,
          date_obtained,
          expiration_date,
          is_active
        )
      `
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    const duration = Date.now() - startTime;
    logQuery('user', 'select_by_id_detailed', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'select_by_id');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'select_by_id');
    logQuery('user', 'select_by_id_detailed', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Create new user
export const createUser = async (userData: DbUserInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.from('people').insert([userData]).select().single();

    const duration = Date.now() - startTime;
    logQuery('user', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'insert');
    logQuery('user', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update user
export const updateUser = async (id: string, updates: DbUserUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('user', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'update');
    logQuery('user', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Soft delete user
export const deleteUser = async (id: string, deletedBy?: string) => {
  const startTime = Date.now();

  try {
    const updateData: Record<string, unknown> = {
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (deletedBy) {
      updateData.deleted_by = deletedBy;
      updateData.updated_by = deletedBy;
    }

    const { data, error } = await supabase
      .from('people')
      .update(updateData)
      .eq('id', id)
      .is('deleted_at', null) // Only soft delete if not already deleted
      .select('id, first_name, last_name');

    const duration = Date.now() - startTime;
    logQuery('user', 'soft_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'soft_delete');
    }

    const deletedUser = Array.isArray(data) ? data[0] : data;
    return { data: deletedUser || null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'soft_delete');
    logQuery('user', 'soft_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Hard delete user (permanent removal)
export const hardDeleteUser = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .delete()
      .eq('id', id)
      .select('id, first_name, last_name');

    const duration = Date.now() - startTime;
    logQuery('user', 'hard_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'hard_delete');
    }

    const deletedUser = Array.isArray(data) ? data[0] : data;
    return { data: deletedUser || null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'hard_delete');
    logQuery('user', 'hard_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Permanent delete user via Edge Function (deletes people row + auth.users entry)
// Requires site_admin role — enforced server-side
export const permanentDeleteUser = async (personId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { personId },
    });

    const duration = Date.now() - startTime;
    logQuery('user', 'permanent_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'permanent_delete');
    }

    // Edge Function returns { error: string } on failure
    if (data?.error) {
      throw createDatabaseError(
        { message: data.error, code: data.code || 'EDGE_FUNCTION_ERROR' },
        'user',
        'permanent_delete'
      );
    }

    return { data: data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'permanent_delete');
    logQuery('user', 'permanent_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Restore soft-deleted user
export const restoreUser = async (id: string, restoredBy?: string) => {
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
      .from('people')
      .update(updateData)
      .eq('id', id)
      .not('deleted_at', 'is', null) // Only restore if currently deleted
      .select('id, first_name, last_name');

    const duration = Date.now() - startTime;
    logQuery('user', 'restore', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'restore');
    }

    const restoredUser = Array.isArray(data) ? data[0] : data;
    return { data: restoredUser || null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'restore');
    logQuery('user', 'restore', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get soft-deleted users
export const getDeletedUsers = async () => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .select(
        `
        *,
        deleted_by_user:people!people_deleted_by_fkey(
          id,
          first_name,
          last_name,
          email
        )
      `
      )
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('user', 'select_deleted', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'select_deleted');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'select_deleted');
    logQuery('user', 'select_deleted', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Legacy hard delete user with proper constraint checking (kept for compatibility)
export const legacyDeleteUser = async (id: string, cascadeDelete: boolean = false) => {
  const startTime = Date.now();

  try {
    // Check what related data exists
    const [{ data: relatedEntries, count: entryCount }, { data: ownedDogs, count: dogCount }] =
      await Promise.all([
        supabase
          .from('entries')
          .select('id', { count: 'exact' })
          .or(`handler_id.eq.${id},created_by.eq.${id}`),
        supabase.from('dogs').select('id', { count: 'exact' }).eq('owner_id', id),
      ]);

    const hasRelatedData =
      (relatedEntries && relatedEntries.length > 0) || (ownedDogs && ownedDogs.length > 0);

    if (hasRelatedData && !cascadeDelete) {
      const duration = Date.now() - startTime;
      logQuery('user', 'delete_check', duration, 'User has related data');

      return {
        data: null,
        error: {
          message: 'Cannot delete user: This user has related data in the system.',
          code: 'HAS_RELATED_DATA',
          details: {
            entryCount: entryCount || 0,
            dogCount: dogCount || 0,
            canCascade: true,
          },
        },
      };
    }

    // If cascade delete is requested, delete related data first
    if (cascadeDelete && hasRelatedData) {
      // Delete related entries (this will also handle entry-specific cascades)
      if (relatedEntries && relatedEntries.length > 0) {
        await supabase.from('entries').delete().or(`handler_id.eq.${id},created_by.eq.${id}`);
      }

      // Delete owned dogs (this will cascade to related dog data)
      if (ownedDogs && ownedDogs.length > 0) {
        await supabase.from('dogs').delete().eq('owner_id', id);
      }
    }

    // If no blocking relationships, proceed with deletion
    const { data, error } = await supabase
      .from('people')
      .delete()
      .eq('id', id)
      .select('id, first_name, last_name');

    const duration = Date.now() - startTime;
    logQuery('user', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'delete');
    }

    // Return the first item if array, or null if no results
    const deletedUser = Array.isArray(data) ? data[0] : data;
    return { data: deletedUser || null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'delete');
    logQuery('user', 'delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Search users by name or email (excluding soft-deleted)
export const searchUsers = async (searchTerm: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .select('*, user_roles(role:roles(name))')
      .is('deleted_at', null)
      .or(
        `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
      )
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('user', 'search', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'search');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'search');
    logQuery('user', 'search', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get users by role via user_roles table (excluding soft-deleted)
export const getUsersByRole = async (role: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .select('*, user_roles!inner(role:roles!inner(name))')
      .eq('user_roles.is_active', true)
      .eq('user_roles.roles.name', role)
      .is('deleted_at', null)
      .order('last_name', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('user', 'select_by_role', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'select_by_role');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'select_by_role');
    logQuery('user', 'select_by_role', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get users with their dog counts
export const getUsersWithDogCounts = async () => {
  return await getPeopleWithDogCountsFallback();
};

// Fallback method for getting users with dog counts (excluding soft-deleted)
const getPeopleWithDogCountsFallback = async () => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .select(
        `
        *,
        dogs!dogs_owner_id_fkey(id)
      `
      )
      .is('deleted_at', null)
      .order('last_name', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('user', 'select_with_dog_counts_fallback', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'select_with_dog_counts_fallback');
    }

    // Transform data to include dog count
    const dataWithCounts =
      data?.map(person => ({
        ...person,
        dog_count: person.dogs?.length || 0,
      })) || [];

    return { data: dataWithCounts, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'select_with_dog_counts_fallback');
    logQuery('user', 'select_with_dog_counts_fallback', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get users statistics (excluding soft-deleted)
export const getUsersStatistics = async () => {
  const startTime = Date.now();

  try {
    const { error, count } = await supabase
      .from('people')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    const duration = Date.now() - startTime;

    if (error) {
      throw createDatabaseError(error, 'user', 'statistics');
    }

    const stats = {
      total: count || 0,
    };

    logQuery('user', 'statistics', duration);
    return { data: stats, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'statistics');
    logQuery('user', 'statistics', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Check if email exists (excluding soft-deleted)
export const checkEmailExists = async (email: string, excludeId?: string) => {
  const startTime = Date.now();

  try {
    let query = supabase
      .from('people')
      .select('id, email')
      .is('deleted_at', null)
      .eq('email', email);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    const duration = Date.now() - startTime;
    logQuery('user', 'check_email_exists', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'check_email_exists');
    }

    return {
      exists: data && data.length > 0,
      data: data?.[0] || null,
      error: null,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'check_email_exists');
    logQuery('user', 'check_email_exists', duration, dbError.message);
    return { exists: false, data: null, error: dbError };
  }
};
