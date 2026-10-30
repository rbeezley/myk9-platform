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
 *
 * Only results whose run order differs from the one the entry held before
 * (`previous`, the list as the steward saw it) are written, so a preset that
 * moves three dogs queues three rows, not the whole class. An entry absent from
 * `previous` is always written. `persistEntryRunOrder` (drag) delegates here, so
 * every run-order write shares this one diffing path.
 */

import { replicatedEntriesTable } from '@/services/replication';
import type { Entry } from '@myk9/ringside';
import { storedRunOrder, type RunOrderResult } from '@/lib/runOrderUtils';

export async function persistRunOrderResults(
  results: RunOrderResult[],
  previous: Entry[] = []
): Promise<void> {
  const previousOrder = new Map(previous.map(entry => [entry.id, storedRunOrder(entry)]));
  await Promise.all(
    results
      .filter(r => previousOrder.get(r.id) !== r.runOrder)
      .map(r => replicatedEntriesTable.updateEntry(r.id, { runOrder: r.runOrder }))
  );
}
