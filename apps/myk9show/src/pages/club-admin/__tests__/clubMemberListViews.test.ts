import { describe, it, expect } from 'vitest';
import type { ClubMember } from '@/types/club-membership-types';
import { buildClubMemberViews, filterClubMembers } from '../clubMemberListViews';

function member(overrides: Partial<ClubMember>): ClubMember {
  return {
    id: overrides.id ?? 'm',
    clubId: 'club-1',
    personId: overrides.personId ?? 'person',
    membershipType: 'full',
    membershipStatus: 'active',
    joinedDate: null,
    duesPaidThrough: null,
    votingEligible: true,
    notes: null,
    ...overrides,
  };
}

const MEMBERS: ClubMember[] = [
  member({ id: 'm-1', personId: 'p-1', personName: 'Ada Lovelace', membershipStatus: 'active' }),
  member({ id: 'm-2', personId: 'p-2', personName: 'Grace Hopper', membershipStatus: 'active' }),
  member({
    id: 'm-3',
    personId: 'p-3',
    personName: 'Rex Handler',
    personEmail: 'rex@example.com',
    membershipStatus: 'lapsed',
  }),
  member({ id: 'm-4', personId: 'p-4', personName: 'Sue Steward', membershipStatus: 'suspended' }),
  member({ id: 'm-5', personId: 'p-5', personName: 'Jo Resigned', membershipStatus: 'resigned' }),
];

describe('filterClubMembers', () => {
  it('returns everyone for "all" with no search', () => {
    expect(filterClubMembers(MEMBERS, 'all', '')).toHaveLength(5);
  });

  it('filters to one membership status', () => {
    expect(filterClubMembers(MEMBERS, 'active', '').map(m => m.id)).toEqual(['m-1', 'm-2']);
  });

  it('searches by name or email, case-insensitively, within the status', () => {
    expect(filterClubMembers(MEMBERS, 'all', 'ada').map(m => m.id)).toEqual(['m-1']);
    expect(filterClubMembers(MEMBERS, 'all', 'rex@example.com').map(m => m.id)).toEqual(['m-3']);
    expect(filterClubMembers(MEMBERS, 'active', 'rex')).toHaveLength(0);
  });
});

describe('buildClubMemberViews', () => {
  it('counts every status view, plus All, over the whole roster', () => {
    const views = buildClubMemberViews(MEMBERS);
    const byId = Object.fromEntries(views.map(v => [v.id, v.count]));
    expect(byId.all).toBe(5);
    expect(byId.active).toBe(2);
    expect(byId.lapsed).toBe(1);
    expect(byId.suspended).toBe(1);
    expect(byId.resigned).toBe(1);
  });

  it('labels views with the membership-status display labels', () => {
    const views = buildClubMemberViews(MEMBERS);
    expect(views.map(v => v.label)).toEqual(['All', 'Active', 'Lapsed', 'Suspended', 'Resigned']);
  });
});
