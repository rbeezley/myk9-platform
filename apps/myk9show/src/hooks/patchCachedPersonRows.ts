import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

/** people column → the camelCase User field(s) the React Query caches hold. */
const CAMEL_FIELDS: Record<string, string[]> = {
  first_name: ['firstName'],
  last_name: ['lastName'],
  phone: ['phone'],
  street_address: ['streetAddress', 'address'],
  city: ['city'],
  state: ['state'],
  zip_code: ['zipCode'],
  country: ['country'],
  profile_image: ['profileImage'],
};

/**
 * Show a queued person save in the cached people reads at once (MYK9-1071).
 *
 * The directory and person-detail queries stay PostgREST (they join judge
 * qualifications and role labels, which are not replicated), so their refetch
 * pauses offline. This patches the edited person's rows under ['users'] in
 * whichever casing each cached row uses, leaving every other person and every
 * joined field alone; the caller's invalidation refreshes them on reconnect.
 */
export function patchCachedPersonRows(
  queryClient: QueryClient,
  personId: string,
  columns: Record<string, unknown>
): void {
  const patchRow = (row: unknown): unknown => {
    if (!row || typeof row !== 'object') return row;
    const record = row as Record<string, unknown>;
    if (record.id !== personId) return row;
    const next = { ...record };
    for (const [column, value] of Object.entries(columns)) {
      if (column in record) next[column] = value;
      for (const field of CAMEL_FIELDS[column] ?? []) {
        if (field in record) next[field] = value;
      }
    }
    if ('name' in record && ('firstName' in next || 'first_name' in next)) {
      const first = (next.firstName ?? next.first_name ?? '') as string;
      const last = (next.lastName ?? next.last_name ?? '') as string;
      next.name = `${first} ${last}`.trim();
    }
    return next;
  };

  queryClient.setQueriesData({ queryKey: queryKeys.users.all }, (old: unknown) =>
    Array.isArray(old) ? old.map(patchRow) : patchRow(old)
  );
}
