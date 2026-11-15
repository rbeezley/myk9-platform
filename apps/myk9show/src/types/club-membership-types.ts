export type MembershipType = 'full' | 'associate' | 'junior' | 'honorary';
export type MembershipStatus = 'active' | 'lapsed' | 'suspended' | 'resigned';
export type OfficerPosition =
  'president' | 'vice_president' | 'secretary' | 'treasurer' | 'board_member';

export interface ClubMember {
  id: string;
  clubId: string;
  personId: string;
  membershipType: MembershipType;
  membershipStatus: MembershipStatus;
  joinedDate: string | null;
  duesPaidThrough: string | null;
  votingEligible: boolean;
  notes: string | null;
  // Joined from people table
  personName?: string | undefined;
  personEmail?: string | undefined;
}

export interface ClubOfficer {
  id: string;
  clubId: string;
  /** Null for an officer typed by name who has no account (MYK9-2045). */
  personId: string | null;
  position: OfficerPosition;
  termStart: string | null;
  termEnd: string | null;
  electedDate: string | null;
  /** The linked person's name, else the typed name. */
  personName?: string | undefined;
  personEmail?: string | undefined;
}

export interface CreateClubMemberRequest {
  clubId: string;
  personId: string;
  membershipType: MembershipType;
  membershipStatus?: MembershipStatus;
  joinedDate?: string;
  votingEligible?: boolean;
  notes?: string;
}

export interface UpdateClubMemberRequest {
  membershipType?: MembershipType;
  membershipStatus?: MembershipStatus;
  duesPaidThrough?: string | null;
  votingEligible?: boolean;
  notes?: string | null;
}

/** Who holds an officer position: a person with an account, or a typed name. */
export type OfficerTarget = { personId: string } | { displayName: string };

export interface CreateClubOfficerRequest {
  clubId: string;
  /** Exactly one of personId or displayName (a typed name for someone with no account). */
  personId?: string;
  displayName?: string;
  position: OfficerPosition;
  termStart?: string;
  termEnd?: string;
  electedDate?: string;
}

export const MEMBERSHIP_TYPE_LABELS: Record<MembershipType, string> = {
  full: 'Full Member',
  associate: 'Associate',
  junior: 'Junior',
  honorary: 'Honorary',
};

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  active: 'Active',
  lapsed: 'Lapsed',
  suspended: 'Suspended',
  resigned: 'Resigned',
};

export const OFFICER_POSITION_LABELS: Record<OfficerPosition, string> = {
  president: 'President',
  vice_president: 'Vice President',
  secretary: 'Club secretary',
  treasurer: 'Treasurer',
  board_member: 'Board Member',
};

// Order for display
export const OFFICER_POSITION_ORDER: OfficerPosition[] = [
  'president',
  'vice_president',
  'secretary',
  'treasurer',
  'board_member',
];
