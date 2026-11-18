import type { SecretaryEntry } from '@/services/database/entries';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';

export const ENTRY_NOT_ON_DEVICE = 'An entry not on this device';
export const NAMES_LOADING = 'Looking up names…';

/** Entry id to "Exhibitor · Dog", using Entry Management's own mapper so both pages agree. */
export function buildRefundEntryNames(
  entries: readonly SecretaryEntry[] | undefined
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const entry of entries ?? []) {
    const mapped = mapSecretaryEntryToEntryManagementEntry(entry);
    names.set(entry.id, `${mapped.ownerName} · ${mapped.dogName}`);
  }
  return names;
}

/**
 * The labels for one skipped group or failed payment: each "Exhibitor · Dog" once (a dog in
 * several classes is one line), then one plain label per entry this device has not loaded.
 */
export function refundGroupLabels(
  entryIds: readonly string[],
  names: ReadonlyMap<string, string>,
  namesLoading: boolean
): string[] {
  if (namesLoading) return [NAMES_LOADING];
  const labels = new Set<string>();
  let unknown = 0;
  for (const entryId of entryIds) {
    const name = names.get(entryId);
    if (name) labels.add(name);
    else unknown += 1;
  }
  const result = [...labels];
  if (unknown === 1) result.push(ENTRY_NOT_ON_DEVICE);
  else if (unknown > 1) result.push(`${unknown} entries not on this device`);
  return result;
}
