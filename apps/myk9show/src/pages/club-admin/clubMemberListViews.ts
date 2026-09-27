/**
 * The club Members tab's built-in views and search filter (list toolkit,
 * MYK9-797) — one view per `MembershipStatus`, drafted from the page. There is
 * no "Pending" view: a pending join is a membership REQUEST, a distinct
 * surface (`ClubShowAccessRequests` / `useClubMembershipRequests`) already
 * rendered above this tab — adding one here would duplicate it rather than
 * link to it (CLAUDE.md, "consolidate, don't duplicate").
 */

import type { ListView } from '@/components/list-toolkit';
import {
  MEMBERSHIP_STATUS_LABELS,
  type ClubMember,
  type MembershipStatus,
} from '@/types/club-membership-types';

export type MemberStatusFilter = MembershipStatus | 'all';

const STATUS_VIEWS: readonly MembershipStatus[] = ['active', 'lapsed', 'suspended', 'resigned'];

/** Pure filter, shared with the view counts so a view's badge and its rows can never disagree. */
export function filterClubMembers(
  members: ClubMember[],
  status: MemberStatusFilter,
  search: string
): ClubMember[] {
  let result = members;
  if (status !== 'all') {
    result = result.filter(member => member.membershipStatus === status);
  }
  const query = search.trim().toLowerCase();
  if (query) {
    result = result.filter(
      member =>
        member.personName?.toLowerCase().includes(query) ||
        member.personEmail?.toLowerCase().includes(query)
    );
  }
  return result;
}

/** Every built-in view with its count over the whole roster (search excluded). */
export function buildClubMemberViews(members: ClubMember[]): ListView[] {
  return [
    { id: 'all', label: 'All', count: members.length },
    ...STATUS_VIEWS.map(status => ({
      id: status,
      label: MEMBERSHIP_STATUS_LABELS[status],
      count: filterClubMembers(members, status, '').length,
    })),
  ];
}
