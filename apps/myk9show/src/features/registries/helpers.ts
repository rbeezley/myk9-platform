/**
 * Selectors that read the new Heritage / registry columns off show + trial
 * rows. Defensive defaults: if migration 192 hasn't been pushed yet (or a row
 * predates it), these return safe values so the app doesn't crash.
 *
 * These are NOT React hooks — they are pure, synchronous selectors. Naming
 * stays as `getX` to make that explicit. Plan §4.4 originally called them
 * `useX`; that was a misnomer (no React state involvement).
 */

import { getRegistry, type Registry } from './index';

export type LandingStyle = 'default' | 'heritage';

interface ShowLike {
  landing_style?: string | null;
}

interface TrialLike {
  registry_id?: string | null;
  timezone?: string | null;
}

/**
 * Read the landing style off a show row. Falls back to 'default' when the
 * column is absent or null. Unknown values also fall back — a future renderer
 * may add 'magazine' / etc.; this helper never throws on display surfaces.
 */
export function getShowLandingStyle(show: ShowLike | null | undefined): LandingStyle {
  const raw = show?.landing_style;
  if (raw === 'heritage') return 'heritage';
  return 'default';
}

/**
 * Resolve the Registry config for a trial. Defaults to AKC when registry_id
 * is missing — every trial in the system today is AKC-sanctioned.
 */
export function getTrialRegistry(trial: TrialLike | null | undefined): Registry {
  const id = trial?.registry_id ?? 'AKC';
  if (id === 'AKC') return getRegistry('AKC');
  // Unknown registry id: fail loud during dev so we notice, but don't crash
  // anonymous public visitors. Fall back to AKC for production safety.
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`Trial references unknown registry "${id}"`);
  }
  return getRegistry('AKC');
}

/**
 * Resolve the IANA timezone for a trial. Falls back to America/New_York,
 * matching the migration default.
 */
export function getTrialTimezone(trial: TrialLike | null | undefined): string {
  return trial?.timezone || 'America/New_York';
}
