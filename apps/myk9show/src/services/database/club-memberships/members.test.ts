import { describe, expect, it } from 'vitest';
import type { ClubMember } from '@/types/club-membership-types';
import { countActiveClubMembers, getActiveClubMembers } from './members';

const makeMember = (id: string, membershipStatus: ClubMember['membershipStatus']): ClubMember => ({
  id,
  clubId: 'club-1',
  personId: `person-${id}`,
  membershipType: 'full',
  membershipStatus,
  joinedDate: '2026-01-01',
  duesPaidThrough: null,
  votingEligible: true,
  notes: null,
  personName: id,
});

describe('club membership projection', () => {
  it('projects only active members for profile-facing counts and lists', () => {
    const members = [
      makeMember('active-1', 'active'),
      makeMember('lapsed-1', 'lapsed'),
      makeMember('active-2', 'active'),
      makeMember('suspended-1', 'suspended'),
      makeMember('resigned-1', 'resigned'),
    ];

    expect(getActiveClubMembers(members)).toEqual([members[0], members[2]]);
    expect(countActiveClubMembers(members)).toBe(2);
  });

  it('returns an empty active projection when all memberships are inactive', () => {
    const members = [makeMember('lapsed-1', 'lapsed'), makeMember('resigned-1', 'resigned')];

    expect(getActiveClubMembers(members)).toEqual([]);
    expect(countActiveClubMembers(members)).toBe(0);
  });
});
