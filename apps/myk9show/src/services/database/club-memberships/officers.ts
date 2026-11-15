// CRUD operations for club_officers — elected position-holders within a Club.

import { supabase } from '../supabaseClient';
import type { ClubOfficer, CreateClubOfficerRequest } from '@/types/club-membership-types';

interface DbOfficerRow {
  id: string;
  club_id: string;
  person_id: string | null;
  display_name: string | null;
  position: string;
  term_start: string | null;
  term_end: string | null;
  elected_date: string | null;
  // null for an officer typed by name, who has no account (MYK9-2045).
  people: { first_name: string | null; last_name: string | null; email: string | null } | null;
}

function mapDbOfficerToClubOfficer(row: DbOfficerRow): ClubOfficer {
  const p = row.people;
  const linkedName = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';
  return {
    id: row.id,
    clubId: row.club_id,
    personId: row.person_id,
    position: row.position as ClubOfficer['position'],
    termStart: row.term_start,
    termEnd: row.term_end,
    electedDate: row.elected_date,
    personName: linkedName || row.display_name?.trim() || undefined,
    personEmail: p?.email ?? undefined,
  };
}

const OFFICER_SELECT = `
  id, club_id, person_id, display_name, position, term_start, term_end, elected_date,
  people(first_name, last_name, email)
`;

export async function getClubOfficers(clubId: string): Promise<ClubOfficer[]> {
  const { data, error } = await supabase
    .from('club_officers')
    .select(OFFICER_SELECT)
    .eq('club_id', clubId);

  if (error) throw error;
  return (data ?? []).map(mapDbOfficerToClubOfficer);
}

export async function addClubOfficer(request: CreateClubOfficerRequest): Promise<ClubOfficer> {
  const { data, error } = await supabase
    .from('club_officers')
    .insert({
      club_id: request.clubId,
      person_id: request.personId ?? null,
      display_name: request.personId ? null : (request.displayName?.trim() ?? null),
      position: request.position,
      term_start: request.termStart ?? null,
      term_end: request.termEnd ?? null,
      elected_date: request.electedDate ?? null,
    })
    .select(OFFICER_SELECT)
    .single();

  if (error) throw error;
  return mapDbOfficerToClubOfficer(data);
}

export async function removeClubOfficer(officerId: string): Promise<void> {
  const { error } = await supabase.from('club_officers').delete().eq('id', officerId);

  if (error) throw error;
}

/**
 * MYK9-2045: the host club's officers for one show (position and name only, no email), through
 * the get_show_club_officers RPC. It works signed out for a publicly visible show, which the
 * premium PDF and the public landing page both need, and reads the same Officers list the club
 * admin edits. `null` means the read failed, which a caller must not confuse with "no officers".
 */
export async function fetchShowClubOfficers(
  showId: string
): Promise<Array<{ position: string; name: string }> | null> {
  const { data, error } = await supabase.rpc('get_show_club_officers', { p_show_id: showId });
  if (error) return null;
  return (data ?? []).map(row => ({ position: row.position, name: row.name }));
}
