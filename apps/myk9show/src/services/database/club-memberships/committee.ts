// CRUD for the Event Committee (MYK9-2064): club_committee_members is the club's list,
// show_committee_members is one show's own list, which replaces the club's for that show.
// get_show_committee is the one read the premium PDF and the public landing page use.

import { supabase } from '../supabaseClient';
import type { CommitteeMember, CommitteeScope, CommitteeTarget } from '@/types/committee-types';

/** Shown when the show already has its own list (another tab, or a double click). */
export const SHOW_HAS_OWN_COMMITTEE = 'This show already has its own committee.';

interface DbCommitteeRow {
  id: string;
  person_id: string | null;
  display_name: string | null;
  sort_order: number;
  people: { first_name: string | null; last_name: string | null } | null;
}

const COMMITTEE_SELECT = 'id, person_id, display_name, sort_order, people(first_name, last_name)';

/** Table and owning column for a scope. */
function scopeTarget(scope: CommitteeScope) {
  return scope.kind === 'club'
    ? ({ table: 'club_committee_members', key: 'club_id', owner: scope.clubId } as const)
    : ({ table: 'show_committee_members', key: 'show_id', owner: scope.showId } as const);
}

function mapRow(row: DbCommitteeRow): CommitteeMember {
  const p = row.people;
  const linked = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';
  return {
    id: row.id,
    personId: row.person_id,
    name: linked || row.display_name?.trim() || 'Unknown person',
    sortOrder: row.sort_order,
  };
}

function identity(target: CommitteeTarget) {
  return 'personId' in target
    ? { person_id: target.personId, display_name: null }
    : { person_id: null, display_name: target.displayName.trim() };
}

/** The list for one scope, in committee order. For a show: only its own override rows. */
export async function getCommittee(scope: CommitteeScope): Promise<CommitteeMember[]> {
  const base =
    scope.kind === 'club'
      ? supabase.from('club_committee_members').select(COMMITTEE_SELECT).eq('club_id', scope.clubId)
      : supabase
          .from('show_committee_members')
          .select(COMMITTEE_SELECT)
          .eq('show_id', scope.showId);
  const { data, error } = await base
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as DbCommitteeRow[]).map(mapRow);
}

/** Adds one member at the end of the list. */
export async function addCommitteeMember(
  scope: CommitteeScope,
  target: CommitteeTarget,
  sortOrder: number
): Promise<void> {
  const { table, key, owner } = scopeTarget(scope);
  const { error } = await supabase
    .from(table)
    .insert({ [key]: owner, ...identity(target), sort_order: sortOrder } as never);
  if (error) throw error;
}

export async function removeCommitteeMember(
  scope: CommitteeScope,
  memberId: string
): Promise<void> {
  const { table } = scopeTarget(scope);
  const { error } = await supabase.from(table).delete().eq('id', memberId);
  if (error) throw error;
}

/**
 * Moves one member up or down and renumbers the list 0..n-1, so equal or gappy sort_order values
 * from earlier edits can never make a move do nothing. Only rows whose position changed are written.
 */
export async function moveCommitteeMember(
  scope: CommitteeScope,
  members: readonly CommitteeMember[],
  memberId: string,
  direction: 'up' | 'down'
): Promise<void> {
  const index = members.findIndex(m => m.id === memberId);
  const swap = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || swap < 0 || swap >= members.length) return;
  const reordered = [...members];
  const moved = reordered[index]!;
  reordered[index] = reordered[swap]!;
  reordered[swap] = moved;

  const { table } = scopeTarget(scope);
  const changes = reordered
    .map((member, position) => ({ member, position }))
    .filter(({ member, position }) => member.sortOrder !== position);
  const results = await Promise.all(
    changes.map(({ member, position }) =>
      supabase.from(table).update({ sort_order: position }).eq('id', member.id)
    )
  );
  const failed = results.find(r => r.error);
  if (failed?.error) throw failed.error;
}

/**
 * "Change for this show": copies the club's list into the show's own rows on the server, in one
 * locked insert (copy_club_committee_to_show). Linked members keep their person, typed names keep
 * their name, and a show that already has its own list is refused (P0001).
 */
export async function copyClubCommitteeToShow(showId: string): Promise<void> {
  const { error } = await supabase.rpc('copy_club_committee_to_show', { p_show_id: showId });
  if (!error) return;
  if (error.code === 'P0001') throw new Error(SHOW_HAS_OWN_COMMITTEE);
  throw error;
}

/** "Use the club's committee": the show's own rows go, so the club's list applies again. */
export async function clearShowCommittee(showId: string): Promise<void> {
  const { error } = await supabase.from('show_committee_members').delete().eq('show_id', showId);
  if (error) throw error;
}

/**
 * The committee names for one show (the show's own list when it has one, else the club's),
 * through get_show_committee. It works signed out for a publicly visible show. `null` means the
 * read failed, which a caller must not confuse with "no committee".
 */
export async function fetchShowCommittee(showId: string): Promise<string[] | null> {
  const { data, error } = await supabase.rpc('get_show_committee', { p_show_id: showId });
  if (error) return null;
  return (data ?? []).map(row => row.name);
}
