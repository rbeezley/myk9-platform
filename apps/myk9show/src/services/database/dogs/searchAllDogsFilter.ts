/**
 * PostgREST filter text for `searchAllDogs`, the system-wide dog search.
 *
 * Every term passed in here is raw text; `ilikeContains` quotes and escapes it,
 * so commas, parentheses, dots, quotes and asterisks in it are literal text.
 */

import { ilikeContains } from '@/utils/sanitizePostgRESTFilter';

/** Most first-name / last-name splits tried for a typed full name. */
const OWNER_NAME_MAX_SPLITS = 3;

/**
 * MYK9-2026: most words matched one by one on the server. Every word is sent,
 * one-letter initials included, so the server never fills its page with dogs
 * that only match the first few words ("German Shepherd Dog Rex"). Each word
 * adds two embeds to the one request, so a cap stays as a guard against a
 * pasted paragraph; no search a person types comes near it.
 */
export const SEARCH_MAX_WORDS = 8;

/**
 * PostgREST `.or(...)` body matching a person by first or last name, and a
 * typed full name by every split of it into a first name (the first k words)
 * and a last name (the rest), so "Mary Jane Smith" finds first name "Mary
 * Jane". At most three splits (four words); later words stay in the last name.
 */
export function ownerNameFilter(term: string): string {
  const filters = [
    `first_name.ilike.${ilikeContains(term)}`,
    `last_name.ilike.${ilikeContains(term)}`,
  ];
  const words = term.split(/\s+/).filter(Boolean);
  const splits = Math.min(words.length - 1, OWNER_NAME_MAX_SPLITS);
  for (let k = 1; k <= splits; k += 1) {
    const first = words.slice(0, k).join(' ');
    const last = words.slice(k).join(' ');
    filters.push(
      `and(first_name.ilike.${ilikeContains(first)},last_name.ilike.${ilikeContains(last)})`
    );
  }
  return filters.join(',');
}

/** PostgREST `.or(...)` body matching a registration by number, registered name or breed. */
export function registrationFilter(term: string): string {
  const value = ilikeContains(term);
  return `registration_number.ilike.${value},registered_name.ilike.${value},breed.ilike.${value}`;
}

/**
 * The words of a multi-word search that the server matches one by one:
 * case-insensitively distinct, at most `SEARCH_MAX_WORDS`. Empty for a one-word search, which the whole-term match
 * already covers.
 */
export function searchWords(term: string): string[] {
  const words = term.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [];
  const distinct = new Map<string, string>();
  for (const word of words) {
    if (!distinct.has(word.toLowerCase())) {
      distinct.set(word.toLowerCase(), word);
    }
  }
  return [...distinct.values()].slice(0, SEARCH_MAX_WORDS);
}

/**
 * The embeds one search term filters through: the dog's registrations and its
 * owner, each under its own alias. PostgREST cannot put an embedded table's
 * column in the parent's `.or(...)`, but it can test whether a filtered embed
 * kept any row (`alias.not.is.null`). So every term is matched inside the one
 * dogs request, before its `limit`, and a common word cannot crowd out the
 * dog that matches every word (MYK9-2026 review).
 */
export interface SearchTermEmbed {
  /** The term as typed; quoted and escaped where it is placed in a filter. */
  term: string;
  /** Alias of the registrations embed filtered by this term. */
  registrations: string;
  /** Alias of the owner embed filtered by this term. */
  owner: string;
}

/** Aliases for each term: the whole search first, then each word. */
export function searchTermEmbeds(terms: readonly string[]): SearchTermEmbed[] {
  return terms.map((term, index) => ({
    term,
    registrations: `search_${index}_registrations`,
    owner: `search_${index}_owner`,
  }));
}

/** The select text adding each term's embeds; only their ids, which nobody reads. */
export function searchEmbedSelect(embeds: readonly SearchTermEmbed[]): string {
  return embeds
    .map(e => `${e.registrations}:dog_registrations(id),${e.owner}:people!dogs_owner_id_fkey(id)`)
    .join(',');
}

/** One term against one dog: its own name columns, or a registration or owner it matched. */
function dogTermClauses(embed: SearchTermEmbed): string[] {
  return [
    `name.ilike.${ilikeContains(embed.term)}`,
    `call_name.ilike.${ilikeContains(embed.term)}`,
    `${embed.registrations}.not.is.null`,
    `${embed.owner}.not.is.null`,
  ];
}

/**
 * PostgREST `.or(...)` body for the `dogs` query. A dog matches when the whole
 * term matches one of its fields (the pre-MYK9-2026 rule, kept so an exact
 * full name or registered name stays as precise as before), OR when every word
 * matches at least one of its fields, the rule the picker applies on the
 * device. "rex lab" therefore finds call name Rex with breed Labrador.
 */
export function dogSearchFilter(whole: SearchTermEmbed, words: readonly SearchTermEmbed[]): string {
  const clauses = dogTermClauses(whole);
  const [onlyWord] = words;
  if (onlyWord && words.length === 1) {
    // A single usable word (e.g. "rex l"): OR-ing its clauses is the same as AND-ing one group.
    clauses.push(...dogTermClauses(onlyWord));
  } else if (words.length > 1) {
    const groups = words.map(word => `or(${dogTermClauses(word).join(',')})`);
    clauses.push(`and(${groups.join(',')})`);
  }
  return clauses.join(',');
}

/** Drops the search embeds from a returned row, so callers see the usual dog shape. */
export function withoutSearchEmbeds(
  row: Record<string, unknown>,
  embeds: readonly SearchTermEmbed[]
): Record<string, unknown> {
  const rest = { ...row };
  for (const e of embeds) {
    delete rest[e.registrations];
    delete rest[e.owner];
  }
  return rest;
}
