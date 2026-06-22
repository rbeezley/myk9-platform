/**
 * persistRunOrderResults — shared writer for computed run-order results across
 * the at-show entry lists (single-class `useAtShowEntryListHandlers` preset
 * path + combined `applyCombinedRunOrder`). Both compute a `RunOrderResult[]`
 * (id → 1-based run order) with the `runOrderUtils` calculators, then persist
 * each entry's `run_order`.
 *
 * `run_order` is ringside-whitelisted, so `updateEntry` auto-routes through the
 * `ringside_update_entry` SECURITY DEFINER RPC — assigned judges and stewards
 * (denied by the entries UPDATE RLS policy) can persist run order, offline-first
 * via the replication mutation queue. The manual drag path persists an
 * already-reordered `Entry[]` slice separately; this owns the computed-preset
 * write only.
 */

import { replicatedEntriesTable } from '@/services/replication';
import type { RunOrderResult } from '@/lib/runOrderUtils';

export async function persistRunOrderResults(results: RunOrderResult[]): Promise<void> {
  await Promise.all(
    results.map(r => replicatedEntriesTable.updateEntry(r.id, { runOrder: r.runOrder }))
  );
}
