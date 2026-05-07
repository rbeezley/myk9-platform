import type { CoverContext } from './coverContext';

/** Single middot character used as the Gazette's inline separator. */
export const MIDDOT = '·';

/** Maximum number of judges shown in the bottom strip before overflow. */
export const JUDGES_STRIP_MAX = 4;

/**
 * Pull a "City, ST" fragment from a free-form venue address.
 *
 * Heuristic: addresses we see take the shape "<street>, <city>, <state> <zip>".
 * Strip the ZIP from the last segment and pair with the prior segment.
 */
export function extractCityState(venue: string): string {
  if (!venue) return '';
  const parts = venue
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? '';
    const stateOnly = last.replace(/\d{4,}/g, '').trim();
    const city = parts[parts.length - 2] ?? '';
    return [city, stateOnly].filter(Boolean).join(', ');
  }
  return parts[0] ?? '';
}

/**
 * Compose a fallback feature-article paragraph when the chair's welcome
 * narrative is missing or too short to fill the masthead column.
 */
export function composeFallbackArticle(
  club: string,
  showName: string,
  venue: string,
  dateRange: string
): string {
  const who = club || 'The host club';
  const what = showName ? `the ${showName}` : 'an upcoming scent work trial';
  const where = venue ? ` at ${venue}` : '';
  return `${who} is pleased to announce ${what}${where}, running ${dateRange}. Exhibitors will find the schedule, judges, and entry details on the inside pages.`;
}

/**
 * Flatten judges across all trials, dedup by name, and emit up to
 * `JUDGES_STRIP_MAX` "Name · Element" entries. When more judges exist than fit,
 * the final entry becomes the meta-marker '…and others' (no leading middot —
 * the row separator already inserts spacing between entries, so a leading
 * middot here would render as a stray dot).
 */
export function buildJudgeStrip(trials: CoverContext['data']['trials']): string[] {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const trial of trials) {
    for (const j of trial.judges) {
      if (!j.name || seen.has(j.name)) continue;
      seen.add(j.name);
      const elements = j.elements.length > 0 ? ` ${MIDDOT} ${j.elements[0]}` : '';
      entries.push(`${j.name}${elements}`);
    }
  }
  if (entries.length <= JUDGES_STRIP_MAX) return entries;
  return [...entries.slice(0, JUDGES_STRIP_MAX - 1), '…and others'];
}
