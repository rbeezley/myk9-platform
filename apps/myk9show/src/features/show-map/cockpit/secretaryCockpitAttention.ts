/**
 * The Cockpit schedule's shared "does this Class belong in this view" state
 * (MYK9-812). `secretaryCockpitModel.ts`'s `buildTrialGroups` (the schedule's
 * row filter, over raw Classes) and `secretaryCockpitViews.ts`'s
 * `buildCockpitScheduleViews` (the view-tab counts, over `model.daySchedule`
 * rows) both call `matchesCockpitFilter` with a `derivedAttentionCount` from
 * the same `attentionCountByClass` map, so a tab's count can never diverge
 * from the rows it labels by drifting out of sync with a second, independent
 * reconstruction (Codex P2, secretaryCockpitViews.ts:52-54).
 */

import type {
  CockpitCloseoutState,
  CockpitFilter,
  CockpitLifecycle,
  SecretaryCockpitAttention,
} from './secretaryCockpitTypes';

export function matchesCockpitFilter(
  row: {
    lifecycle?: CockpitLifecycle | null;
    closeout?: CockpitCloseoutState | null;
  },
  filter: CockpitFilter,
  derivedAttentionCount: number
): boolean {
  switch (filter) {
    case 'in-progress':
      return row.lifecycle === 'in-progress';
    case 'needs-attention':
      return derivedAttentionCount > 0;
    case 'needs-closeout':
      return row.closeout === 'needs-closeout';
    case 'all':
      return true;
  }
}

/**
 * Per-class attention counts, derived once from the deduped attention list
 * (`allAttention` / `model.attention.all`) and threaded into both
 * `buildTrialGroups` (the schedule's rows) and `daySchedule` (every Class the
 * view-tab counts filter) in `secretaryCockpitModel.ts`.
 */
export function buildAttentionCountByClass(
  attention: readonly SecretaryCockpitAttention[]
): ReadonlyMap<string, number> {
  const attentionCountByClass = new Map<string, number>();
  for (const item of attention) {
    if (!item.classId) continue;
    attentionCountByClass.set(item.classId, (attentionCountByClass.get(item.classId) ?? 0) + 1);
  }
  return attentionCountByClass;
}
