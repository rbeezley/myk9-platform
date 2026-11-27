import { getEntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';
import { EntryStatus } from '@/types/show-registration-types';

/**
 * True while an entry is not yet accepted: the schedule card's "pending", which
 * the Entries review lane also uses. `kind === 'pending'`, plus the owner's
 * override that `paid` and `promotion-expired` stay pending (MYK9-976 uses this
 * to keep Move up hidden until acceptance).
 *
 * A missing (SQL NULL) status is NOT pending: it classifies as unknown here, and the
 * server's `entry_queue_places_for_classes` leaves it runnable too (MYK9-2391).
 *
 * Lives in `_shared` so the run-queue rule can use it without importing a feature folder.
 * `classEntryBreakdown` re-exports it.
 */
export function isPendingEntryStatus(raw: string | null | undefined): boolean {
  const kind = getEntryStatusKind(raw);
  // The override only: `mapEntryStatus` also says PENDING for in-ring and absent dogs.
  const keptPendingByOverride =
    (kind === 'accepted' || kind === 'not_accepted') && mapEntryStatus(raw) === EntryStatus.PENDING;
  return kind === 'pending' || keptPendingByOverride;
}
