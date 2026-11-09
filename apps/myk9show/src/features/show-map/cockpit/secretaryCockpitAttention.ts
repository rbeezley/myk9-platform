/**
 * The Cockpit schedule's shared "does this Class match this status" state
 * (MYK9-812, MYK9-1727). `secretaryCockpitModel.ts`'s `buildTrialGroups` (the
 * schedule's row filter, over raw Classes) and `cockpitStatusFilter.ts`'s
 * `buildCockpitStatusField` (the Filter menu's counts, over `model.daySchedule`
 * rows) both call `matchesCockpitFilter` with a `derivedAttentionCount` from
 * the same `attentionCountByClass` map, so an option's count can never diverge
 * from the rows it labels by drifting out of sync with a second, independent
 * reconstruction (Codex P2, MYK9-812).
 */

import type {
  CockpitCloseoutState,
  CockpitLifecycle,
  CockpitStatus,
  SecretaryCockpitAttention,
} from './secretaryCockpitTypes';

export function matchesCockpitFilter(
  row: {
    lifecycle?: CockpitLifecycle | null;
    closeout?: CockpitCloseoutState | null;
  },
  status: CockpitStatus,
  derivedAttentionCount: number
): boolean {
  switch (status) {
    case 'not-started':
    case 'in-progress':
    case 'complete':
    case 'cancelled':
      return row.lifecycle === status;
    case 'needs-attention':
      return derivedAttentionCount > 0;
    case 'needs-closeout':
      return row.closeout === 'needs-closeout';
  }
}

/** A Class shows when no status is ticked, or when it matches ANY ticked one (MYK9-1727). */
export function matchesAnyCockpitStatus(
  row: Parameters<typeof matchesCockpitFilter>[0],
  statuses: readonly CockpitStatus[],
  derivedAttentionCount: number
): boolean {
  return (
    statuses.length === 0 ||
    statuses.some(status => matchesCockpitFilter(row, status, derivedAttentionCount))
  );
}

/**
 * Per-class attention counts, derived once from the deduped attention list
 * (`allAttention` / `model.attention.all`) and threaded into both
 * `buildTrialGroups` (the schedule's rows) and `daySchedule` (every Class the
 * status counts read) in `secretaryCockpitModel.ts`.
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
