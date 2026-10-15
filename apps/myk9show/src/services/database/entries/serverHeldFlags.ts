import { supabase } from '../supabaseClient';

/**
 * MYK9-1162: the ids of the entries the server marks as awaiting a registration
 * number, in these shows.
 *
 * The replicated entry rows already carry `awaiting_registration_number`; the
 * online fallback reads `public.entries`, which cannot (the flag is computed by
 * the entry-results view), so it asks the view for the held ids alone. The
 * answer is small (only held entries) and fails open: a lookup that errors,
 * including against a database the column has not reached yet, holds nothing,
 * so a class is never emptied on a failed read.
 */
async function loadServerHeldEntryIds(showIds: readonly string[]): Promise<Set<string>> {
  if (showIds.length === 0) return new Set();
  try {
    const { data, error } = await supabase
      .from('view_authenticated_entry_results')
      .select('id')
      .in('show_id', [...showIds])
      // `filter`, not `eq`: the generated types predate the column.
      .filter('awaiting_registration_number', 'eq', true);
    if (error) return new Set();
    return new Set((data ?? []).map(row => String((row as { id: unknown }).id)));
  } catch {
    // A network failure is a failed lookup too: it holds nothing.
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
