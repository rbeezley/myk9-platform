import type { ClubMember, ClubOfficer } from '@/types/club-membership-types';
import type { ClubPersonRow } from '../clubMemberRows';

/** A row for a roster member with no other role; override what a test cares about. */
export function memberRow(
  member: ClubMember,
  overrides: Partial<ClubPersonRow> = {}
): ClubPersonRow {
  return {
    key: member.personId,
    personId: member.personId,
    member,
    name: member.personName ?? 'Unknown',
    email: member.personEmail ?? null,
    isAdmin: false,
    isShowSecretary: false,
    officerTitles: [] as ClubOfficer[],
    officersKnown: true,
    ...overrides,
  };
}

export const noopRoleActions = {
  onMakeAdmin: () => {},
  onRemoveAdmin: () => {},
  onSetOfficerTitle: () => {},
  onRemoveOfficer: () => {},
};
