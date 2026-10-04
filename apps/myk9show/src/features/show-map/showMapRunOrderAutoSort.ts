import { calculateRunOrder } from '@/lib/runOrderUtils';
import {
  planRenumber,
  type PlacementMove,
  type RunOrderPlacementModel,
} from './runOrderPlacementModel';

export type ShowMapAutoSortKind = 'armband-asc' | 'armband-desc' | 'random';

export interface ShowMapAutoSortSnapshotItem {
  id: string;
  runOrder: number | null;
}

// INTENT: Presets reorder only the dogs still waiting to run. Which dogs wait,
// their order and the number to start from all come from the placement model
// (`runOrderPlacementModel.ts`), the same one hand placement uses, so a preset
// can never renumber a dog that has run, is in the ring, was pulled or is off
// the run list. Returns only the dogs whose run_order changes.
export function planPresetPlacement(
  model: RunOrderPlacementModel,
  kind: ShowMapAutoSortKind
): PlacementMove[] {
  const rank = new Map(
    calculateRunOrder(
      model.waiting.map(row => ({ id: row.id, armband: row.armband, section: null })),
      kind
    ).map(result => [result.id, result.runOrder])
  );
  const sorted = [...model.waiting].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return planRenumber(
    model,
    sorted.map(row => row.id)
  );
}
