import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { isPinnedRunOrderEntry } from './showMapRunOrderAutoSort';
import type { ShowMapNode } from './showMapTypes';

// UI-side approximation of `isPinnedRunOrderEntry` working only off fields
// available on the ShowMapNode. The mutation path uses the authoritative
// replicated-row check; this helper just decides which drag handles to grey
// out / which entries become un-draggable in the reorder UI.
export function isShowMapEntryPinnedForReorder(node: ShowMapNode): boolean {
  if (node.type !== 'entry') return false;
  if (node.status?.kind === 'complete') return true;
  const checkIn = node.checkInStatus?.value;
  if (checkIn === 'in-ring') return true;
  if (checkIn === 'completed') return true;
  return false;
}

export interface ShowMapReorderAssignment {
  id: string;
  runOrder: number;
}

function sortByExistingRunOrder(entries: readonly ReplicatedEntry[]): ReplicatedEntry[] {
  return [...entries].sort((a, b) => {
    const aOrder = a.runOrder ?? Number.POSITIVE_INFINITY;
    const bOrder = b.runOrder ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

// Compute new run_order assignments after a manual drag. The drag-end event
// gives us the from/to position WITHIN THE UNPINNED list (since pinned rows
// don't get drag handles). We rebuild the merged sequence by holding pinned
// entries in their original slots and inserting the unpinned list at the new
// position.
//
// Inputs:
//   entries        — current entries for the class, in any order
//   activeId       — id of the dragged entry (must be unpinned)
//   overId         — id of the entry the drag ended OVER (must be unpinned;
//                    null/undefined means "no move")
//
// Returns the run_order assignments for all entries, or an empty array if
// the move is a no-op (same slot) or invalid (pinned entry dragged).
export function computeShowMapReorderAssignments(
  entries: readonly ReplicatedEntry[],
  activeId: string,
  overId: string | null | undefined
): ShowMapReorderAssignment[] {
  if (!overId || activeId === overId) return [];

  const ordered = sortByExistingRunOrder(entries);
  const unpinned = ordered.filter(entry => !isPinnedRunOrderEntry(entry));
  const activeIndex = unpinned.findIndex(entry => entry.id === activeId);
  const overIndex = unpinned.findIndex(entry => entry.id === overId);
  if (activeIndex === -1 || overIndex === -1) return [];

  const reorderedUnpinned = [...unpinned];
  const [moved] = reorderedUnpinned.splice(activeIndex, 1);
  if (!moved) return [];
  reorderedUnpinned.splice(overIndex, 0, moved);

  let unpinnedCursor = 0;
  return ordered.map((entry, index) => {
    if (isPinnedRunOrderEntry(entry)) {
      return { id: entry.id, runOrder: index + 1 };
    }
    const next = reorderedUnpinned[unpinnedCursor++];
    return { id: next?.id ?? entry.id, runOrder: index + 1 };
  });
}

// Snapshot of which entries are draggable vs pinned, plus the visible order
// the secretary sees (sorted by run_order). Used by the sortable context to
// build the `items` array passed to dnd-kit.
export function getReorderableEntryIds(entries: readonly ReplicatedEntry[]): string[] {
  return sortByExistingRunOrder(entries)
    .filter(entry => !isPinnedRunOrderEntry(entry))
    .map(entry => entry.id);
}

export function isEntryDraggableForReorder(entry: ReplicatedEntry): boolean {
  return !isPinnedRunOrderEntry(entry);
}
