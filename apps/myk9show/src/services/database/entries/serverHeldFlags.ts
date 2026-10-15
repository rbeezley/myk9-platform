import { supabase } from '../supabaseClient';
import { readAllEntryPages, type KeysetPageQuery } from './entryPagedRead';

/**
 * MYK9-1162: the ids of the entries the server marks as awaiting a registration
 * number, in these shows.
 *
 * The replicated entry rows already carry `awaiting_registration_number`; the
 * online fallback reads `public.entries`, which cannot (the flag is computed by
 * the entry-results view), so it asks the view for the held ids alone, every
 * page of them: a read cut off at `max_rows` would pass the rest as not held.
 * It fails open: a lookup that errors, including against a database the column
 * has not reached yet, holds nothing, so a class is never emptied on a failed
 * read.
 */
export async function loadServerHeldEntryIds(showIds: readonly string[]): Promise<Set<string>> {
  if (showIds.length === 0) return new Set();
  try {
    const rows = await readAllEntryPages(
      () =>
        supabase
          .from('view_authenticated_entry_results')
          .select('id')
          .in('show_id', [...showIds])
          // `filter`, not `eq`: the generated types predate the column.
          .filter('awaiting_registration_number', 'eq', true) as unknown as KeysetPageQuery,
      'select_held_ids'
    );
    return new Set(rows.map(row => String(row.id)));
  } catch {
    // A failed page, or a network failure, is a failed lookup: it holds nothing.
    return new Set();
  }
}

/** Stamp the server's held verdict onto rows from an online `entries` read. */
export async function stampServerHeldFlags<T extends { id?: unknown; show_id?: unknown }>(
  rows: T[]
): Promise<T[]> {
  const showIds = [
    ...new Set(rows.map(row => row.show_id).filter((id): id is string => typeof id === 'string')),
  ];
  const held = await loadServerHeldEntryIds(showIds);
  if (held.size === 0) return rows;
  return rows.map(row =>
    held.has(String(row.id)) ? { ...row, awaiting_registration_number: true } : row
  );
}

/** `stampServerHeldFlags` over a `{ data, error }` read result. */
export async function withServerHeldFlags<
  R extends { data: Array<{ id?: unknown; show_id?: unknown }> | null; error: unknown },
>(read: Promise<R>): Promise<R> {
  const result = await read;
  if (!result.data || result.data.length === 0) return result;
  return { ...result, data: await stampServerHeldFlags(result.data) };
}
