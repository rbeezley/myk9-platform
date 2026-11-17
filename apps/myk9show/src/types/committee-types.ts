/**
 * MYK9-2064: the Event Committee. One list lives on the club; a show may carry its own list that
 * replaces the club's for that show. A member is a person with an account or a typed name.
 */

/** Who sits on the committee: a person with an account, or a typed name. */
export type CommitteeTarget = { personId: string } | { displayName: string };

export interface CommitteeMember {
  id: string;
  /** Null for a member typed by name, who has no account. */
  personId: string | null;
  /** The linked person's name, else the typed name. */
  name: string;
  sortOrder: number;
}

/** Which list: the club's, or one show's own. */
export type CommitteeScope = { kind: 'club'; clubId: string } | { kind: 'show'; showId: string };
