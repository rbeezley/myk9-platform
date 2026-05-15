// CRUD operations for club_officers — elected position-holders within a Club.

import { supabase } from '../supabaseClient';
import type { ClubOfficer, CreateClubOfficerRequest } from '@/types/club-membership-types';

interface DbOfficerRow {
  id: string;
  club_id: string;
  person_id: string;
  position: string;
  term_start: string | null;
  term_end: string | null;
  elected_date: string | null;
  people: { first_name: string | null; last_name: string | null; email: string | null };
}

function mapDbOfficerToClubOfficer(row: DbOfficerRow): ClubOfficer {
  const p = row.people;
  return {
    id: row.id,
    clubId: row.club_id,
    personId: row.person_id,
    position: row.position as ClubOfficer['position'],
    termStart: row.term_start,
    termEnd: row.term_end,
    electedDate: row.elected_date,
    personName: [p.first_name, p.last_name].filter(Boolean).join(' ') || undefined,
    personEmail: p.email ?? undefined,
  };
}

const OFFICER_SELECT = `
  id, club_id, person_id, position, term_start, term_end, elected_date,
  people!inner(first_name, last_name, email)
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
      person_id: request.personId,
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
