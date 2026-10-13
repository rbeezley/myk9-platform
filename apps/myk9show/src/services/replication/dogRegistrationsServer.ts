/**
 * The registrations replica's PostgREST reads (MYK9-1090): rows by id or by
 * dog, and the changes pass. Always the named column list, never `*`.
 */
import { supabase } from '@/services/database/supabaseClient';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';
import {
  DOG_REGISTRATION_SELECT,
  DOG_REGISTRATIONS_PAGE_SIZE,
  type DogRegistrationRow,
} from './dogRegistrationRows';

export async function fetchRegistrationsWhere(
  column: 'id' | 'dog_id',
  values: readonly string[]
): Promise<DogRegistrationRow[]> {
  const rows: DogRegistrationRow[] = [];
  // Batched: the filter travels in the URL (MYK9-272).
  for (const batch of chunk(values, ID_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('dog_registrations')
      .select(DOG_REGISTRATION_SELECT)
      .in(column, batch);
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as DogRegistrationRow[]));
  }
  return rows;
}

/**
 * Rows changed since `since`, paged by keyset on (updated_at, id) until a
 * short page: PostgREST caps a response at max_rows.
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
    rows.push(...page);
    if (page.length < DOG_REGISTRATIONS_PAGE_SIZE) return rows;
    const last = page[page.length - 1];
    if (!last?.updated_at || !last.id) return rows;
    cursorUpdatedAt = String(last.updated_at);
    cursorId = String(last.id);
  }
}
