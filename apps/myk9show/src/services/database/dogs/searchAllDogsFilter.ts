/**
 * PostgREST filter text for `searchAllDogs`, the system-wide dog search.
 *
 * Every term passed in here is already escaped by `sanitizePostgRESTFilter`, so
 * commas, parentheses, dots and asterisks in it are literal text.
 */

/** Most first-name / last-name splits tried for a typed full name. */
const OWNER_NAME_MAX_SPLITS = 3;

/**
 * MYK9-2026: most words matched one by one on the server. Later words are not
 * lost: the picker applies every word to the rows that come back
 * (`matchesDogSearch`), so the server only has to return a superset.
 */
export const SEARCH_MAX_WORDS = 3;

/** Shorter words are left to the picker's own filter; one letter matches nearly every row. */
const SEARCH_MIN_WORD_LENGTH = 2;

/**
 * PostgREST `.or(...)` body matching a person by first or last name, and a
 * typed full name by every split of it into a first name (the first k words)
 * and a last name (the rest), so "Mary Jane Smith" finds first name "Mary
 * Jane". At most three splits (four words); later words stay in the last name.
 */
export function ownerNameFilter(term: string): string {
  const filters = [`first_name.ilike.%${term}%`, `last_name.ilike.%${term}%`];
  const words = term.split(/\s+/).filter(Boolean);
  const splits = Math.min(words.length - 1, OWNER_NAME_MAX_SPLITS);
  for (let k = 1; k <= splits; k += 1) {
    const first = words.slice(0, k).join(' ');
    const last = words.slice(k).join(' ');
    filters.push(`and(first_name.ilike.%${first}%,last_name.ilike.%${last}%)`);
  }
  return filters.join(',');
}

/** PostgREST `.or(...)` body matching a registration by number, registered name or breed. */
export function registrationFilter(term: string): string {
  return `registration_number.ilike.%${term}%,registered_name.ilike.%${term}%,breed.ilike.%${term}%`;
}

/**
 * The words of a multi-word search that the server matches one by one: at
 * least two characters, case-insensitively distinct, at most
 * `SEARCH_MAX_WORDS`. Empty for a one-word search, which the whole-term match
 * already covers.
 */
export function searchWords(term: string): string[] {
  const words = term.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [];
  const distinct = new Map<string, string>();
  for (const word of words) {
    if (word.length >= SEARCH_MIN_WORD_LENGTH && !distinct.has(word.toLowerCase())) {
      distinct.set(word.toLowerCase(), word);
    }
  }
  return [...distinct.values()].slice(0, SEARCH_MAX_WORDS);
}

/** Dog ids and owner ids the registration and owner lookups found for one term. */
export interface SearchTermIds {
  registrationDogIds: string[];
  ownerIds: string[];
}

/** One term against one dog: its own name columns, or an id the lookups found. */
function dogTermClauses(term: string, ids: SearchTermIds): string[] {
  const clauses = [`name.ilike.%${term}%`, `call_name.ilike.%${term}%`];
  if (ids.registrationDogIds.length > 0) {
    clauses.push(`id.in.(${ids.registrationDogIds.join(',')})`);
  }
  if (ids.ownerIds.length > 0) {
    clauses.push(`owner_id.in.(${ids.ownerIds.join(',')})`);
  }
  return clauses;
}

/**
 * PostgREST `.or(...)` body for the `dogs` query. A dog matches when the whole
 * term matches one of its fields (the pre-MYK9-2026 rule, kept so an exact
 * full name or registered name stays as precise as before), OR when every word
 * matches at least one of its fields, the rule the picker applies on the
 * device. "rex lab" therefore finds call name Rex with breed Labrador.
 */
export function dogSearchFilter(
  whole: { term: string; ids: SearchTermIds },
  words: Array<{ term: string; ids: SearchTermIds }>
): string {
  const clauses = dogTermClauses(whole.term, whole.ids);
  const [onlyWord] = words;
  if (onlyWord && words.length === 1) {
    // A single usable word (e.g. "rex l"): OR-ing its clauses is the same as AND-ing one group.
    clauses.push(...dogTermClauses(onlyWord.term, onlyWord.ids));
  } else if (words.length > 1) {
    const groups = words.map(word => `or(${dogTermClauses(word.term, word.ids).join(',')})`);
    clauses.push(`and(${groups.join(',')})`);
  }
  return clauses.join(',');
}
