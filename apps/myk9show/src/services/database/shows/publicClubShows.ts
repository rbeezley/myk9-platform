import { supabase, createDatabaseError } from '../supabaseClient';
import { PUBLIC_SHOW_STATUSES } from './reads.postgrest';

/**
 * The columns the club page's Upcoming/Past Shows tabs and stats render.
 * Named, never `*` (logo_url / cover_image_url can be multi-MB blobs). The
 * trials embed is for the event line only, as in postgrestGetPublicShows.
 */
export const PUBLIC_CLUB_SHOW_COLUMNS =
  'id, name, organization, start_date, end_date, location, accent_color, trials(trial_type)';

/** One show as the club page lists it; `Show` satisfies this shape too. */
export interface ClubShowListItem {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  events?: string[];
  accentColor?: string | null;
}

interface PublicClubShowRow {
  id: string;
  name: string;
  organization: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  accent_color: string | null;
  trials: Array<{ trial_type: string | null }> | null;
}

function rowToClubShow(row: PublicClubShowRow): ClubShowListItem {
  // Same event rule as mapDatabaseToShow: the distinct trial types, falling
  // back to the organization.
  const trialTypes = [
    ...new Set((row.trials ?? []).map(t => t.trial_type).filter((t): t is string => !!t)),
  ];
  return {
    id: String(row.id),
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    location: row.location ?? '',
    events: trialTypes.length > 0 ? trialTypes : row.organization ? [row.organization] : [],
    accentColor: row.accent_color,
  };
}

/**
 * MYK9-768: one club's shows as the server lists them for the CURRENT
 * (signed-out or anonymous) session. For anon, shows_select (latest:
 * 20260823190000_admin_soft_deleted_show_visibility.sql) returns exactly
 * `deleted_at IS NULL AND status IN PUBLIC_SHOW_STATUSES`; the same two
 * filters are stated here so the read means the same thing whoever runs it.
 * Online-only by design: it throws on failure so React Query reports an
 * error instead of an empty list.
 */
export async function getPublicClubShows(clubId: string): Promise<ClubShowListItem[]> {
  const { data, error } = await supabase
    .from('shows')
    .select(PUBLIC_CLUB_SHOW_COLUMNS)
    .eq('club_id', clubId)
    .in('status', PUBLIC_SHOW_STATUSES)
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) {
    throw createDatabaseError(error, 'show', 'select_public_club_shows');
  }

  return ((data ?? []) as unknown as PublicClubShowRow[]).map(rowToClubShow);
}
