import { isAfter } from 'date-fns';
import { getAllPeopleSorted, filterPeopleByName } from '@/lib/people-utils';
import type { Club } from '@/types/club-types';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';
import type { ResolvedJudge } from './ShowDetailsStep.types';

// Re-export shared people utilities for backward compatibility
export { getAllPeopleSorted, filterPeopleByName, getPersonName } from '@/lib/people-utils';

/**
 * Filter clubs by a search term (matches name, email, or city/state).
 */
export function filterClubs(clubs: Club[], searchTerm: string): Club[] {
  if (!searchTerm.trim()) return clubs;
  const term = searchTerm.toLowerCase();
  return clubs.filter(
    club =>
      club.name.toLowerCase().includes(term) ||
      club.email.toLowerCase().includes(term) ||
      `${club.address.city}, ${club.address.state}`.toLowerCase().includes(term)
  );
}

/**
 * Resolve selected judge IDs to display records.
 */
export function resolveSelectedJudges(
  judgeIds: string[],
  people: User[],
  judgeDetails: Record<string, { name: string; email: string; phone: string }>
): ResolvedJudge[] {
  return judgeIds.map(id => {
    const person = people.find(p => p.id === id);
    const details = judgeDetails[id];
    return {
      id,
      name: person ? `${person.firstName} ${person.lastName}` : details?.name || 'Unknown Judge',
      judgeNumber: person?.judgeInfo?.judgeNumber || '',
    };
  });
}

/**
 * Returns true if start date is on or before end date (or either is missing).
 */
export function isValidDateRange(startDate?: string, endDate?: string): boolean {
  if (!startDate || !endDate) return true;
  return !isAfter(new Date(startDate), new Date(endDate));
}

/**
 * Returns true if entry open date is on or before entry close date (or either is missing).
 */
export function isValidEntryDates(openDate?: string, closeDate?: string): boolean {
  if (!openDate || !closeDate) return true;
  return !isAfter(new Date(openDate), new Date(closeDate));
}

/**
 * Split all people into "suggested" (has one of the given roles) and "others".
 * Both groups are filtered by searchTerm. Used by OfficialPicker.
 *
 * `excludeIds` removes people who cannot be picked for this official — e.g. the
 * person already selected as the OTHER official (a Chairman and Secretary cannot
 * be the same person). Excluding an id that isn't present is a harmless no-op.
 */
export function groupPeopleForOfficial(
  people: User[],
  suggestedRoles: UserRole[],
  searchTerm: string,
  excludeIds: string[] = [],
  /**
   * Person ids belonging to the show's host club. When supplied, club members are
   * lifted into their own group ahead of everyone else (F8).
   *
   * Members are surfaced, NOT enforced: a club may legitimately appoint a chairman
   * from outside its roster, so everyone stays reachable through the search box. The
   * finding was that the picker offered a single undifferentiated "All People" list —
   * other clubs' secretaries, exhibitors and admins — with nothing to say which of
   * them the club actually knows. This mirrors JudgesPicker, which the audit cites as
   * doing it better by splitting credentialed judges from everyone else.
   */
  clubMemberIds: readonly string[] = []
): { members: User[]; suggested: User[]; others: User[] } {
  const exclude = new Set(excludeIds);
  const members = new Set(clubMemberIds);
  const sorted = getAllPeopleSorted(people).filter(p => !exclude.has(p.id));
  const filtered = filterPeopleByName(sorted, searchTerm);

  const hasSuggestedRole = (p: User) =>
    Boolean(p.roles?.some(r => suggestedRoles.includes(r as UserRole)));

  // Club membership outranks the role hint: "someone this club knows" is the more
  // useful first cut when picking an official for that club's show.
  return {
    members: filtered.filter(p => members.has(p.id)),
    suggested: filtered.filter(p => !members.has(p.id) && hasSuggestedRole(p)),
    others: filtered.filter(p => !members.has(p.id) && !hasSuggestedRole(p)),
  };
}

/**
 * Split people (minus already-selected) into "qualified" (has judge_qualifications)
 * and "others". Both groups are filtered by searchTerm. Used by JudgesPicker.
 */
export function groupPeopleForJudges(
  people: User[],
  selectedIds: string[],
  searchTerm: string
): { qualified: User[]; others: User[] } {
  const sorted = getAllPeopleSorted(people);
  const available = sorted.filter(p => !selectedIds.includes(p.id));
  const filtered = filterPeopleByName(available, searchTerm);
  return {
    qualified: filtered.filter(p => (p.judgeInfo?.qualifications?.length ?? 0) > 0),
    others: filtered.filter(p => (p.judgeInfo?.qualifications?.length ?? 0) === 0),
  };
}
