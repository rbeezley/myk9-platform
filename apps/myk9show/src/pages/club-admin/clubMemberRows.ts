/**
 * One row per person for the club Members list (MYK9-2364, docs/plan-club-members-one-list.md).
 *
 * The four sources (roster, admins, show secretaries, officers) overlap: an admin or a secretary
 * need not be a member, and an officer can be a typed name with no account. This pure module merges
 * them by person id so a person who holds three roles appears once with three badges. A typed-name
 * officer has no person id, so each such officer is its own row keyed by the officer id.
 *
 * A source that failed to load (or cannot load offline, like the admin list) is passed as `null`.
 * It is never treated as "nobody": the row's flag for that source is `null` (unknown), and the
 * matching role view reports an unknown count.
 */

import type { ListView } from '@/components/list-toolkit';
import {
  OFFICER_POSITION_ORDER,
  type ClubMember,
  type ClubOfficer,
  type MembershipStatus,
} from '@/types/club-membership-types';
import type { ClubAdmin, ClubShowManager } from '@/services/database/club-memberships';

export type RoleView = 'all' | 'admins' | 'secretaries' | 'officers';

export const ROLE_VIEW_IDS: readonly RoleView[] = ['all', 'admins', 'secretaries', 'officers'];

const ROLE_VIEW_LABELS: Record<RoleView, string> = {
  all: 'All',
  admins: 'Admins',
  secretaries: 'Show secretaries',
  officers: 'Officers',
};

export interface ClubPersonRow {
  /** The person id, or `officer:<id>` for a typed-name officer. Unique in the list. */
  key: string;
  /** Null only for a typed-name officer, who has no account. */
  personId: string | null;
  /** The roster row; null for someone who is not a club member. */
  member: ClubMember | null;
  name: string;
  email: string | null;
  /** Null: the admin list could not be read, so this is unknown rather than "no". */
  isAdmin: boolean | null;
  /** Null: the show secretary list could not be read. */
  isShowSecretary: boolean | null;
  /** In position order. Empty when none are held, or when `officersKnown` is false. */
  officerTitles: ClubOfficer[];
  officersKnown: boolean;
}

/** `null` marks a source that could not be loaded. */
export interface ClubRowSources {
  members: ClubMember[];
  admins: ClubAdmin[] | null;
  showManagers: ClubShowManager[] | null;
  officers: ClubOfficer[] | null;
}

interface Draft {
  personId: string | null;
  member: ClubMember | null;
  name: string | null;
  email: string | null;
  isAdmin: boolean;
  isShowSecretary: boolean;
  officerTitles: ClubOfficer[];
}

const POSITION_INDEX: Record<string, number> = Object.fromEntries(
  OFFICER_POSITION_ORDER.map((position, index) => [position, index])
);

export function mergeClubPersonRows(sources: ClubRowSources): ClubPersonRow[] {
  const drafts = new Map<string, Draft>();
  const draftFor = (key: string, personId: string | null): Draft => {
    let draft = drafts.get(key);
    if (!draft) {
      draft = {
        personId,
        member: null,
        name: null,
        email: null,
        isAdmin: false,
        isShowSecretary: false,
        officerTitles: [],
      };
      drafts.set(key, draft);
    }
    return draft;
  };
  const fill = (
    draft: Draft,
    name: string | null | undefined,
    email: string | null | undefined
  ) => {
    draft.name ??= name || null;
    draft.email ??= email || null;
  };

  for (const member of sources.members) {
    const draft = draftFor(member.personId, member.personId);
    draft.member = member;
    fill(draft, member.personName, member.personEmail);
  }
  for (const admin of sources.admins ?? []) {
    const draft = draftFor(admin.personId, admin.personId);
    draft.isAdmin = true;
    fill(draft, admin.personName, admin.personEmail);
  }
  for (const manager of sources.showManagers ?? []) {
    const draft = draftFor(manager.personId, manager.personId);
    draft.isShowSecretary = true;
    fill(draft, manager.personName, manager.personEmail);
  }
  for (const officer of sources.officers ?? []) {
    const draft = officer.personId
      ? draftFor(officer.personId, officer.personId)
      : draftFor(`officer:${officer.id}`, null);
    draft.officerTitles.push(officer);
    fill(draft, officer.personName, officer.personEmail);
  }

  return [...drafts.entries()].map(([key, draft]) => ({
    key,
    personId: draft.personId,
    member: draft.member,
    name: draft.name ?? 'Unknown',
    email: draft.email,
    isAdmin: sources.admins === null ? null : draft.isAdmin,
    isShowSecretary: sources.showManagers === null ? null : draft.isShowSecretary,
    officerTitles: [...draft.officerTitles].sort(
      (a, b) => (POSITION_INDEX[a.position] ?? 99) - (POSITION_INDEX[b.position] ?? 99)
    ),
    officersKnown: sources.officers !== null,
  }));
}

/** Whether the row belongs in a role view. An unknown flag never matches: it is not "yes". */
function inRoleView(row: ClubPersonRow, view: RoleView): boolean {
  switch (view) {
    case 'all':
      return true;
    case 'admins':
      return row.isAdmin === true;
    case 'secretaries':
      return row.isShowSecretary === true;
    case 'officers':
      return row.officerTitles.length > 0;
  }
}

export interface ClubRowFilter {
  view: RoleView;
  status: MembershipStatus | 'all';
  search: string;
}

/** A status filter keeps only members of that status: a non-member has no status to match. */
export function filterClubPersonRows(
  rows: ClubPersonRow[],
  { view, status, search }: ClubRowFilter
): ClubPersonRow[] {
  const query = search.trim().toLowerCase();
  return rows.filter(row => {
    if (!inRoleView(row, view)) return false;
    if (status !== 'all' && row.member?.membershipStatus !== status) return false;
    if (!query) return true;
    return row.name.toLowerCase().includes(query) || !!row.email?.toLowerCase().includes(query);
  });
}

/** Role views with a count over the whole list; a view whose source is unknown counts as unknown. */
export function buildRoleViews(rows: ClubPersonRow[], sources: ClubRowSources): ListView[] {
  // "All" is only a total once every source is known: a person found only in a failed source is
  // missing from it.
  const unknown: Record<RoleView, boolean> = {
    all: sources.admins === null || sources.showManagers === null || sources.officers === null,
    admins: sources.admins === null,
    secretaries: sources.showManagers === null,
    officers: sources.officers === null,
  };
  return ROLE_VIEW_IDS.map(id => ({
    id,
    label: ROLE_VIEW_LABELS[id],
    count: unknown[id] ? null : rows.filter(row => inRoleView(row, id)).length,
  }));
}

export function parseRoleView(raw: string | null): RoleView {
  return ROLE_VIEW_IDS.find(id => id === raw) ?? 'all';
}
