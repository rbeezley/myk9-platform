/**
 * Derives a compact "show code" for the top ID strip — e.g.
 * `BCKC.2026.SS` from "Bexar County Kennel Club" + "Spring Scent Work
 * Trial" in 2026.
 *
 * Format: <CLUB_INITIALS>.<YEAR>.<SHOW_INITIALS>. Falls back gracefully
 * when source data is sparse (single-word club, missing date, etc).
 *
 * The code is read-only and decorative. If clubs ever want to override
 * it (e.g. their own show identifier scheme) we add a `shows.show_code`
 * column later — the derivation is intentionally cheap and overridable.
 */

const NOISE_WORDS = new Set([
  'the',
  'and',
  'of',
  'at',
  'a',
  'an',
  'for',
  'in',
  'on',
  'to',
]);

function initialsOf(text: string, maxChars: number): string {
  const tokens = text
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !NOISE_WORDS.has(t.toLowerCase()));

  if (tokens.length === 0) return '';

  if (tokens.length === 1) {
    return tokens[0].slice(0, maxChars).toUpperCase();
  }

  return tokens
    .map(t => t[0])
    .join('')
    .slice(0, maxChars)
    .toUpperCase();
}

/**
 * Format: <CLUB_INITIALS>.<YEAR>.<SHOW_INITIALS>. Club allows up to 6
 * chars (most kennel-club names have 3–5 significant words); show is
 * capped at 2 to match the design-handoff convention "BCKC.2026.SS" —
 * the show abbreviation reads as a category, not as a sentence summary.
 */
export function deriveShowCode(
  clubName: string,
  showName: string,
  startDateIso: string | null
): string {
  const club = initialsOf(clubName, 6);
  const show = initialsOf(showName, 2);
  const year = startDateIso
    ? String(new Date(startDateIso).getFullYear())
    : String(new Date().getFullYear());

  const parts = [club, year, show].filter(Boolean);
  return parts.length > 0 ? parts.join('.') : 'TRIAL';
}
