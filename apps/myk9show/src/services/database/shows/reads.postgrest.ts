import { sanitizePostgRESTFilter } from '@/utils/sanitizePostgRESTFilter';
import { supabase, createDatabaseError } from '../supabaseClient';

const PUBLIC_SHOW_STATUSES = ['published', 'upcoming', 'in_progress', 'completed'];

export async function postgrestGetPublicShows() {
  const { data, error } = await supabase
    .from('shows')
    // Exclude logo_url / cover_image_url: they can be multi-MB base64 blobs.
    .select('*, club:clubs(name, address, email)')
    .in('status', PUBLIC_SHOW_STATUSES)
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'select_public');
  return { data: data || [], error: null };
}

export async function postgrestGetAllShows() {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        logo_url,
        cover_image_url,
        accent_color
      ),
      trials(
        id,
        name,
        date,
        trial_number,
        status,
        trial_type,
        max_entries_per_dog,
        max_total_entries,
        max_entries_per_handler
      ),
      judge_assignments(
        id,
        person_id,
        show_id,
        trial_id,
        class_id,
        status,
        invited_at,
        confirmed_at,
        fee,
        notes,
        judge:people(
          id,
          first_name,
          last_name,
          email
        )
      )
    `
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'select_all');
  return { data: data || [], error: null };
}

export async function postgrestGetUpcomingShows(limit: number) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        logo_url,
        cover_image_url,
        accent_color
      ),
      trials(
        id,
        name,
        date,
        trial_number,
        status
      )
    `
    )
    .gte('start_date', today)
    .is('deleted_at', null)
    .order('start_date', { ascending: true })
    .limit(limit);

  if (error) throw createDatabaseError(error, 'show', 'select_upcoming');
  return { data: data || [], error: null };
}

export async function postgrestGetShowsByDateRange(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        logo_url,
        cover_image_url,
        accent_color
      ),
      trials(
        id,
        name,
        date,
        trial_number,
        status
      )
    `
    )
    .gte('start_date', startDate)
    .lte('end_date', endDate)
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'select_by_date_range');
  return { data: data || [], error: null };
}

export async function postgrestGetShowsByClub(clubId: string) {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        logo_url,
        cover_image_url,
        accent_color
      ),
      trials(
        id,
        name,
        date,
        trial_number,
        status
      )
    `
    )
    .eq('club_id', clubId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  if (error) throw createDatabaseError(error, 'show', 'select_by_club');
  return { data: data || [], error: null };
}

export async function postgrestSearchShows(searchTerm: string) {
  const { data, error } = await supabase
    .from('shows')
    .select('*')
    .or(
      `name.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,location.ilike.%${sanitizePostgRESTFilter(searchTerm)}%`
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'search');
  return { data: data || [], error: null };
}

export async function postgrestGetShowStatistics() {
  const { error, count } = await supabase
    .from('shows')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  if (error) throw createDatabaseError(error, 'show', 'statistics');
  return { data: { total: count || 0 }, error: null };
}

export async function postgrestGetShowsWithEntryCounts() {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        logo_url,
        cover_image_url,
        accent_color
      )
    `
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'select_with_entry_counts');
  const dataWithCounts =
    data?.map(show => ({
      ...show,
      entry_count: 0,
    })) || [];
  return { data: dataWithCounts, error: null };
}

export async function postgrestGetShowsByStatus(status: string) {
  const { data, error } = await supabase
    .from('shows')
    .select('*')
    .eq('status', status)
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'select_by_status');
  return { data: data || [], error: null };
}

export async function postgrestGetSecretaryShows() {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      id,
      name,
      start_date,
      end_date
    `
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  if (error) throw createDatabaseError(error, 'show', 'select_secretary_shows');
  return { data: data || [], error: null };
}

export async function postgrestGetShowById(id: string) {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        address,
        phone,
        email,
        website,
        logo_url,
        cover_image_url,
        accent_color
      ),
      trials(
        id,
        name,
        date,
        trial_number,
        status,
        trial_type,
        max_entries_per_dog,
        max_total_entries,
        max_entries_per_handler
      ),
      judge_assignments(
        id,
        person_id,
        show_id,
        trial_id,
        class_id,
        status,
        invited_at,
        confirmed_at,
        fee,
        notes,
        judge:people(
          id,
          first_name,
          last_name,
          email
        )
      )
    `
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) throw createDatabaseError(error, 'show', 'select_by_id');
  return { data, error: null };
}
