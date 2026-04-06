/**
 * Entry lookup and search queries
 *
 * Read-only operations for fetching, filtering, and searching entries.
 * Includes statistics aggregation and eligibility checks.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

/**
 * Fetch armband numbers from the authoritative `armbands` table for entries
 * that are missing them. Returns a Map of `show_id:dog_id` → armband_number.
 *
 * The `entries.armband` column is a denormalized copy that may lag behind
 * if the replication UPDATE mutation hasn't synced yet. The `armbands` table
 * is the authoritative source (written atomically by the assign_armband RPC).
 */
async function fetchMissingArmbands(
  entries: ReadonlyArray<{ armband: string | null; show_id: string | null; dog_id: string | null }>
): Promise<Map<string, string>> {
  const missing = entries.filter(e => !e.armband && e.show_id && e.dog_id);
  if (missing.length === 0) return new Map();

  const showIds = [...new Set(missing.map(e => e.show_id!))];
  const dogIds = [...new Set(missing.map(e => e.dog_id!))];

  const { data: armbandRows } = await supabase
    .from('armbands')
    .select('show_id, dog_id, armband_number')
    .in('show_id', showIds)
    .in('dog_id', dogIds);

  if (!armbandRows || armbandRows.length === 0) return new Map();

  return new Map(armbandRows.map(a => [`${a.show_id}:${a.dog_id}`, String(a.armband_number)]));
}

// Get all entries with related data
export const getAllEntries = async () => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
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
            email,
            phone
          )
        ),
        class:class_id (
          id,
          name,
          class_number,
          entry_fee,
          max_entries
        ),
        show:show_id (
          id,
          name,
          start_date,
          end_date,
          location,
          status
        )
      `
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_all_with_details', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_all');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_all');
    logQuery('entries', 'select_all_with_details', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entry by ID with full details
export const getEntryById = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        *,
        dog:dog_id (
          id,
          name,
          call_name,
          breed,
          registration_number,
          owner:owner_id (
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
        class:class_id (
          id,
          name,
          class_number,
          description,
          entry_fee,
          max_entries,
          jump_height
        ),
        show:show_id (
          id,
          name,
          start_date,
          end_date,
          location,
          status
        )
      `
      )
      .eq('id', id)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_id_detailed', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_id');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_id');
    logQuery('entries', 'select_by_id_detailed', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get entries by show ID
export const getEntriesByShow = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
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
        )
      `
      )
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_show', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_show');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_show');
    logQuery('entries', 'select_by_show', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entries by show ID with financial joins (promo_code, trial name)
export const getEntriesByShowForFinancials = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
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
        promo_code:promo_code_id (
          id,
          code,
          discount_type,
          discount_value
        ),
        trial:trial_id (
          id,
          name
        )
      `
      )
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_show_financials', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_show_financials');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_show_financials');
    logQuery('entries', 'select_by_show_financials', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entries by trial ID (via class join — shared by TrialEntriesTable, FinancialSummary, TrialDetailsPage)
export const getEntriesByTrial = async (trialId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
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
        class:class_id!inner (
          id,
          name,
          class_number,
          entry_fee,
          trial_id
        ),
        promo_code:promo_code_id (
          id,
          code,
          discount_type,
          discount_value
        )
      `
      )
      .eq('class.trial_id', trialId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_trial', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_trial');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_trial');
    logQuery('entries', 'select_by_trial', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entries by class ID
export const getEntriesByClass = async (classId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
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
        )
      `
      )
      .eq('class_id', classId)
      .is('deleted_at', null)
      .order('run_order', { ascending: true, nullsFirst: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_class', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_class');
    }

    const entries = data || [];

    // Backfill armbands from the authoritative armbands table for entries
    // whose replication UPDATE hasn't synced yet
    const armbandMap = await fetchMissingArmbands(entries);
    const backfilledEntries = entries.map(e => {
      if (!e.armband && e.show_id && e.dog_id) {
        const armband = armbandMap.get(`${e.show_id}:${e.dog_id}`);
        if (armband) return { ...e, armband };
      }
      return e;
    });

    return { data: backfilledEntries, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_class');
    logQuery('entries', 'select_by_class', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entries by dog ID
export const getEntriesByDog = async (dogId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        *,
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
          end_date,
          location
        )
      `
      )
      .eq('dog_id', dogId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_dog', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_dog');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_dog');
    logQuery('entries', 'select_by_dog', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Get entries by status
export const getEntriesByStatus = async (status: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
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
      `
      )
      .eq('entry_status', status)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'select_by_status', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'select_by_status');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'select_by_status');
    logQuery('entries', 'select_by_status', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Statistics, search, and eligibility operations (re-exported for backward compatibility)
export {
  getEntryStatistics,
  getUserEntries,
  searchEntries,
  canModifyEntry,
} from './entry-query-search';
