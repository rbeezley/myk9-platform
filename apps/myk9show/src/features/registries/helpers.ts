/**
 * Selectors that read the show style and trial registry/timezone columns.
 * Defensive defaults: if a migration hasn't been pushed yet (or a row
 * predates it), these return safe values so the app doesn't crash.
 *
 * These are NOT React hooks — they are pure, synchronous selectors.
 */

import { getRegistry, type Registry } from './index';

/** All experience styles a show can be assigned. Mirrors PremiumStyle. */
export type ShowStyle =
  | 'monogram'
  | 'banner'
  | 'headline'
  | 'magazine'
  | 'poster'
  | 'gazette'
  | 'fieldGuide'
  | 'heritage';

/** @deprecated Use ShowStyle instead */
export type LandingStyle = 'default' | 'heritage';

interface ShowLike {
  /** Post-migration 195: shows.style */
  style?: string | null;
  /** Pre-migration 195 fallback */
  landing_style?: string | null;
}

interface TrialLike {
  registry_id?: string | null;
  timezone?: string | null;
}

const VALID_STYLES = new Set<ShowStyle>([
  'monogram',
  'banner',
  'headline',
  'magazine',
  'poster',
  'gazette',
  'fieldGuide',
  'heritage',
]);

/**
 * Read the experience style off a show row.
 * Reads `style` first (migration 195+), falls back to `landing_style`
 * (migration 192), then defaults to 'monogram'.
 */
export function getShowStyle(show: ShowLike | null | undefined): ShowStyle {
  const raw = show?.style ?? show?.landing_style;
  if (raw === 'default') return 'monogram';
  if (raw && VALID_STYLES.has(raw as ShowStyle)) return raw as ShowStyle;
  return 'monogram';
}

/**
 * @deprecated Use getShowStyle. Returns 'heritage' or 'default' for legacy callers.
 */
export function getShowLandingStyle(show: ShowLike | null | undefined): LandingStyle {
  return getShowStyle(show) === 'heritage' ? 'heritage' : 'default';
}

/**
 * Resolve the Registry config for a trial. Defaults to AKC when registry_id
 * is missing — every trial in the system today is AKC-sanctioned.
 */
export function getTrialRegistry(trial: TrialLike | null | undefined): Registry {
  const id = trial?.registry_id ?? 'AKC';
  if (id === 'AKC') return getRegistry('AKC');
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`Trial references unknown registry "${id}"`);
  }
  console.error(
    `[Heritage] Unknown registry "${id}" on trial — falling back to AKC. Check trials.registry_id.`
  );
  return getRegistry('AKC');
}

/**
 * Resolve the IANA timezone for a trial. Falls back to America/New_York,
 * matching the migration default.
 */
export function getTrialTimezone(trial: TrialLike | null | undefined): string {
  return trial?.timezone || 'America/New_York';
}
