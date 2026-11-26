/**
 * The registrations replica's PostgREST reads (MYK9-1090): rows by id or by
 * dog, and the changes pass. Always the named column list, never `*`.
 */
import { abortReason } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';
import {
  DOG_REGISTRATION_SELECT,
  DOG_REGISTRATIONS_PAGE_SIZE,
  type DogRegistrationRow,
} from './dogRegistrationRows';

export async function fetchRegistrationsWhere(
  column: 'id' | 'dog_id',
  values: readonly string[],
  signal?: AbortSignal
): Promise<DogRegistrationRow[]> {
  const rows: DogRegistrationRow[] = [];
  // Batched: the filter travels in the URL (MYK9-272).
  for (const batch of chunk(values, ID_CHUNK_SIZE)) {
    if (signal?.aborted) throw abortReason(signal);
    let query = supabase.from('dog_registrations').select(DOG_REGISTRATION_SELECT);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query.in(column, batch);
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as DogRegistrationRow[]));
  }
  return rows;
}

/**
 * Rows changed since `since`, paged by keyset on (updated_at, id) until a
 * empty page: PostgREST caps a response at max_rows, and a hosted cap below the
 * page size returns short pages with more rows behind them (MYK9-2252).
 */
export async function fetchChangedRegistrations(since: number): Promise<DogRegistrationRow[]> {
  const rows: DogRegistrationRow[] = [];
  let cursorUpdatedAt: string | null = null;
  let cursorId: string | null = null;
  for (;;) {
    let query = supabase.from('dog_registrations').select(DOG_REGISTRATION_SELECT);
    query =
      cursorUpdatedAt && cursorId
        ? query.or(
            `updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${cursorId})`
          )
        : query.gt('updated_at', new Date(since).toISOString());
    const { data, error } = await query
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(0, DOG_REGISTRATIONS_PAGE_SIZE - 1);
    if (error) throw new Error(`Supabase query failed: ${error.message}`);

    const page = (data ?? []) as unknown as DogRegistrationRow[];
    // Only an empty page ends the read (MYK9-2252): a lower hosted max_rows
    // returns short pages with more rows behind them. A page ending on the row the
    // cursor already sits on means the server ignored the cursor: stop.
    const last = page[page.length - 1];
    if (!last?.updated_at || !last.id) return rows;
    if (String(last.updated_at) === cursorUpdatedAt && String(last.id) === cursorId) return rows;
    rows.push(...page);
    cursorUpdatedAt = String(last.updated_at);
    cursorId = String(last.id);
  }
}
