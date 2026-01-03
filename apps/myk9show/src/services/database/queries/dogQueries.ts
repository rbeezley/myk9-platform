// Dog-related database queries
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type {
  DbDogInsert,
  DbDogUpdate,
} from '../../../types/database-mappings';

// Get all dogs with owner information
export const getAllDogs = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog')
      .select(`
        *,
        owner:user!dog_owner_id_fkey(
          id,
          first_name,
          last_name,
          email,
          phone
        )
      `)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'select_all_with_owners', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'select_all');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'select_all');
    logQuery('dog', 'select_all_with_owners', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get dog by ID with full details
export const getDogById = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog')
      .select(`
        *,
        owner:user!dog_owner_id_fkey(
          id,
          first_name,
          last_name,
          email,
          phone,
          street_address,
          city,
          state,
          zip_code
        ),
        registrations:dog_registration(*),
        health_record(*),
        entry(
          *,
          class:"class"(
            id,
            name,
            class_number
          ),
          show:"show"(
            id,
            name,
            start_date,
            end_date
          )
        )
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'select_by_id_detailed', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'select_by_id');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'select_by_id');
    logQuery('dog', 'select_by_id_detailed', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get dogs by owner ID
export const getDogsByOwner = async (ownerId: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog')
      .select('*')
      .eq('owner_id', ownerId)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'select_by_owner', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'select_by_owner');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'select_by_owner');
    logQuery('dog', 'select_by_owner', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Create new dog
export const createDog = async (dogData: DbDogInsert) => {
  const startTime = Date.now();
  
  try {
    // Defensive programming: ensure no id field exists in the data
    // Database will auto-generate UUID using extensions.uuid_generate_v4()
    const cleanDogData = { ...dogData };
    if ('id' in cleanDogData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (cleanDogData as any).id;
    }
    
    const { data, error } = await supabase
      .from('dog')
      .insert([cleanDogData])
      .select(`
        *,
        owner:user!dog_owner_id_fkey(
          id,
          first_name,
          last_name,
          email
        )
      `)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'insert', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'insert');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'insert');
    logQuery('dog', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update dog
export const updateDog = async (id: string, updates: DbDogUpdate) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        owner:user!dog_owner_id_fkey(
          id,
          first_name,
          last_name,
          email
        )
      `)
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'update', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'update');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'update');
    logQuery('dog', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Soft delete dog (sets deleted_at timestamp and tracks who deleted it)
export const deleteDog = async (id: string, deletedBy?: string) => {
  const startTime = Date.now();
  
  console.log('🗑️ Database deleteDog called:', { id, deletedBy });
  
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
      .from('dog')
      .update(updateData)
      .eq('id', id)
      .select('id, name, deleted_at, deleted_by')
      .single();
    
    console.log('📊 Database response:', { data, error });
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'soft_delete', duration, error?.message);
    
    if (error) {
      console.error('❌ Supabase error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw createDatabaseError(error, 'dog', 'soft_delete');
    }

    if (!data) {
      console.error('❌ No data returned from delete operation');
      throw new Error('Delete operation returned no data');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'soft_delete');
    logQuery('dog', 'soft_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Search dogs by name or breed
export const searchDogs = async (searchTerm: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog')
      .select('*')
      .or(`name.ilike.%${searchTerm}%,breed.ilike.%${searchTerm}%,call_name.ilike.%${searchTerm}%`)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'search', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'search');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'search');
    logQuery('dog', 'search', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get dogs with upcoming shows (simplified query)
export const getDogsWithUpcomingShows = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog')
      .select(`
        *,
        owner:user!dog_owner_id_fkey(first_name, last_name)
      `)
      .is('deleted_at', null)
      .order('name', { ascending: true });
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'select_with_upcoming_shows', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'select_with_upcoming_shows');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'select_with_upcoming_shows');
    logQuery('dog', 'select_with_upcoming_shows', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get dog statistics
export const getDogStatistics = async () => {
  const startTime = Date.now();
  
  try {
    const { error, count } = await supabase
      .from('dog')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    
    const duration = Date.now() - startTime;
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'statistics');
    }
    
    const stats = {
      total: count || 0,
    };
    
    logQuery('dog', 'statistics', duration);
    return { data: stats, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'statistics');
    logQuery('dog', 'statistics', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Hard delete dog (permanent removal - admin only)
export const hardDeleteDog = async (id: string) => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog')
      .delete()
      .eq('id', id)
      .select('id, name')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'hard_delete', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'hard_delete');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'hard_delete');
    logQuery('dog', 'hard_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Restore soft-deleted dog (admin only)
export const restoreDog = async (id: string, restoredBy?: string) => {
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
      .from('dog')
      .update(updateData)
      .eq('id', id)
      .select('id, name')
      .single();
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'restore', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'restore');
    }
    
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'restore');
    logQuery('dog', 'restore', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get soft-deleted dogs (admin only)
export const getDeletedDogs = async () => {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase
      .from('dog')
      .select(`
        *,
        owner:user!dog_owner_id_fkey(id, first_name, last_name, email),
        deleted_by_user:deleted_by(id, email, first_name, last_name)
      `)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    
    const duration = Date.now() - startTime;
    logQuery('dog', 'select_deleted', duration, error?.message);
    
    if (error) {
      throw createDatabaseError(error, 'dog', 'select_deleted');
    }
    
    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'select_deleted');
    logQuery('dog', 'select_deleted', duration, dbError.message);
    return { data: [], error: dbError };
  }
};