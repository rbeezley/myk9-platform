// CRUD operations for club_members — the people enrolled in a Club.

import { supabase } from '../supabaseClient';
import type {
  ClubMember,
  CreateClubMemberRequest,
  UpdateClubMemberRequest,
} from '@/types/club-membership-types';

interface DbMemberRow {
  id: string;
  club_id: string;
  person_id: string;
  membership_type: string;
  membership_status: string;
  joined_date: string | null;
  dues_paid_through: string | null;
  voting_eligible: boolean;
  notes: string | null;
  people: { first_name: string | null; last_name: string | null; email: string | null };
}

function mapDbMemberToClubMember(row: DbMemberRow): ClubMember {
  const p = row.people;
  return {
    id: row.id,
    clubId: row.club_id,
    personId: row.person_id,
    membershipType: row.membership_type as ClubMember['membershipType'],
    membershipStatus: row.membership_status as ClubMember['membershipStatus'],
    joinedDate: row.joined_date,
    duesPaidThrough: row.dues_paid_through,
    votingEligible: row.voting_eligible,
    notes: row.notes,
    personName: [p.first_name, p.last_name].filter(Boolean).join(' ') || undefined,
    personEmail: p.email ?? undefined,
  };
}

const MEMBER_SELECT = `
  id, club_id, person_id, membership_type, membership_status,
  joined_date, dues_paid_through, voting_eligible, notes,
  people!inner(first_name, last_name, email)
`;

export async function getClubMembers(clubId: string): Promise<ClubMember[]> {
  const { data, error } = await supabase
    .from('club_members')
    .select(MEMBER_SELECT)
    .eq('club_id', clubId)
    .order('membership_status', { ascending: true })
    .order('joined_date', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapDbMemberToClubMember);
}

export async function addClubMember(request: CreateClubMemberRequest): Promise<ClubMember> {
  const { data, error } = await supabase
    .from('club_members')
    .insert({
      club_id: request.clubId,
      person_id: request.personId,
      membership_type: request.membershipType,
      membership_status: request.membershipStatus ?? 'active',
      joined_date: request.joinedDate ?? new Date().toISOString().split('T')[0],
      voting_eligible: request.votingEligible ?? request.membershipType !== 'junior',
      notes: request.notes ?? null,
    })
    .select(MEMBER_SELECT)
    .single();

  if (error) throw error;
  return mapDbMemberToClubMember(data);
}

export async function updateClubMember(
  memberId: string,
  updates: UpdateClubMemberRequest
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.membershipType !== undefined) dbUpdates.membership_type = updates.membershipType;
  if (updates.membershipStatus !== undefined)
    dbUpdates.membership_status = updates.membershipStatus;
  if (updates.duesPaidThrough !== undefined) dbUpdates.dues_paid_through = updates.duesPaidThrough;
  if (updates.votingEligible !== undefined) dbUpdates.voting_eligible = updates.votingEligible;
  if (updates.notes !== undefined) dbUpdates.notes = updates.notes;

  const { error } = await supabase.from('club_members').update(dbUpdates).eq('id', memberId);

  if (error) throw error;
}

export async function removeClubMember(memberId: string): Promise<void> {
  const { error } = await supabase.from('club_members').delete().eq('id', memberId);

  if (error) throw error;
}
