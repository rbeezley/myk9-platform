/**
 * MYK9-883: order breed-picker results so typing a breed's first letter lands
 * on breeds beginning with that letter, instead of scattering them among every
 * breed that merely contains it (e.g. "Beagle" for "g").
 *
 * - No query: the list unchanged.
 * - One character: breeds starting with it (a single letter is a jump to that
 *   section of the alphabet, not a substring search).
 * - Longer: every substring match, ranked prefix, then word-start, then
 *   anywhere; alphabetical order is preserved within each rank.
 */
export function rankBreedMatches(breeds: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...breeds];

  if (q.length === 1) {
    return breeds.filter(breed => breed.toLowerCase().startsWith(q));
  }

  const rank = (breed: string): number => {
    const name = breed.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (name.includes(` ${q}`)) return 1;
    return name.includes(q) ? 2 : 3;
  };

  return breeds
    .map((breed, index) => ({ breed, index, rank: rank(breed) }))
    .filter(entry => entry.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.breed);
}
