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
 * Writes are scoped to the entries in the dragged view; the hook leaves
 * everything outside it untouched. For the single-class list that is one class.
 * For the combined list it is the MERGED A/B queue — which shares one ring run
 * order by design, so a combined drag renumbers across both sections (Section A
 * run_order values do change). That is the intended behavior, not a leak.
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
