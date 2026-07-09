/**
 * Selectors that read the show style and trial registry/timezone columns.
 * Defensive defaults: if a migration hasn't been pushed yet (or a row
 * predates it), these return safe values so the app doesn't crash.
 *
 * These are NOT React hooks — they are pure, synchronous selectors.
 */

import * as Sentry from '@sentry/react';
import { getRegistry, listRegistries } from './lookup';
import type { Registry, RegistryId } from './types';

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
  /** Present on the mapped domain `Trial` / raw row; used only for Sentry context. */
  id?: string | null | undefined;
  /** Snake-case as it comes off a raw PostgREST row / email TrialInput. */
  registry_id?: string | null;
  /** Camel-case as it rides on the mapped domain `Trial` (trial.types.ts) or a
   *  ReplicatedTrial (which models the optional field as `string | undefined`). */
  registryId?: string | null | undefined;
  timezone?: string | null | undefined;
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
  // Accept either shape — snake_case off a raw row, camelCase off the mapped domain Trial.
  // Trim + default so blank/whitespace registry_id falls back to AKC rather than
  // tripping the unknown-registry path.
  const id = (trial?.registry_id ?? trial?.registryId)?.trim() || 'AKC';
  if ((listRegistries() as readonly string[]).includes(id)) {
    return getRegistry(id as RegistryId);
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`Trial references unknown registry "${id}"`);
  }
  console.error(
    `[Heritage] Unknown registry "${id}" on trial — falling back to AKC. Check trials.registry_id.`
  );
  return getRegistry('AKC');
}

/**
 * Derive a trial's `registry_id` from the show's `organization`.
 *
 * `organization` and `registry_id` are the same axis (the sanctioning body):
 * organization is the user-entered source of truth (broad list, show level);
 * registry_id is the validated, config-backed projection stored on the trial
 * (offline-first denormalization — see plan-registry-write-path.md). When the
 * organization names a configured registry (AKC/UKC/ASCA) we use it; otherwise
 * we fall back to AKC (the column's NOT-NULL default — harmless for sports that
 * never read the registry, e.g. an org with no rulebook config).
 *
 * This is the single source of the org→registry rule; every trial create/update
 * path runs the show's organization through it.
 */
export function deriveRegistryId(organization: string | null | undefined): RegistryId {
  const org = organization?.trim();
  if (org && (listRegistries() as readonly string[]).includes(org)) {
    return org as RegistryId;
  }
  return 'AKC';
}

/** Module-level, per-session: an invalid timezone value reports to Sentry once, not per render. */
const reportedInvalidTimezones = new Set<string>();

/** Cheap standards-based probe — throws for any string that isn't a resolvable IANA zone. */
function isValidIanaTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function reportInvalidTrialTimezone(rejected: string, trialId: string | null | undefined): void {
  if (reportedInvalidTimezones.has(rejected)) return;
  reportedInvalidTimezones.add(rejected);
  Sentry.captureMessage(`Invalid trial timezone "${rejected}" — falling back to America/New_York`, {
    level: 'warning',
    extra: { trialId: trialId ?? null, rejectedTimezone: rejected },
  });
}

/**
 * Resolve the IANA timezone for a trial. Falls back to America/New_York
 * (matching the migration default) when the value is missing, empty, or not
 * a resolvable IANA zone — callers must never receive a string that makes
 * `Intl`/`toLocaleDateString` throw. An invalid (non-empty) value is reported
 * to Sentry once per session so bad data can be repaired.
 */
export function getTrialTimezone(trial: TrialLike | null | undefined): string {
  const raw = trial?.timezone;
  if (!raw) return 'America/New_York';
  if (isValidIanaTimeZone(raw)) return raw;
  reportInvalidTrialTimezone(raw, trial?.id);
  return 'America/New_York';
}
