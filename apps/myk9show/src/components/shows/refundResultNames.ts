import type { RefundNameRow } from '@/services/database/entries/refundEntryNames';

export const ENTRY_NOT_ON_DEVICE = 'An entry not on this device';
export const NAMES_LOADING = 'Looking up names…';
export const NAMES_LOOKUP_FAILED = 'Could not look up names';

/** Who an entry is for: `key` is the dog (one dog in several classes is one identity). */
export interface RefundEntryIdentity {
  key: string;
  label: string;
  registeredName: string | null;
}

export interface RefundGroupLabel {
  key: string;
  label: string;
}

function personName(person: { first_name: string | null; last_name: string | null } | null) {
  if (!person) return null;
  const name = `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim();
  return name || null;
}

/**
 * "Exhibitor · Dog" by Entry Management's rule (`mapSecretaryEntryToEntryManagementEntry`'s
 * `ownerName` and `dogName`), so a line here names an entry the way that page does.
 */
export function refundEntryIdentity(row: RefundNameRow): RefundEntryIdentity {
  const ownerName = personName(row.dog?.owner ?? null) || row.handler || 'Unknown';
  const dogName = row.dog?.call_name || row.dog?.name || 'Unknown Dog';
  return {
    key: row.dog?.id ? `dog:${row.dog.id}` : `entry:${row.id}`,
    label: `${ownerName} · ${dogName}`,
    registeredName: row.dog?.call_name && row.dog.name ? row.dog.name : null,
  };
}

export function buildRefundEntryNames(
  ...sources: ReadonlyArray<readonly RefundNameRow[] | undefined>
): ReadonlyMap<string, RefundEntryIdentity> {
  const names = new Map<string, RefundEntryIdentity>();
  for (const rows of sources) {
    for (const row of rows ?? []) {
      if (!names.has(row.id)) names.set(row.id, refundEntryIdentity(row));
    }
  }
  return names;
}

/**
 * The labels for one skipped group or failed payment: each dog once, two different dogs that
 * would read alike told apart by registered name, then one label for the entries not named.
 */
export function refundGroupLabels(
  entryIds: readonly string[],
  names: ReadonlyMap<string, RefundEntryIdentity>,
  lookupFailed = false
): RefundGroupLabel[] {
  const identities = new Map<string, RefundEntryIdentity>();
  let unknown = 0;
  for (const entryId of entryIds) {
    const identity = names.get(entryId);
    if (identity) identities.set(identity.key, identity);
    else unknown += 1;
  }
  const labelCounts = new Map<string, number>();
  for (const identity of identities.values()) {
    labelCounts.set(identity.label, (labelCounts.get(identity.label) ?? 0) + 1);
  }
  const result: RefundGroupLabel[] = [...identities.values()].map(identity => ({
    key: identity.key,
    label:
      (labelCounts.get(identity.label) ?? 0) > 1 && identity.registeredName
        ? `${identity.label} (${identity.registeredName})`
        : identity.label,
  }));
  if (unknown > 0) {
    const label = lookupFailed
      ? unknown === 1
        ? 'An entry not named'
        : `${unknown} entries not named`
      : unknown === 1
        ? ENTRY_NOT_ON_DEVICE
        : `${unknown} entries not on this device`;
    result.push({ key: 'unknown', label });
  }
  return result;
}
