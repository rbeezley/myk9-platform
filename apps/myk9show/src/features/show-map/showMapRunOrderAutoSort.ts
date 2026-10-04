import { calculateRunOrder } from '@/lib/runOrderUtils';
import { assignOpenSlots, type PlacementMove, type PlacementSlot } from './runOrderPlacementModel';

export type ShowMapAutoSortKind = 'armband-asc' | 'armband-desc' | 'random';

export interface ShowMapAutoSortSnapshotItem {
  id: string;
  runOrder: number | null;
}

// INTENT: Presets re-sort only the dogs the secretary may silently move. The
// run list, its order and which dogs are pinned (already ran, in the ring) all
// come from the placement model (`runOrderPlacementModel.ts`), the same one
// hand placement uses, so a preset can never renumber a dog placement would
// refuse to move. Rows off the run list (withdrawn, deleted) are never written.
//
// Returns only the dogs whose run_order changes; pinned dogs keep their slot.
export function planPresetPlacement(
  slots: readonly PlacementSlot[],
  kind: ShowMapAutoSortKind
): PlacementMove[] {
  const open = slots.filter(slot => !slot.pinned);
  if (open.length === 0) return [];

  const rank = new Map(
    calculateRunOrder(
      open.map(slot => ({ id: slot.id, armband: slot.armband, section: null })),
      kind
    ).map(result => [result.id, result.runOrder])
  );
  const sorted = [...open].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return assignOpenSlots(slots, sorted);
}
