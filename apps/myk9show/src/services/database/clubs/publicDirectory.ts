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

/**
 * The columns the club page (ClubDetails: header, About, branding) renders.
 * Named, never `*`; authorized_at is left out because its control is
 * site-admin-only and a guest is never a site admin.
 */
export const PUBLIC_CLUB_DETAIL_COLUMNS =
  'id, name, club_number, email, phone, website, description, logo_url, cover_image_url, accent_color, address, city, state, zip_code';

interface PublicClubDetailRow extends PublicDirectoryClubRow {
  club_number: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  cover_image_url: string | null;
  accent_color: string | null;
  address: string | null;
  zip_code: string | null;
}

function publicClubDetailRowToClub(row: PublicClubDetailRow): Club {
  // Same combined-address fallback as clubStore's replicatedToClub.
  const addressParts = row.address?.split(', ') ?? [];
  const base = publicDirectoryRowToClub(row);
  return {
    ...base,
    clubNumber: row.club_number ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    website: row.website ?? undefined,
    coverImage: row.cover_image_url ?? '',
    accentColor: row.accent_color ?? '',
    address: {
      street: addressParts[0] ?? '',
      city: row.city || addressParts[1] || '',
      state: row.state || addressParts[2]?.split(' ')[0] || '',
      zipCode: row.zip_code || addressParts[2]?.split(' ')[1] || '',
      country: addressParts[3] || 'US',
    },
  };
}

/**
 * MYK9-747: one club as the server shows it to the CURRENT (signed-out or
 * anonymous) session, or null when clubs_select hides it (revoked, never
 * authorized, deleted, or no such club): the page's not-found state. Throws
 * on failure so a failed read never reads as not-found.
 */
export async function getPublicClubById(id: string): Promise<Club | null> {
  const { data, error } = await supabase
    .from('clubs')
    .select(PUBLIC_CLUB_DETAIL_COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw createDatabaseError(error, 'club', 'select_public_by_id');
  }

  return data ? publicClubDetailRowToClub(data as PublicClubDetailRow) : null;
}
