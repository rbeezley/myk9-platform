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
 * Only entries whose run order differs from the one they held before the drop
 * are written (`previous` is the hook's pre-drop snapshot): moving the 3rd card
 * to the top writes 3 rows, not the whole class, so one drag is not N RPCs plus
 * N realtime fan-outs. An entry absent from `previous` is always written.
 *
 * Writes are scoped to the entries in the dragged view; the hook leaves
 * everything outside it untouched. For the single-class list that is one class.
 * For the combined list it is the MERGED A/B queue — which shares one ring run
 * order by design, so a combined drag renumbers across both sections (Section A
 * run_order values do change). That is the intended behavior, not a leak.
 */

import type { Entry } from '@myk9/ringside';
import { persistRunOrderResults } from './persistRunOrderResults';

export async function persistEntryRunOrder(
  reordered: Entry[],
  previous: Entry[] = []
): Promise<void> {
  await persistRunOrderResults(
    reordered.map((entry, index) => ({
      id: entry.id,
      runOrder: entry.exhibitorOrder ?? index + 1,
    })),
    previous
  );
}
