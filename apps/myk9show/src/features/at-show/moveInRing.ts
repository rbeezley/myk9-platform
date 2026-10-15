import { transitionToInRing } from '@/utils/checkInTransitions';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

/**
 * Auto-set an opened scoresheet's entry to in-ring, from its current replica
 * row. Stable (module scope), so it can be handed to `useEntryHeld`.
 */
export function moveInRing(row: ReplicatedEntry): void {
  transitionToInRing(row.id, row.checkInStatus, row.ring_entry_time);
}
