/**
 * MYK9-883: order breed-picker results so typing a breed's first letter lands
 * on breeds beginning with that letter, instead of scattering them among every
 * breed that merely contains it (e.g. "Beagle" for "g").
 *
 * Ranks: 0 = name starts with the query, 1 = a later word starts with it
 * (space, hyphen or "(" are word boundaries), 2 = anywhere else. Alphabetical
 * order is preserved within a rank. A single character never matches rank 2,
 * so a letter jumps to that section without mid-word noise. Diacritics are
 * ignored on both sides ("low" finds "Löwchen").
 */
const normalize = (value: string): string =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const WORD_BOUNDARIES = [' ', '-', '('];

export function rankBreedMatches(breeds: readonly string[], query: string): string[] {
  const q = normalize(query.trim());
  if (!q) return [...breeds];

  const rank = (breed: string): number => {
    const name = normalize(breed);
    if (name.startsWith(q)) return 0;
    if (WORD_BOUNDARIES.some(boundary => name.includes(boundary + q))) return 1;
    return name.includes(q) ? 2 : 3;
  };

  const maxRank = q.length === 1 ? 1 : 2;
  return breeds
    .map((breed, index) => ({ breed, index, rank: rank(breed) }))
    .filter(entry => entry.rank <= maxRank)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.breed);
}
