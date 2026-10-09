import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { PersonPrivatePatch } from '@/services/database/users/personPrivate';

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
 * One cached person row with a person's queued column values applied, in the
 * casing the row already uses (MYK9-1071). Rows of other people, joined fields
 * and absent keys are left alone. The private patch (date of birth, junior
 * numbers) is applied ONLY to a row that already carries the person's private
 * details (`privateDetailsLoaded`, the own-profile cache RLS lets them read), so
 * it never spreads into the directory caches.
 */
export function patchPersonRow(
  row: unknown,
  personId: string,
  columns: Record<string, unknown>,
  privatePatch: PersonPrivatePatch = {}
): unknown {
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
  if ('privateDetailsLoaded' in record) {
    if (privatePatch.date_of_birth !== undefined) {
      next.dateOfBirth = privatePatch.date_of_birth ?? undefined;
    }
    if (privatePatch.junior_handler_numbers !== undefined) {
      // A merge patch, like the database's: a blank value removes that registry.
      const merged = { ...((record.juniorHandlerNumbers as Record<string, string>) ?? {}) };
      for (const [registry, value] of Object.entries(privatePatch.junior_handler_numbers)) {
        if (value.trim()) merged[registry] = value.trim();
        else delete merged[registry];
      }
      next.juniorHandlerNumbers = merged;
    }
  }
  return next;
}

/**
 * Show a queued person save in the cached people reads at once (MYK9-1071).
 * The directory and person-detail queries stay PostgREST (they join judge
 * qualifications and role labels, which are not replicated), so their refetch
 * pauses offline. This patches the edited person's rows under ['users'].
 */
export function patchCachedPersonRows(
  queryClient: QueryClient,
  personId: string,
  columns: Record<string, unknown>,
  privatePatch: PersonPrivatePatch = {}
): void {
  const patch = (row: unknown) => patchPersonRow(row, personId, columns, privatePatch);
  queryClient.setQueriesData({ queryKey: queryKeys.users.all }, (old: unknown) =>
    Array.isArray(old) ? old.map(patch) : patch(old)
  );
}
