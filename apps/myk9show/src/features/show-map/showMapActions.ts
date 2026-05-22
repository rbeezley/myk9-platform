import { getShowMapReportHref, getShowMapTrialScheduleHref } from './showMapRoutes';
import {
  ArrowUpCircle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FileText,
  FolderOpen,
  MessageSquare,
  PenLine,
  PlayCircle,
  Send,
  UserCheck,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { isShowMapActionEnabled } from './showMapActionExecution';
import { SHOW_MAP_WRAP_UP_STATUS } from './showMapTypes';
import type { ShowMapNode, ShowMapTree } from './showMapTypes';

export const SHOW_MAP_RECOMMENDED_ACTION_LIMIT = 2;

export const showMapBadgeTargets = {
  trial: ['registry', 'date', 'ring/judge', 'status', 'reports-readiness'],
  class: ['run-order position', 'checked-in count', 'scored count', 'pending-issues count'],
  entry: ['armband', 'check-in status', 'move-up/scratch/absent status', 'score status'],
} as const;

export const showMapActionIds = [
  'resolve-check-in-conflict',
  'review-entry',
  'score-class',
  'open-class',
  'print-check-in-sheet',
  'mark-class-started',
  'mark-class-complete',
  'open-schedule',
  'print-trial-reports',
  'mark-checked-in',
  'move-up-entry',
  'scratch-entry',
  'message-handler',
  'collect-judge-signature',
  'review-results',
  'submit-final-results',
] as const;

export type ShowMapActionId = (typeof showMapActionIds)[number];

export interface ShowMapAction {
  id: ShowMapActionId;
  nodeId: string;
  label: string;
  why: string;
  priority: number;
  href?: string;
  classId?: string | undefined;
  trialId?: string | undefined;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  recommended?: boolean;
  createsAttention?: boolean;
}

export interface ShowMapActionState {
  tree: ShowMapTree;
  phase?: 'today' | 'wrap-up' | undefined;
}

export type ShowMapActionScope = 'root' | ShowMapNode;

function childrenOf(tree: ShowMapTree, nodeId: string): ShowMapNode[] {
  return (tree.childIdsByParentId[nodeId] ?? [])
    .map(childId => tree.nodesById[childId])
    .filter((node): node is ShowMapNode => Boolean(node));
}

function descendantsOf(tree: ShowMapTree, nodeId: string): ShowMapNode[] {
  const children = childrenOf(tree, nodeId);
  return children.flatMap(child => [child, ...descendantsOf(tree, child.id)]);
}

function scopedNodes(scope: ShowMapActionScope, tree: ShowMapTree): ShowMapNode[] {
  if (scope === 'root') return [tree.root, ...descendantsOf(tree, tree.root.id)];
  return [scope, ...descendantsOf(tree, scope.id)];
}

function isClassReadyToScore(node: ShowMapNode): boolean {
  return node.type === 'class' && node.status?.kind === 'active' && Boolean(node.scoreHref);
}

function canMarkClassStarted(node: ShowMapNode): boolean {
  return node.type === 'class' && node.status?.kind === 'neutral';
}

function canMarkClassComplete(node: ShowMapNode): boolean {
  if (node.type !== 'class' || node.status?.kind !== 'active') return false;
  // No progress data means an empty class; let the secretary close it out.
  if (!node.progress) return true;
  return node.progress.completed >= node.progress.total;
}

function canMarkEntryCheckedIn(node: ShowMapNode): boolean {
  if (node.type !== 'entry') return false;
  if (node.status?.kind === 'complete' || node.status?.kind === 'muted') return false;
  return !['checked-in', 'completed', 'pulled'].includes(node.checkInStatus?.value ?? '');
}

function canMessageEntryHandler(node: ShowMapNode): boolean {
  return node.type === 'entry' && Boolean(node.entryDisplay?.handlerId);
}

function sourceIdFromNodeId(nodeId: string | undefined, expectedType: string): string | undefined {
  const prefix = `${expectedType}:`;
  if (!nodeId?.startsWith(prefix)) return undefined;
  const sourceId = nodeId.slice(prefix.length);
  return sourceId.length > 0 ? sourceId : undefined;
}

function getNodeSourceId(node: ShowMapNode, expectedType: string): string | undefined {
  return sourceIdFromNodeId(node.id, expectedType);
}

function getParentSourceId(
  node: ShowMapNode,
  tree: ShowMapTree,
  expectedType: string
): string | undefined {
  const parent = node.parentId ? tree.nodesById[node.parentId] : undefined;
  return parent ? getNodeSourceId(parent, expectedType) : undefined;
}

function getRootShowId(tree: ShowMapTree): string | undefined {
  return getNodeSourceId(tree.root, 'show');
}

function withHref(action: Omit<ShowMapAction, 'href'>, href: string | undefined): ShowMapAction {
  return href ? { ...action, href } : action;
}

function nearestHref(tree: ShowMapTree, node: ShowMapNode): string | undefined {
  let current: ShowMapNode | undefined = node;
  while (current) {
    if (current.href) return current.href;
    current = current.parentId ? tree.nodesById[current.parentId] : undefined;
  }
  return undefined;
}

function wrapUpActionsForNode(node: ShowMapNode): ShowMapAction[] {
  if (node.type === 'class') {
    if (node.wrapUpStatus?.value === SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE) {
      return [
        {
          id: 'collect-judge-signature',
          nodeId: node.id,
          label: 'Collect judge signature',
          why: 'Completed class still needs judge sign-off',
          priority: 95,
          href: '/secretary/reports',
          icon: PenLine,
          recommended: true,
          createsAttention: true,
        },
      ];
    }

    if (
      node.wrapUpStatus?.value === SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP ||
      node.wrapUpStatus?.value === SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE
    ) {
      return [
        {
          id: 'review-results',
          nodeId: node.id,
          label: 'Review results',
          why: 'Confirm placements before final submission',
          priority: 60,
          href: '/secretary/results-control',
          icon: FileText,
          recommended: true,
          createsAttention: true,
        },
      ];
    }
  }

  if (
    node.type === 'trial' &&
    node.wrapUpStatus?.value === SHOW_MAP_WRAP_UP_STATUS.TRIAL_READY_TO_SUBMIT
  ) {
    return [
      {
        id: 'submit-final-results',
        nodeId: node.id,
        label: 'Submit final results',
        why: 'Completed trial is ready for closeout submission',
        priority: 50,
        href: '/secretary/results-submission',
        icon: Send,
        recommended: true,
        createsAttention: true,
      },
    ];
  }

  return [];
}

function actionsForNode(
  node: ShowMapNode,
  tree: ShowMapTree,
  phase: ShowMapActionState['phase']
): ShowMapAction[] {
  if (phase === 'wrap-up') {
    return wrapUpActionsForNode(node);
  }

  if (node.type === 'entry') {
    const actions: ShowMapAction[] = [];
    const href = nearestHref(tree, node);
    const classId = sourceIdFromNodeId(node.parentId, 'class');
    if (node.status?.kind === 'attention' || node.checkInStatus?.kind === 'attention') {
      actions.push(
        withHref(
          {
            id: 'resolve-check-in-conflict',
            nodeId: node.id,
            label: 'Resolve check-in conflict',
            why: 'Entry has a check-in conflict',
            priority: 100,
            icon: UserCheck,
            recommended: true,
            createsAttention: true,
          },
          href
        )
      );
    }
    if (node.status?.value === 'submitted') {
      actions.push(
        withHref(
          {
            id: 'review-entry',
            nodeId: node.id,
            label: 'Review entry',
            why: 'Entry is waiting for secretary review',
            priority: 85,
            icon: ClipboardList,
            recommended: true,
            createsAttention: true,
          },
          href
        )
      );
    }
    if (canMarkEntryCheckedIn(node)) {
      actions.push({
        id: 'mark-checked-in',
        nodeId: node.id,
        label: 'Mark checked in',
        why: 'Prepare this entry for the gate',
        priority: 35,
        icon: ClipboardCheck,
        ...(classId ? { classId } : {}),
      });
    }
    actions.push(
      withHref(
        {
          id: 'move-up-entry',
          nodeId: node.id,
          label: 'Move up',
          why: 'Move this entry to the next eligible class',
          priority: 32,
          icon: ArrowUpCircle,
          ...(classId ? { classId } : {}),
        },
        undefined
      )
    );

    actions.push(
      withHref(
        {
          id: 'scratch-entry',
          nodeId: node.id,
          label: 'Scratch / no-show',
          why: 'Mark this entry absent for ring flow',
          priority: 30,
          icon: Ban,
          ...(classId ? { classId } : {}),
        },
        undefined
      )
    );
    if (canMessageEntryHandler(node)) {
      actions.push(
        withHref(
          {
            id: 'message-handler',
            nodeId: node.id,
            label: 'Message handler',
            why: 'Contact the handler about this entry',
            priority: 25,
            icon: MessageSquare,
          },
          undefined
        )
      );
    }
    return actions;
  }

  if (node.type === 'class') {
    const actions: ShowMapAction[] = [];
    const showId = getRootShowId(tree);
    const trialId = getParentSourceId(node, tree, 'trial');
    const classId = getNodeSourceId(node, 'class');
    if (canMarkClassStarted(node) && classId) {
      actions.push({
        id: 'mark-class-started',
        nodeId: node.id,
        label: 'Mark Class Started',
        why: 'Start the class for show-day tracking',
        priority: 62,
        icon: PlayCircle,
        classId,
        ...(trialId ? { trialId } : {}),
        recommended: true,
      });
    }
    if (isClassReadyToScore(node) && node.scoreHref) {
      actions.push({
        id: 'score-class',
        nodeId: node.id,
        label: 'Score Class',
        why: 'Class is in progress',
        priority: 70,
        href: node.scoreHref,
        icon: ClipboardCheck,
        recommended: true,
      });
    }
    if (canMarkClassComplete(node) && classId) {
      actions.push({
        id: 'mark-class-complete',
        nodeId: node.id,
        label: 'Mark Class Complete',
        why: 'Move this class into wrap-up',
        priority: 58,
        icon: CheckCircle2,
        classId,
        ...(trialId ? { trialId } : {}),
      });
    }
    if (node.href) {
      actions.push({
        id: 'open-class',
        nodeId: node.id,
        label: 'Open Class',
        why: 'View class details',
        priority: 30,
        href: node.href,
        icon: FolderOpen,
      });
    }
    actions.push(
      withHref(
        {
          id: 'print-check-in-sheet',
          nodeId: node.id,
          label: 'Print Check-In Sheet',
          why: 'Prepare check-in for this class',
          priority: node.status?.kind === 'neutral' ? 45 : 20,
          icon: ClipboardList,
          recommended: node.status?.kind === 'neutral',
        },
        showId && trialId && classId
          ? getShowMapReportHref({
              reportId: 'check-in-sheet',
              showId,
              trialId,
              classId,
            })
          : undefined
      )
    );
    return actions;
  }

  if (node.type === 'trial') {
    const showId = getRootShowId(tree);
    const trialId = getNodeSourceId(node, 'trial');
    return [
      withHref(
        {
          id: 'open-schedule',
          nodeId: node.id,
          label: 'Open Schedule',
          why: 'Review this trial timeline',
          priority: node.status?.kind === 'active' ? 50 : 15,
          icon: DoorOpen,
          recommended: node.status?.kind === 'active',
        },
        showId ? getShowMapTrialScheduleHref(showId) : undefined
      ),
      withHref(
        {
          id: 'print-trial-reports',
          nodeId: node.id,
          label: 'Print Trial Reports',
          why: 'Prepare trial paperwork',
          priority: 10,
          icon: FileText,
        },
        showId && trialId
          ? getShowMapReportHref({
              reportId: 'trial-secretary-report',
              showId,
              trialId,
            })
          : undefined
      ),
    ];
  }

  return [];
}

function compareShowMapActions(a: ShowMapAction, b: ShowMapAction): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const labelOrder = a.label.localeCompare(b.label);
  if (labelOrder !== 0) return labelOrder;
  const nodeOrder = a.nodeId.localeCompare(b.nodeId);
  if (nodeOrder !== 0) return nodeOrder;
  return a.id.localeCompare(b.id);
}

export function getRankedActions(
  scope: ShowMapActionScope,
  state: ShowMapActionState
): ShowMapAction[] {
  return scopedNodes(scope, state.tree)
    .flatMap(node => actionsForNode(node, state.tree, state.phase))
    .sort(compareShowMapActions);
}

export function getDirectActionsForNode(
  node: ShowMapNode,
  state: ShowMapActionState
): ShowMapAction[] {
  return actionsForNode(node, state.tree, state.phase).sort(compareShowMapActions);
}

export function getRecommendedActionsForNode(
  node: ShowMapNode,
  state: ShowMapActionState,
  limit = SHOW_MAP_RECOMMENDED_ACTION_LIMIT
): ShowMapAction[] {
  return getDirectActionsForNode(node, state)
    .filter(action => action.recommended && isShowMapActionEnabled(action))
    .slice(0, limit);
}

export function getRecommendedActions(
  scope: ShowMapActionScope,
  state: ShowMapActionState,
  limit = SHOW_MAP_RECOMMENDED_ACTION_LIMIT
): ShowMapAction[] {
  return getRankedActions(scope, state)
    .filter(action => action.recommended && isShowMapActionEnabled(action))
    .slice(0, limit);
}

export function getAllRecommendedActions(
  scope: ShowMapActionScope,
  state: ShowMapActionState
): ShowMapAction[] {
  return getRecommendedActions(scope, state, Number.POSITIVE_INFINITY);
}

export function getAttentionActions(
  scope: ShowMapActionScope,
  state: ShowMapActionState
): ShowMapAction[] {
  return getRankedActions(scope, state).filter(action => action.createsAttention);
}

export function getAttentionNodeIds(
  tree: ShowMapTree,
  phase?: ShowMapActionState['phase']
): Set<string> {
  const nodeIds = new Set<string>();
  for (const action of getAttentionActions('root', { tree, phase })) {
    let node: ShowMapNode | undefined = tree.nodesById[action.nodeId];
    while (node) {
      nodeIds.add(node.id);
      node = node.parentId ? tree.nodesById[node.parentId] : undefined;
    }
  }
  return nodeIds;
}

export function getPrimaryActionForNode(
  node: ShowMapNode | undefined,
  state: ShowMapActionState
): ShowMapAction | undefined {
  if (!node) return undefined;
  const actions = getDirectActionsForNode(node, state).filter(action => action.href);
  return actions[0];
}
