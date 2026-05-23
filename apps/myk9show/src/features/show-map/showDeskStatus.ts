import type { Show } from '@/types/show-types';
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
  const attentionEntries = tree.root.attentionCount ?? 0;

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
  } else if (today > endDate && activeClassCount === 0 && hasAnyWrapUpEligibleNode(tree)) {
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
    attentionEntries,
  });

  return { status, summary };
}

function buildSummary({
  totalClasses,
  completeClassCount,
  attentionEntries,
}: {
  totalClasses: number;
  completeClassCount: number;
  attentionEntries: number;
}): string {
  const parts: string[] = [];
  if (totalClasses > 0) {
    parts.push(`${completeClassCount} of ${totalClasses} classes complete`);
  }
  if (attentionEntries > 0) {
    const label = attentionEntries === 1 ? 'entry needs' : 'entries need';
    parts.push(`${attentionEntries} ${label} attention`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No activity yet';
}
