export interface TrialTimezoneOption {
  value: string;
  label: string;
}

/**
 * The zones a US dog show actually runs in — not the ~400-entry
 * `Intl.supportedValuesOf('timeZone')` list, which is unnavigable in a
 * dropdown and mostly irrelevant to this audience. Picked by the show
 * wizard's show step (MYK9-831); there is no location-to-timezone lookup in
 * this codebase to derive one from the venue address/pin instead.
 */
export const TRIAL_TIMEZONE_OPTIONS: readonly TrialTimezoneOption[] = [
  { value: 'America/New_York', label: 'Eastern (ET)' },
  { value: 'America/Chicago', label: 'Central (CT)' },
  { value: 'America/Denver', label: 'Mountain (MT)' },
  { value: 'America/Phoenix', label: 'Mountain, no DST (AZ)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'America/Anchorage', label: 'Alaska (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (HST)' },
];

/**
 * The options to render, including the current/default zone even when it
 * falls outside the curated list above (a browser reporting a regional alias
 * such as `America/Indiana/Indianapolis`) — so the picker's value is never
 * silently blank.
 */
export function buildTrialTimezoneOptions(currentZone: string): TrialTimezoneOption[] {
  if (TRIAL_TIMEZONE_OPTIONS.some(option => option.value === currentZone)) {
    return [...TRIAL_TIMEZONE_OPTIONS];
  }
  return [{ value: currentZone, label: currentZone }, ...TRIAL_TIMEZONE_OPTIONS];
}
