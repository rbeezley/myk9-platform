import type { Entry } from '@myk9/ringside';
import { persistEntryRunOrder } from './persistEntryRunOrder';

/**
 * The drag hook's `updateExhibitorOrder` for the Ringside entry lists (MYK9-1734).
 *
 * After a drop the drag hook holds a 1.5s guard during which the entry query ignores replica
 * change notifications, including the one from this save. When the guard ends, the page copies
 * the query's entries back over its optimistic list. Without a re-read here that copy is the
 * pre-drop order, so the card flipped back on the owner's Android phone and forward again on the
 * next sync. The save writes the local replica first, so re-reading it (no network) before the
 * guard ends hands the page the new order. A failed save throws before the re-read, so the drag
 * hook's error path still runs.
 */
export function createRunOrderUpdater(
  reread: () => Promise<unknown>,
  persist: (reordered: Entry[], previous: Entry[]) => Promise<void> = persistEntryRunOrder
) {
  return async (reordered: Entry[], previous: Entry[]): Promise<void> => {
    await persist(reordered, previous);
    await reread();
  };
}
