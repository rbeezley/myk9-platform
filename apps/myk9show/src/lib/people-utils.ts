import type { User } from '@/types/user-types';

/**
 * Compare two users by full name (case-insensitive).
 */
function compareByName(a: User, b: User): number {
  const nameA = `${a.firstName ?? ''} ${a.lastName ?? ''}`.toLowerCase();
  const nameB = `${b.firstName ?? ''} ${b.lastName ?? ''}`.toLowerCase();
  return nameA.localeCompare(nameB);
}

/**
 * Return all people deduplicated by ID and sorted by name.
 */
export function getAllPeopleSorted(people: User[]): User[] {
  const deduped = [...new Map(people.map(p => [p.id, p])).values()];
  return deduped.sort(compareByName);
}

/**
 * Filter a list of people by full-name or email substring match.
 */
export function filterPeopleByName(people: User[], searchTerm: string): User[] {
  if (!searchTerm.trim()) return people;
  const term = searchTerm.toLowerCase();
  return people.filter(p => {
    const fullName = `${p.firstName ?? ''} ${p.lastName ?? ''}`.toLowerCase();
    return fullName.includes(term) || (p.email ?? '').toLowerCase().includes(term);
  });
}

/**
 * Look up a person's display name by ID.
 */
export function getPersonName(people: User[], id: string | undefined | null): string | undefined {
  if (!id) return undefined;
  const person = people.find(p => p.id === id);
  return person ? `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim() : undefined;
}
