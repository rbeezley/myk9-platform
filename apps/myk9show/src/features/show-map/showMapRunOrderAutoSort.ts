import { calculateRunOrder } from '@/lib/runOrderUtils';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

export type ShowMapAutoSortKind = 'armband-asc' | 'armband-desc' | 'random';

export interface ShowMapAutoSortAssignment {
  id: string;
  runOrder: number;
}

export interface ShowMapAutoSortSnapshotItem {
  id: string;
  runOrder: number | null;
}

// INTENT: Pin entries the secretary cannot — or should not — silently
// reposition. Already-scored entries keep the slot they ran in. The dog
// currently in the ring is pinned by check-in / ring-entry signals so a
// re-sort never shuffles a class mid-run.
export function isPinnedRunOrderEntry(entry: ReplicatedEntry): boolean {
  const scored = Boolean(entry.isScored ?? entry.is_scored);
  const scoringCompleted = Boolean(entry.scoringCompletedAt ?? entry.scoring_completed_at);
  const checkInStatus = entry.checkInStatus ?? entry.check_in_status;
  const inRing = checkInStatus === 'in-ring' || Boolean(entry.ring_entry_time);
  const completed = checkInStatus === 'completed';
  return scored || scoringCompleted || inRing || completed;
}

function sortByExistingRunOrder(entries: ReplicatedEntry[]): ReplicatedEntry[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.runOrder ?? Number.POSITIVE_INFINITY;
    const bOrder = b.runOrder ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

// Compute new run_order assignments for a class. Pinned entries keep their
// slot (their `runOrder` is renumbered to 1..N alongside everyone else, but
// their POSITION in the merged sequence is unchanged). Unpinned entries are
// sorted per `kind` and dropped into the remaining slots in order.
export function computeShowMapAutoSortAssignments(
  entries: readonly ReplicatedEntry[],
  kind: ShowMapAutoSortKind
): ShowMapAutoSortAssignment[] {
  if (entries.length === 0) return [];

  const ordered = sortByExistingRunOrder(entries.slice());
  const unpinned = ordered.filter(entry => !isPinnedRunOrderEntry(entry));
  if (unpinned.length === 0) {
    return ordered.map((entry, index) => ({ id: entry.id, runOrder: index + 1 }));
  }

  const presetResults = calculateRunOrder(
    unpinned.map(entry => ({
      id: entry.id,
      armband: entry.armband ?? null,
      section: null,
    })),
    kind
  );
  const presetRank = new Map(presetResults.map(result => [result.id, result.runOrder]));
  const sortedUnpinned = [...unpinned].sort(
    (a, b) => (presetRank.get(a.id) ?? 0) - (presetRank.get(b.id) ?? 0)
  );

  let unpinnedCursor = 0;
  const assignments: ShowMapAutoSortAssignment[] = [];
  ordered.forEach((entry, index) => {
    const runOrder = index + 1;
    if (isPinnedRunOrderEntry(entry)) {
      assignments.push({ id: entry.id, runOrder });
      return;
    }
    const next = sortedUnpinned[unpinnedCursor++];
    if (next) assignments.push({ id: next.id, runOrder });
  });
  return assignments;
}

export function snapshotPriorRunOrders(
  entries: readonly ReplicatedEntry[]
): ShowMapAutoSortSnapshotItem[] {
  return entries.map(entry => ({
    id: entry.id,
    runOrder: entry.runOrder ?? null,
  }));
}
