/**
 * How a raw `trials.registry_id` and `trials.timezone` read (MYK9-2077).
 *
 * Deno-safe on purpose: no imports, no DOM, no app code. The app's `getTrialRegistry` and
 * `getTrialTimezone` (`@/features/registries`) and the registry deadline reminder both call these,
 * so the Finish the show list and the email cannot read the same trial two ways.
 */

export const FALLBACK_TRIAL_TIME_ZONE = 'America/New_York';

/** `known` is `false` for a registry id nothing is configured for; `id` is then the raw value. */
export interface SelectedRegistryId {
  id: string;
  known: boolean;
}

/**
 * A blank or whitespace registry reads as AKC; anything else is checked against the configured
 * ids. The caller decides what an unknown id means (the app throws in development).
 */
export function selectTrialRegistryId(
  raw: string | null | undefined,
  configured: readonly string[]
): SelectedRegistryId {
  const id = raw?.trim() || 'AKC';
  return { id, known: configured.includes(id) };
}

/** Cheap standards-based probe: throws for any string that is not a resolvable IANA zone. */
export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone a trial's days are counted in. A missing, empty or invalid value reads as New York,
 * and a padded value is invalid (never trimmed), so a stored " America/Chicago" is New York in
 * every consumer. `rejected` carries the raw value when one was present and refused, for reporting.
 */
export function selectTrialTimeZone(raw: string | null | undefined): {
  timeZone: string;
  rejected: string | null;
} {
  if (!raw) return { timeZone: FALLBACK_TRIAL_TIME_ZONE, rejected: null };
  if (isValidIanaTimeZone(raw)) return { timeZone: raw, rejected: null };
  return { timeZone: FALLBACK_TRIAL_TIME_ZONE, rejected: raw };
}
