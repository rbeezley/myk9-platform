import type { User } from '@/types/user-types';

/** The list stays short on purpose: a secretary who needs more types more of the name. */
export const PEOPLE_MATCH_LIMIT = 5;

function nameOf(person: User): string {
  const full = `${person.firstName ?? ''} ${person.lastName ?? ''}`.trim();
  return full || (person.name ?? '').trim();
}

/** What a row shows: "First Last", falling back to the stored full name. */
export function personDisplayName(person: User): string {
  return nameOf(person);
}

/**
 * People whose name contains every word typed, in any order ("smith jo" finds "Jo Smith").
 * Reads the saved people directory only; names are all it looks at.
 */
export function matchPeopleByName(
  people: readonly User[],
  query: string,
  limit: number = PEOPLE_MATCH_LIMIT
): User[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const matches: User[] = [];
  for (const person of people) {
    const haystack = `${nameOf(person)} ${person.lastName ?? ''} ${person.firstName ?? ''}`
      .toLowerCase()
      .trim();
    if (haystack && words.every(word => haystack.includes(word))) {
      matches.push(person);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
