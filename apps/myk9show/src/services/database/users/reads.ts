// Users-related database queries
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { logger } from '@/services/LoggingService';
import type { DbUserInsert, DbUserUpdate } from '../../../types/database-mappings';
import { translatePersonIdentityError } from '@/utils/duplicateIdentityErrors';

// Shared select fragment for judge qualifications join
const JUDGE_QUALIFICATIONS_SELECT = `judge_qualifications(
  id, organization, qualification_level, disciplines, judge_number,
  date_obtained, expiration_date, is_active
)`;

// FK hint to disambiguate user_roles → people (two FKs: user_id and granted_by)
const USER_ROLES_FK = 'user_roles!user_roles_user_id_fkey';

// SA-008: explicit column allowlist for the people-directory fetch — the union
// of columns the two consumers of getAllUsers read (`mapDatabaseToUser` in
// services/mappers/userMappers.ts for the userStore, and `mapDbUserToUser` in
// hooks/queries/useUsersQuery.ts for React Query). Replaces `select('*')` so an
// RLS regression can never turn this into a full-table PII dump. Keep in sync
// with BOTH mappers; the column-shape test in userQueries.test.ts pins it.
const PEOPLE_DIRECTORY_COLUMNS =
  'id, first_name, last_name, email, phone, street_address, city, state, ' +
  'zip_code, country, profile_image, auth_user_id, status, ' +
  'created_at, updated_at, deleted_at, deleted_by';

// Get all users (excluding soft-deleted)
export const getAllUsers = async () => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('people')
      .select(
        `${PEOPLE_DIRECTORY_COLUMNS}, ${USER_ROLES_FK}(role:roles(name)), ${JUDGE_QUALIFICATIONS_SELECT}`
      )
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
        ${USER_ROLES_FK}(role:roles(name)),
        dogs!dogs_owner_id_fkey(
          id,
          name,
          breed,
          call_name,
          date_of_birth,
          active
        ),
        ${JUDGE_QUALIFICATIONS_SELECT}
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
      throw translatePersonIdentityError(createDatabaseError(error, 'user', 'insert'));
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const translated = translatePersonIdentityError(error);
    const dbError = createDatabaseError(translated, 'user', 'insert');
    const metadata = translated as { code?: string; details?: string; hint?: string };
    if (metadata.code) dbError.code = metadata.code;
    if (metadata.details) dbError.details = metadata.details;
    if (metadata.hint) dbError.hint = metadata.hint;
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
  // The RPC stamps deleted_by = auth.uid(); the explicit arg is no longer needed.
  void deletedBy;

  try {
    // people_select RLS (deleted_at IS NULL) is enforced as a WITH CHECK on the
    // UPDATE's new row, so a direct .update({ deleted_at }) is rejected ("new row
    // violates RLS"). Soft-delete via an admin-gated SECURITY DEFINER RPC, like
    // soft_delete_dog/show/class (migration 20260617140000). The owns-dogs guard
    // trigger still fires inside the RPC and raises MK001 if the person owns dogs.
    const { data, error } = await supabase.rpc('soft_delete_person', { p_person_id: id });

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
      // On a non-2xx the edge body (e.g. { error, code: 'MK001' }) is carried in
      // FunctionsHttpError.context (a Response), not in `data`. Pull the code out
      // so the owns-dogs guard message survives instead of becoming a generic 500.
      const context = (error as { context?: Response }).context;
      let edgeMessage: string | undefined;
      let edgeCode: string | undefined;
      if (context && typeof context.json === 'function') {
        try {
          const body = (await context.json()) as { error?: string; code?: string };
          edgeMessage = body?.error;
          edgeCode = body?.code;
        } catch {
          // Body wasn't JSON / already consumed — fall back to the error itself.
        }
      }
      throw createDatabaseError(
        edgeCode ? { message: edgeMessage || error.message, code: edgeCode } : error,
        'user',
        'permanent_delete'
      );
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
  void restoredBy;

  try {
    // people_select RLS hides soft-deleted rows from every role, so a direct
    // UPDATE matches 0 rows (the SELECT policy gates the UPDATE's row-location
    // step). Restore via an admin-gated SECURITY DEFINER RPC (migration
    // 20260617120000). Person soft-delete does not cascade, so neither does restore.
    const { data, error } = await supabase.rpc('restore_person', { p_person_id: id });

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
    // people_select RLS hides soft-deleted rows from every role; list via an
    // admin-gated SECURITY DEFINER RPC (migration 20260616140000).
    const { data, error } = await supabase.rpc('get_deleted_people');

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

/**
 * Read ONE soft-deleted person.
 *
 * `people_select` is `deleted_at IS NULL`, so a removed person is invisible to
 * every role including site admin, and `getUserById` filters them out too. The
 * admin-gated `get_deleted_people` RPC (migration 20260616140000) is the only
 * read path there is.
 *
 * It returns the whole deleted set and the row is picked here rather than in a
 * second SECURITY DEFINER function answering the same question. The set is
 * small by nature — soft-deleted people are a queue that gets emptied, not a
 * growing table. If that stops being true, a `get_deleted_person(uuid)` RPC is
 * the drop-in replacement and only this function changes.
 *
 * Returns `{ data: null }` for a live person, an unknown id, OR a caller the
 * RPC refuses — the caller cannot tell those apart, which is the point.
 */
export const getDeletedUserById = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.rpc('get_deleted_people');

    const duration = Date.now() - startTime;
    logQuery('user', 'select_deleted_by_id', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'select_deleted_by_id');
    }

    const rows = (data ?? []) as { id?: string }[];
    const person = rows.find(row => row.id === id) ?? null;
    if (!person) return { data: null, error: null };

    // The RPC returns SETOF public.people — the row and nothing else — while
    // `getUserById` embeds user_roles and judge qualifications. Mapping the bare
    // row yields an EMPTY role list, which reads as "this person had no roles"
    // rather than "we didn't ask": a removed judge would silently lose their
    // badge and judge sections. Fetch the roles alongside, in the shape
    // extractRoles expects.
    //
    // NO is_active FILTER, deliberately. soft_delete_person sets is_active =
    // false on every active role it disables, and restore_person does not put
    // them back. Filtering on is_active would therefore return nothing for
    // precisely the people this function exists to read — the record would
    // render role-less and look perfectly correct.
    //
    // New removals stamp deactivated_at with the person's deleted_at. That
    // distinguishes a grant disabled by this removal from an older inactive
    // grant. Legacy rows without the stamp remain visible because their history
    // cannot be reconstructed after the fact.
    //
    // Over-reporting beats under-reporting here: without this the roles are
    // missing for every removed person, always. With it they are occasionally
    // generous, on a record that carries a "this person was removed" banner and
    // no editing affordances, so no reader can mistake a badge for live
    // authority.
    const { data: roleRows, error: rolesError } = await supabase
      .from('user_roles')
      .select('expires_at, is_active, deactivated_at, role:roles!user_roles_role_id_fkey(name)')
      .eq('user_id', id);

    // A failed role read must not pass as a complete record with no roles —
    // that is the same silent lie, arrived at a different way.
    if (rolesError) {
      throw createDatabaseError(rolesError, 'user', 'select_deleted_by_id');
    }

    // A grant that expired BEFORE they were removed was demonstrably not held at
    // removal, so drop it. For new removals, an inactive grant must also carry
    // this removal's timestamp. Legacy inactive rows without a stamp are kept
    // because the old schema cannot distinguish their history.
    const removedAt = (person as { deleted_at?: string | null }).deleted_at;
    const heldAtRemoval = (roleRows ?? []).filter(row => {
      const expiresAt = (row as { expires_at?: string | null }).expires_at;
      if (expiresAt && removedAt && new Date(expiresAt) <= new Date(removedAt)) {
        return false;
      }

      const isActive = (row as { is_active?: boolean }).is_active;
      if (isActive === true || !removedAt) return true;

      const deactivatedAt = (row as { deactivated_at?: string | null }).deactivated_at;
      if (!deactivatedAt) return true;
      return new Date(deactivatedAt).getTime() === new Date(removedAt).getTime();
    });

    return { data: { ...person, user_roles: heldAtRemoval }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'select_deleted_by_id');
    logQuery('user', 'select_deleted_by_id', duration, dbError.message);
    return { data: null, error: dbError };
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
      .select(`*, ${USER_ROLES_FK}(role:roles(name))`)
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
      .select(`*, ${USER_ROLES_FK}!inner(role:roles!inner(name))`)
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
