/**
 * The dogs replica's changes read (MYK9-1321): every dog changed since a
 * watermark, optionally narrowed to one owner.
 */
import { supabase } from '@/services/database/supabaseClient';
import type { Database } from '@/types/supabase';
import { POSTGREST_MAX_ROWS } from './postgrestMaxRows';

type DogRow = Database['public']['Tables']['dogs']['Row'];

/**
 * Paged by keyset on (updated_at, id) until a short page, because PostgREST
 * caps a response at max_rows and a staff account reads every dog. The owner
 * scope rides on every page. A dog edited while the loop ran shows up again on
 * a later page, so only its newest copy is returned.
 */
export async function fetchChangedDogs(since: number, ownerId?: string): Promise<DogRow[]> {
  const rows: DogRow[] = [];
  let cursorUpdatedAt: string | null = null;
  let cursorId: string | null = null;
  for (;;) {
    let query = supabase.from('dogs').select('*');
    query =
      cursorUpdatedAt && cursorId
        ? query.or(
            `updated_at.gt.${cursorUpdatedAt},and(updated_at.eq.${cursorUpdatedAt},id.gt.${cursorId})`
          )
        : query.gt('updated_at', new Date(since).toISOString());
    if (ownerId) query = query.eq('owner_id', ownerId);
    const { data, error } = await query
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .range(0, POSTGREST_MAX_ROWS - 1);
    if (error) throw new Error(`Supabase query failed: ${error.message}`);

    const page = data ?? [];
    rows.push(...page);
    const last = page[page.length - 1];
    if (page.length < POSTGREST_MAX_ROWS || !last?.updated_at || !last.id) break;
    cursorUpdatedAt = String(last.updated_at);
    cursorId = String(last.id);
  }

  const newest = new Map<string, DogRow>();
  for (const row of rows) newest.set(String(row.id), row);
  return [...newest.values()];
}
