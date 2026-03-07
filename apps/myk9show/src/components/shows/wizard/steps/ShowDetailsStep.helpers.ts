import { isAfter } from 'date-fns';
import type { Club } from '@/types/club-types';
import type { User } from '@/types/user-types';
import type { ResolvedJudge } from './ShowDetailsStep.types';

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
 * Compare two users by full name (case-insensitive).
 */
function compareByName(a: User, b: User): number {
  const nameA = `${a.firstName} ${a.lastName}`.toLowerCase();
  const nameB = `${b.firstName} ${b.lastName}`.toLowerCase();
  return nameA.localeCompare(nameB);
}

/**
 * Return all people deduplicated by ID and sorted by name.
 * Chairman/secretary are per-show assignments, not permanent roles,
 * so anyone in the system can be selected.
 */
export function getAllPeopleSorted(people: User[]): User[] {
  const deduped = [...new Map(people.map(p => [p.id, p])).values()];
  return deduped.sort(compareByName);
}

/**
 * Filter a list of people by full-name substring match.
 */
export function filterPeopleByName(people: User[], searchTerm: string): User[] {
  if (!searchTerm.trim()) return people;
  const term = searchTerm.toLowerCase();
  return people.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(term));
}

/**
 * Return judges not yet selected, optionally filtered by name/judge-number,
 * sorted alphabetically by name.
 */
export function getAvailableJudges(
  people: User[],
  selectedIds: string[],
  searchTerm: string
): User[] {
  return people
    .filter(person => person.roles?.includes('judge') && !selectedIds.includes(person.id))
    .filter(judge => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      const fullName = `${judge.firstName} ${judge.lastName}`.toLowerCase();
      const judgeNumber = judge.judgeInfo?.judgeNumber?.toLowerCase() || '';
      return fullName.includes(term) || judgeNumber.includes(term);
    })
    .sort(compareByName);
}

/**
 * Look up a person's display name by ID.
 */
export function getPersonName(people: User[], id: string | undefined): string | undefined {
  if (!id) return undefined;
  const person = people.find(p => p.id === id);
  return person ? `${person.firstName} ${person.lastName}` : undefined;
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
