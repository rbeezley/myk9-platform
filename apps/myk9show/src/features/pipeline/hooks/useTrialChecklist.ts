import { useQuery } from '@tanstack/react-query';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { checklistService } from '../services';
import { getCannedItemsForStage } from '../constants';
import type {
  ChecklistItemRow,
  ResolvedChecklistItem,
  ChecklistEvalContext,
  PipelineStage,
} from '../types';

/** Merge canned definitions with DB state and auto-evaluate completions */
function resolveChecklist(
  stage: PipelineStage,
  dbItems: ChecklistItemRow[],
  evalCtx: ChecklistEvalContext
): ResolvedChecklistItem[] {
  const dbMap = new Map(dbItems.map((r) => [r.item_key, r]));
  const resolved: ResolvedChecklistItem[] = [];

  // Canned items for this stage
  const cannedDefs = getCannedItemsForStage(stage);
  for (const def of cannedDefs) {
    // Skip conditional items that don't apply
    if (def.conditional && !def.conditional(evalCtx)) continue;

    const dbRow = dbMap.get(def.key);
    const autoResult = def.evaluate(evalCtx);

    resolved.push({
      key: def.key,
      stage: def.stage,
      type: 'canned',
      label: def.label,
      completed: autoResult || (dbRow?.completed ?? false),
      completedAt: autoResult ? null : (dbRow?.completed_at ?? null),
      completedBy: dbRow?.completed_by ?? null,
      autoCompleted: autoResult,
      blocking: def.blocking,
      navigateTo: def.navigateTo,
      sortOrder: dbRow?.sort_order ?? 0,
    });
  }

  // Custom items for this stage
  const customItems = dbItems.filter(
    (r) => r.item_type === 'custom' && r.stage === stage
  );
  for (const item of customItems) {
    resolved.push({
      key: item.item_key,
      stage: item.stage as PipelineStage,
      type: 'custom',
      label: item.label ?? 'Untitled',
      completed: item.completed,
      completedAt: item.completed_at,
      completedBy: item.completed_by,
      autoCompleted: false,
      blocking: false, // Custom items never block
      sortOrder: item.sort_order,
    });
  }

  return resolved.sort((a, b) => {
    // Canned before custom, then by sort order
    if (a.type !== b.type) return a.type === 'canned' ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

export function useTrialChecklist(
  trialId: string | undefined,
  stage: PipelineStage,
  evalCtx: ChecklistEvalContext | undefined
) {
  return useQuery({
    queryKey: [...queryKeys.trialChecklist(trialId ?? ''), stage],
    queryFn: () => checklistService.getByTrial(trialId!),
    enabled: !!trialId,
    ...cacheStrategies.dynamic,
    select: (dbItems) => {
      if (!evalCtx) return [];
      return resolveChecklist(stage, dbItems, evalCtx);
    },
  });
}

/** Check whether all blocking items are complete for a stage */
export function canAdvanceStage(
  items: ResolvedChecklistItem[] | undefined
): boolean {
  if (!items) return false;
  return items.filter((i) => i.blocking).every((i) => i.completed);
}
