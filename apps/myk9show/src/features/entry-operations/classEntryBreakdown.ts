import {
  getEntryStatusKind,
  type EntryStatusKind,
} from '@/services/entryDisplay/entryDisplaySelectors';
import { isPendingEntryStatus } from '@/features/_shared/entryPendingStatus';

/**
 * Per-class entry counts for the Overview schedule (MYK9-943). Counts only.
 *
 * Not `getOperationalEntryState`: the UI enum folds checked-in and in-ring dogs into PENDING
 * (`mapEntryStatusKindToUi`), so on show day a running class would read "12 pending". The raw
 * classifier keeps them entered. Pending still follows the Entries review lane, including the
 * owner's override that `paid` and `promotion-expired` stay pending (`mapEntryStatus`).
 */
export interface ClassEntryBreakdown {
  entered: number;
  pending: number;
}

interface EntryRowLike {
  class_id?: unknown;
  entry_status?: unknown;
  deleted_at?: unknown;
}

const ENTERED_KINDS: ReadonlySet<EntryStatusKind> = new Set<EntryStatusKind>([
  'accepted',
  'in_ring',
  'completed',
  'absent',
  'move_up_requested',
]);

export { isPendingEntryStatus };

export function buildClassEntryBreakdowns(
  entries: readonly EntryRowLike[]
): Map<string, ClassEntryBreakdown> {
  const result = new Map<string, ClassEntryBreakdown>();
  for (const entry of entries) {
    if (entry.deleted_at || typeof entry.class_id !== 'string' || !entry.class_id) continue;
    const raw = typeof entry.entry_status === 'string' ? entry.entry_status : null;
    const kind = getEntryStatusKind(raw);
    const isPending = isPendingEntryStatus(raw);
    if (!isPending && !ENTERED_KINDS.has(kind)) continue;
    const breakdown = result.get(entry.class_id) ?? { entered: 0, pending: 0 };
    breakdown[isPending ? 'pending' : 'entered'] += 1;
    result.set(entry.class_id, breakdown);
  }
  return result;
}

export function formatClassEntryBreakdown(breakdown: ClassEntryBreakdown): {
  entered: string;
  pending?: string;
} {
  return {
    entered: `${breakdown.entered} entered`,
    ...(breakdown.pending > 0 ? { pending: `${breakdown.pending} pending` } : {}),
  };
}
