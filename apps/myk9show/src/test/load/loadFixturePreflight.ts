import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LOAD_GENERATED_ENTRY_COUNT, LOAD_SHOW_ENTRY_COUNT, LOAD_SHOW_ID } from './loadFixture';

/**
 * Shard fixture preflight (MYK9-1271).
 *
 * Every shard refuses to run unless the primary show holds exactly the
 * canonical entry count. The contract stays strict. What changed is the failure
 * message: the 2026-10-20 smoke (run 39453954812) found 518 where the reseed had
 * verified 517 three minutes earlier, and the closing restore deleted the extra
 * row before anyone could ask what wrote it. A mismatch now lists the
 * non-fixture rows (the hand-authored golden-path entries plus any stray),
 * newest first, so the next stray names its writer in the run log.
 */

/** Generated load entries occupy one contiguous id range (see loadFixture.ts). */
export const LOAD_FIXTURE_ENTRY_ID_MIN = 'a1090000-0000-0000-0002-000000000000';
export const LOAD_FIXTURE_ENTRY_ID_END = 'a1090000-0000-0000-0003-000000000000';

/** Enough to show every hand-authored entry plus a handful of strays. */
export const NON_FIXTURE_ROW_LIMIT = 25;

export interface NonFixtureEntryRow {
  readonly id: string;
  readonly created_at: string | null;
  readonly entry_status: string | null;
  readonly entry_source: string | null;
  readonly class_id: string | null;
  readonly dog_id: string | null;
}

export interface FixtureCounts {
  readonly total: number;
  readonly generated: number;
}

export function fixtureMismatchMessage(
  counts: FixtureCounts,
  nonFixture: readonly NonFixtureEntryRow[] | string
): string {
  const expectedHand = LOAD_SHOW_ENTRY_COUNT - LOAD_GENERATED_ENTRY_COUNT;
  const lines = [
    `Load fixture requires exactly ${LOAD_SHOW_ENTRY_COUNT} demo-show entries; found ${counts.total}.`,
    `Generated fixture entries: ${counts.generated} (expected ${LOAD_GENERATED_ENTRY_COUNT}).`,
    `Non-fixture entries: ${counts.total - counts.generated} (expected ${expectedHand} hand-authored).`,
  ];
  if (typeof nonFixture === 'string') {
    lines.push(`Could not list non-fixture entries: ${nonFixture}`);
  } else {
    lines.push(`Non-fixture entries, newest first (up to ${NON_FIXTURE_ROW_LIMIT}):`);
    for (const row of nonFixture) {
      lines.push(
        `  ${row.id} created_at=${row.created_at ?? 'null'} status=${row.entry_status ?? 'null'} ` +
          `source=${row.entry_source ?? 'null'} class=${row.class_id ?? 'null'} dog=${row.dog_id ?? 'null'}`
      );
    }
  }
  return lines.join('\n');
}

async function countEntries(client: SupabaseClient, generatedOnly: boolean): Promise<number> {
  let query = client
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('show_id', LOAD_SHOW_ID);
  if (generatedOnly) {
    query = query.gte('id', LOAD_FIXTURE_ENTRY_ID_MIN).lt('id', LOAD_FIXTURE_ENTRY_ID_END);
  }
  const { count, error } = await query;
  if (error) throw new Error(`Could not preflight the load fixture: ${error.message}`);
  return count ?? 0;
}

export async function assertCanonicalFixtureWith(client: SupabaseClient): Promise<void> {
  const total = await countEntries(client, false);
  if (total === LOAD_SHOW_ENTRY_COUNT) return;

  const generated = await countEntries(client, true);
  const { data, error } = await client
    .from('entries')
    .select('id, created_at, entry_status, entry_source, class_id, dog_id')
    .eq('show_id', LOAD_SHOW_ID)
    .or(`id.lt.${LOAD_FIXTURE_ENTRY_ID_MIN},id.gte.${LOAD_FIXTURE_ENTRY_ID_END}`)
    .order('created_at', { ascending: false, nullsFirst: true })
    .limit(NON_FIXTURE_ROW_LIMIT);
  throw new Error(
    fixtureMismatchMessage(
      { total, generated },
      error ? error.message : ((data ?? []) as NonFixtureEntryRow[])
    )
  );
}

export async function assertCanonicalFixture(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase fixture-preflight credentials.');
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  await assertCanonicalFixtureWith(client);
}
