import type { Show } from '@/types/show-types';
import { getAttentionCountsByNodeId } from './showMapActions';
import { SHOW_MAP_WRAP_UP_STATUS } from './showMapTypes';
import type { ShowMapNode, ShowMapTree, ShowMapTrialInput } from './showMapTypes';

export type ShowDeskShowStatus = 'setup' | 'show-in-progress' | 'wrap-up' | 'closed';

export interface ShowDeskStatusResult {
  status: ShowDeskShowStatus;
  summary: string;
}

export interface ComputeShowDeskStatusInput {
  show: Pick<Show, 'startDate' | 'endDate'>;
  trials: readonly ShowMapTrialInput[];
  tree: ShowMapTree;
  now?: Date;
}

const WRAP_UP_ELIGIBLE_VALUES: ReadonlySet<string> = new Set([
  SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
  SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
  SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
  SHOW_MAP_WRAP_UP_STATUS.NEEDS_WRAP_UP,
  SHOW_MAP_WRAP_UP_STATUS.TRIAL_READY_TO_SUBMIT,
]);

function classNodes(tree: ShowMapTree): ShowMapNode[] {
  return Object.values(tree.nodesById).filter(node => node.type === 'class');
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function hasAnyWrapUpEligibleNode(tree: ShowMapTree): boolean {
  return classNodes(tree).some(node => {
    const value = node.wrapUpStatus?.value;
    return Boolean(value && WRAP_UP_ELIGIBLE_VALUES.has(value));
  });
}

export function computeShowDeskStatus({
  show,
  // Reserved for future multi-day refinement: per-trial dates may override show-level
  // boundaries when trials span non-contiguous days. Phase B0 uses show.startDate /
  // show.endDate only; the param shape is preserved so callers don't churn in B2.
  trials: _trials,
  tree,
  now,
}: ComputeShowDeskStatusInput): ShowDeskStatusResult {
  const today = toLocalDateString(now ?? new Date());
  const startDate = show.startDate ?? '';
  const endDate = show.endDate || startDate;

  const classes = classNodes(tree);
  const totalClasses = classes.length;
  const completeClassCount = classes.filter(node => node.status?.kind === 'complete').length;
  const activeClassCount = classes.filter(node => node.status?.kind === 'active').length;
  // Match the same source the Need Attention filter uses so summary +
  // filter never drift.
  const attentionItems = getAttentionCountsByNodeId(tree, { now }).get(tree.root.id) ?? 0;

  const hasScoringActivity = classes.some(
    node => node.status?.kind === 'active' || node.status?.kind === 'complete'
  );
  const allClassesComplete = totalClasses > 0 && completeClassCount === totalClasses;
  const allClassesSubmitted =
    totalClasses > 0 &&
    classes.every(
      node => node.wrapUpStatus?.value === SHOW_MAP_WRAP_UP_STATUS.SUBMITTED_TO_REGISTRY
    );

  let status: ShowDeskShowStatus;
  if (allClassesComplete && allClassesSubmitted) {
    status = 'closed';
  } else if (
    startDate &&
    today >= startDate &&
    activeClassCount === 0 &&
    hasAnyWrapUpEligibleNode(tree)
  ) {
    // INTENT: Wrap-up fires once the show has STARTED (not after it ends) so a single-day
    // show with all classes done and signatures pending shows wrap-up the same day, not
    // tomorrow. Plan Q1 (2026-05-22): "Today is past start date AND ≥1 class needs
    // sign/review/submit AND no class is active".
    status = 'wrap-up';
  } else if (startDate && today < startDate && !hasScoringActivity) {
    status = 'setup';
  } else if (hasScoringActivity || (startDate && today >= startDate && today <= endDate)) {
    status = 'show-in-progress';
  } else {
    status = 'setup';
  }

  const summary = buildSummary({
    totalClasses,
    completeClassCount,
    attentionItems,
  });

  return { status, summary };
}

function buildSummary({
  totalClasses,
  completeClassCount,
  attentionItems,
}: {
  totalClasses: number;
  completeClassCount: number;
  attentionItems: number;
}): string {
  const parts: string[] = [];
  if (totalClasses > 0) {
    parts.push(`${completeClassCount} of ${totalClasses} classes complete`);
  }
  if (attentionItems > 0) {
    const label = attentionItems === 1 ? 'item needs' : 'items need';
    parts.push(`${attentionItems} ${label} attention`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No activity yet';
}
