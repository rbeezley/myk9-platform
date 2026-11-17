import { supabase } from '../supabaseClient';
import { replicatedArmbandsTable } from '@/services/replication/ReplicatedArmbandsTable';

/**
 * Fetch armband numbers from the authoritative `armbands` table for entries
 * that are missing them. Returns a Map of `show_id:dog_id` → armband_number.
 *
 * The `entries.armband` column is a denormalized copy that may lag behind
 * if the replication UPDATE mutation hasn't synced yet. The `armbands` table
 * is the authoritative source (written atomically by the assign_armband RPC).
 *
 * Reads from replicatedArmbandsTable first, falls back to PostgREST.
 */
export async function fetchMissingArmbands(
  entries: ReadonlyArray<{ armband: string | null; show_id: string | null; dog_id: string | null }>
): Promise<Map<string, string>> {
  const missing = entries.filter(e => !e.armband && e.show_id && e.dog_id);
  if (missing.length === 0) return new Map();

  const showIds = [...new Set(missing.map(e => e.show_id!))];
  const dogIds = new Set(missing.map(e => e.dog_id!));

  try {
    // Read from replication store
    const armbandsByShow = await Promise.all(
      showIds.map(sid => replicatedArmbandsTable.getByShow(sid))
    );
    const allArmbands = armbandsByShow.flat();

    // Filter to only the dog IDs we need
    const relevant = allArmbands.filter(a => a.dogId && dogIds.has(a.dogId));
    if (relevant.length === 0) return new Map();

    return new Map(relevant.map(a => [`${a.showId}:${a.dogId}`, a.armbandNumber]));
  } catch {
    // Fallback to PostgREST
    const { data: armbandRows } = await supabase
      .from('armbands')
      .select('show_id, dog_id, armband_number')
      .in('show_id', showIds)
      .in('dog_id', [...dogIds]);

    if (!armbandRows || armbandRows.length === 0) return new Map();

    return new Map(armbandRows.map(a => [`${a.show_id}:${a.dog_id}`, String(a.armband_number)]));
  }
}

/**
 * Fills a blank `armband` from the armbands table, offline from the replicated copy. The one
 * backfill both the class read and the show read call, so every printed sheet agrees on an armband
 * whose `entries.armband` copy has not synced yet (MYK9-2103).
 */
export async function backfillMissingArmbands<
  T extends { armband?: unknown; show_id?: unknown; dog_id?: unknown },
>(rows: readonly T[]): Promise<T[]> {
  const armbandMap = await fetchMissingArmbands(
    rows.map(row => ({
      armband: (row.armband as string | null) ?? null,
      show_id: (row.show_id as string | null) ?? null,
      dog_id: (row.dog_id as string | null) ?? null,
    }))
  );
  return rows.map(row => {
    if (!row.armband && row.show_id && row.dog_id) {
      const armband = armbandMap.get(`${row.show_id}:${row.dog_id}`);
      if (armband) return { ...row, armband };
    }
    return row;
  });
}
