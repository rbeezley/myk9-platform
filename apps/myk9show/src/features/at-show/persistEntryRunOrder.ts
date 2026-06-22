/**
 * persistEntryRunOrder — shared run-order persistence for the at-show entry
 * lists (single-class AtShowEntryListPage + combined Section A/B
 * AtShowCombinedEntryListPage). Both lists drive the same ringside
 * `useDragAndDropEntries` hook, which hands back the reordered slice with each
 * entry's optimistic `exhibitorOrder` (1-based index) already set.
 *
 * `run_order` is ringside-whitelisted, so `updateEntry` auto-routes through the
 * `ringside_update_entry` SECURITY DEFINER RPC — assigned judges and stewards
 * (denied by the entries UPDATE RLS policy) can persist run order, offline-first
 * via the replication mutation queue. The drag hook owns the optimistic local
 * reorder + grace period; this only queues the writes.
 *
 * The hook leaves entries outside the dragged view untouched, so each write
 * targets a single entry id and never disturbs the other section's order.
 */

import { replicatedEntriesTable } from '@/services/replication';
import type { Entry } from '@myk9/ringside';

export async function persistEntryRunOrder(reordered: Entry[]): Promise<void> {
  await Promise.all(
    reordered.map((entry, index) =>
      replicatedEntriesTable.updateEntry(entry.id, {
        runOrder: entry.exhibitorOrder ?? index + 1,
      })
    )
  );
}
