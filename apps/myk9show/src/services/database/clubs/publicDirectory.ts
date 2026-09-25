import { supabase, createDatabaseError } from '../supabaseClient';
import type { Club } from '@/types/club-types';

/**
 * The columns the public club directory renders or searches (ClubsGridView,
 * ClubsListView, useBrowseClubsData's search). Named, never `*`.
 */
export const PUBLIC_DIRECTORY_CLUB_COLUMNS = 'id, name, description, logo_url, city, state';

interface PublicDirectoryClubRow {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  city: string | null;
  state: string | null;
}

function publicDirectoryRowToClub(row: PublicDirectoryClubRow): Club {
  return {
    id: String(row.id),
    name: row.name,
    clubNumber: '',
    email: '',
    phone: '',
    description: row.description ?? '',
    logo: row.logo_url ?? '',
    coverImage: '',
    accentColor: '',
    address: {
      street: '',
      city: row.city ?? '',
      state: row.state ?? '',
      zipCode: '',
      country: 'US',
    },
    upcomingShows: [],
    pastShows: [],
  };
}

/**
 * MYK9-747: the club directory as the server lists it for the CURRENT
 * (signed-out or anonymous) session. clubs_select decides what anon sees
 * (authorized, or hosting a public show; never deleted), so this read is
 * the authority for the guest directory. Online-only by design: it throws
 * on failure so React Query reports an error instead of an empty list.
 */
export async function getPublicDirectoryClubs(): Promise<Club[]> {
  const { data, error } = await supabase
    .from('clubs')
    .select(PUBLIC_DIRECTORY_CLUB_COLUMNS)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) {
    throw createDatabaseError(error, 'club', 'select_public_directory');
  }

  return ((data ?? []) as PublicDirectoryClubRow[]).map(publicDirectoryRowToClub);
}
