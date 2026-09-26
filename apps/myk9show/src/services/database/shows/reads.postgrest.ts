import { sanitizePostgRESTFilter } from '@/utils/sanitizePostgRESTFilter';
import { supabase, createDatabaseError } from '../supabaseClient';

/** Statuses the public /shows listing shows; the stray-show health check (MYK9-741) mirrors them. */
export const PUBLIC_SHOW_STATUSES = ['published', 'upcoming', 'in_progress', 'completed'];

interface ShowVisibilityFilterable<Q> {
  in(column: 'status', values: string[]): Q;
  is(column: 'deleted_at', value: null): Q;
}

/**
 * The shows anon may see. shows_select (latest:
 * 20260823190000_admin_soft_deleted_show_visibility.sql) returns exactly
 * `deleted_at IS NULL AND status IN PUBLIC_SHOW_STATUSES` to anon; every
 * public read states both filters so it means the same thing whoever runs it
 * (MYK9-768, MYK9-779, MYK9-780).
 */
export function onlyPublicShows<Q extends ShowVisibilityFilterable<Q>>(query: Q): Q {
  return query.in('status', PUBLIC_SHOW_STATUSES).is('deleted_at', null);
}

export async function postgrestGetPublicShows() {
  const { data, error } = await onlyPublicShows(
    supabase
      .from('shows')
      // Exclude logo_url / cover_image_url: they can be multi-MB base64 blobs.
      // The trials embed is load-bearing, not decorative: `mapDatabaseToShow`
      // derives `show.events` from the trials' `trial_type`, and `show.events` is
      // the only input to the /shows discipline filter. Without it every show
      // falls back to `[organization]` and every discipline chip matches nothing.
      // Nested classes are deliberately NOT embedded — a browse list does not
      // need them and they dominate the payload. `timezone` IS: Browse judges
      // entry status in the show's first-trial zone, as `submit_show_entries`
      // does, and without it every guest label fell back to Eastern (MYK9-714).
      .select('*, club:clubs(name, address, email), trials(id, name, date, trial_type, timezone)')
  ).order('start_date', { ascending: true });

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
        timezone,
        registry_id,
        status,
        trial_type,
        max_entries_per_dog,
        max_total_entries,
        max_entries_per_handler,
        class:classes(
          id,
          name,
          description,
          entry_fee,
          jump_heights,
          max_entries,
          allow_waitlist,
          max_dogs_per_handler,
          level,
          element,
          section,
          competition_type,
          breed_restrictions,
          age_min,
          age_max,
          height_min,
          height_max,
          handler_age_min,
          handler_age_max,
          start_time,
          estimated_duration
        )
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
        judge:people!judge_assignments_person_id_fkey(
          id,
          first_name,
          last_name
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
        timezone,
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
        timezone,
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
        timezone,
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
      end_date,
      entry_close_date
    `
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  if (error) throw createDatabaseError(error, 'show', 'select_secretary_shows');
  return { data: data || [], error: null };
}

/**
 * One show with its full detail. `publicOnly` is the signed-out guest's read
 * (MYK9-779): it states anon's visibility rule (onlyPublicShows), so a draft
 * or a soft-deleted show is "no row" whoever runs it.
 */
export async function postgrestGetShowById(id: string, options: { publicOnly?: boolean } = {}) {
  const byId = supabase
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
        timezone,
        registry_id,
        status,
        trial_type,
        max_entries_per_dog,
        max_total_entries,
        max_entries_per_handler,
        class:classes(
          id,
          name,
          description,
          entry_fee,
          jump_heights,
          max_entries,
          allow_waitlist,
          max_dogs_per_handler,
          level,
          element,
          section,
          competition_type,
          breed_restrictions,
          age_min,
          age_max,
          height_min,
          height_max,
          handler_age_min,
          handler_age_max,
          start_time,
          estimated_duration
        )
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
        judge:people!judge_assignments_person_id_fkey(
          id,
          first_name,
          last_name
        )
      )
    `
    )
    .eq('id', id);
  const query = options.publicOnly ? onlyPublicShows(byId) : byId.is('deleted_at', null);
  const { data, error } = await query.maybeSingle();

  if (error) throw createDatabaseError(error, 'show', 'select_by_id');
  return { data: Array.isArray(data) ? null : data, error: null };
}
