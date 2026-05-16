// Per-style derivation helpers used by the dispatcher in index.ts.
//
// Field Guide / Gazette / Magazine / Poster each carry one or two
// style-specific fields (showCode, editionLabel, showAbbreviation, …)
// that aren't in the shared emailData shape. These helpers derive them
// from the inputs the dispatcher already has in scope.
//
// These mirror the corresponding helpers on the app side
// (apps/myk9show/src/features/<style>/.../*) but Deno can't import from
// workspace packages, so the heuristics are duplicated. Keep them in
// loose visual parity — exact-match is not required since both sides
// derive from the same DB inputs.

const NOISE_WORDS = new Set([
  'the', 'and', 'of', 'at', 'a', 'an', 'for', 'in', 'on', 'to',
]);

/** Word-initials extractor used by deriveShowCode + deriveShowAbbreviation. */
export function initialsOf(text: string, maxChars: number): string {
  const tokens = text
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(t => !NOISE_WORDS.has(t.toLowerCase()));
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0].slice(0, maxChars).toUpperCase();
  return tokens.map(t => t[0]).join('').slice(0, maxChars).toUpperCase();
}

/** Compact ID for Field Guide top strip, e.g. "BCKC.2026.SS". Mirrors
 *  apps/myk9show/src/features/fieldGuide/landing/utils/showCode.ts. */
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

/** Short show abbreviation for Poster's mono strip, e.g. "SS'26". */
export function deriveShowAbbreviation(
  showName: string,
  startDateIso: string | null
): string | null {
  const initials = initialsOf(showName, 2);
  if (!initials) return null;
  const year = startDateIso ? new Date(startDateIso).getFullYear() : new Date().getFullYear();
  return `${initials}'${String(year).slice(-2)}`;
}

/** Magazine kicker, e.g. "Spring 2026". Derives a season from the start
 *  month and pairs it with the year.
 *
 *  Design intent calls for a fuller "Vol N · Spring 2026" — we deliberately
 *  ship the shorter form here because `clubEstablished` (the source for
 *  Vol N = currentYear - establishedYear) isn't sourced into emailData
 *  yet. Promote to the long form once `shows.organization_established`
 *  (or a clubs-table join) lands. */
export function deriveMagazineEditionLabel(startDateIso: string | null): string {
  const date = startDateIso ? new Date(startDateIso) : new Date();
  const month = date.getMonth(); // 0-11
  const season =
    month <= 1 || month === 11 ? 'Winter' :
    month <= 4 ? 'Spring' :
    month <= 7 ? 'Summer' : 'Autumn';
  return `${season} ${date.getFullYear()}`;
}

/** Gazette edition strip, e.g. "VOL LXXIX · NO 47". Optional — return
 *  null to suppress (per the Gazette README §Open Questions Q5, Outlook
 *  renders the strip poorly). Null until we ship a real edition source. */
export function deriveGazetteEditionLabel(): string | null {
  return null;
}
