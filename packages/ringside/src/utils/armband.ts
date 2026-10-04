/**
 * Armband helpers. An entry with no armband carries `null`; it is never turned
 * into the number 0 (a "0" badge reads as a real competitor number).
 */

/** What to show where an armband belongs and the entry has none. */
export const NO_ARMBAND_LABEL = '—';

/** Display text for an armband: the number, or "—" when there is none. */
export function formatArmband(armband: number | string | null | undefined): string {
  return armband == null || armband === '' ? NO_ARMBAND_LABEL : String(armband);
}
