import { getPaperScoringEntryHref } from '@/pages/scoring/scoringRoutes';
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
  Pencil,
  PlayCircle,
  Send,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { isShowMapActionEnabled } from './showMapActionExecution';
import {
  canMarkClassComplete,
  canMarkClassStarted,
  canMarkEntryCheckedIn,
  canMessageEntryHandler,
  getEntrySourceId,
  getNodeSourceId,
  getParentSourceId,
  getRootShowId,
  isClassReadyToScore,
  isSyntheticDisplayActionNode,
  sourceIdFromNodeId,
} from './showMapActionHelpers';
import { isNodeScheduledAfter } from './showMapTimeScope';
import { SHOW_MAP_WRAP_UP_STATUS } from './showMapTypes';
import type { ShowMapNode, ShowMapTree } from './showMapTypes';

export const SHOW_MAP_RECOMMENDED_ACTION_LIMIT = 2;

export const showMapBadgeTargets = {
  trial: ['registry', 'date', 'ring/judge', 'status', 'reports-readiness'],
  class: ['run-order position', 'checked-in count', 'scored count', 'pending-issues count'],
  entry: ['armband', 'check-in status', 'move-up/scratch/absent status', 'score status'],
} as const;

export const showMapActionIds = [
  'review-entry',
  'edit-score',
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
  now?: Date | undefined;
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

function withHref(action: Omit<ShowMapAction, 'href'>, href: string | undefined): ShowMapAction {
  return href ? { ...action, href } : action;
}

function entryContextLabel(node: ShowMapNode): string {
  const display = node.entryDisplay;
  if (!display) return '';
  const parts: string[] = [];
  if (display.armband) parts.push(`#${display.armband}`);
  if (display.dogName && display.dogName !== 'Unknown') parts.push(display.dogName);
  if (display.handler) parts.push(display.handler);
  return parts.join(' · ');
}

function withEntryContext(node: ShowMapNode, why: string): string {
  const context = entryContextLabel(node);
  return context ? `${context} — ${why}` : why;
}

// INTENT: Wrap-up priorities sit BELOW the live-ops band by construction.
//
// Why this band exists
// --------------------
// `getRecommendedActions('root', tree)` aggregates actions across the
// whole show tree and ranks by priority. Without a priority band, a
// single class with `wrapUpStatus = NEEDS_JUDGE_SIGNATURE` would float
// to #1 globally and dominate Show Desk's primary recommendation —
// even when 39 other classes haven't started yet. The 2026-05-26
// secretary launch-readiness audit caught exactly that case: "0 of
// 40 classes complete" with Show Desk recommending `Collect judge
// signature`.
//
// Live-ops priority band (live operations during show-day)
// ---------------------------------------------------------
// - score-class:         70
// - mark-class-started:  62
// - mark-class-complete: 58
//
// Wrap-up priority band (post-class housekeeping)
// -----------------------------------------------
// Ordered chronologically — the secretary collects signatures, then
// reviews results, then submits to the registry. The band sits
// entirely below live-ops; the within-band order matches the
// natural wrap-up sequence.
// - collect-judge-signature: 55  (was 95 — see audit)
// - review-results:          52  (was 60)
// - submit-final-results:    50
//
// Wrap-up actions stay `recommended: true` so they still surface on
// the specific class/trial node's Recommendations list. Show-scope
// ranking additionally filters future-dated show-day actions so the
// Show Desk's primary recommendation stays tied to the secretary's
// current phase/date.
function wrapUpActionsForNode(node: ShowMapNode, tree: ShowMapTree): ShowMapAction[] {
  if (node.type === 'class') {
    const showId = getRootShowId(tree);
    const trialId = getParentSourceId(node, tree, 'trial');
    const classId = getNodeSourceId(node, 'class');

    if (node.wrapUpStatus?.value === SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE) {
      return [
        withHref(
          {
            id: 'collect-judge-signature',
            nodeId: node.id,
            label: 'Collect judge signature',
            why: 'Completed class still needs judge sign-off',
            priority: 55,
            icon: PenLine,
            ...(classId ? { classId } : {}),
            ...(trialId ? { trialId } : {}),
            recommended: true,
            createsAttention: true,
          },
          showId && trialId && classId
            ? getShowMapReportHref({
                reportId: 'result-catalog',
                showId,
                trialId,
                classId,
              })
            : undefined
        ),
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
          priority: 52,
          ...(showId ? { href: `/shows/${showId}/results-control` } : {}),
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
    const showId = getRootShowId(tree);
    return [
      {
        id: 'submit-final-results',
        nodeId: node.id,
        label: 'Submit final results',
        why: 'Completed trial is ready for closeout submission',
        priority: 50,
        ...(showId ? { href: `/shows/${showId}/submit-results` } : {}),
        icon: Send,
        recommended: true,
        createsAttention: true,
      },
    ];
  }

  return [];
}

function isDateSensitiveRootAction(action: ShowMapAction): boolean {
  return (
    action.id === 'score-class' ||
    action.id === 'mark-class-started' ||
    action.id === 'mark-class-complete' ||
    action.id === 'collect-judge-signature' ||
    action.id === 'review-results' ||
    action.id === 'submit-final-results'
  );
}

function isActionEligibleForScope(
  action: ShowMapAction,
  scope: ShowMapActionScope,
  state: ShowMapActionState
): boolean {
  if (scope !== 'root' || !isDateSensitiveRootAction(action)) return true;
  const node = state.tree.nodesById[action.nodeId];
  if (!node) return true;
  return !isNodeScheduledAfter(state.tree, node, state.now);
}

function liveOpsActionsForNode(node: ShowMapNode, tree: ShowMapTree): ShowMapAction[] {
  if (node.type === 'dog-entry') {
    const entryId = getEntrySourceId(node);
    if (!entryId || tree.nodesById[`entry:${entryId}`] || node.status?.value !== 'submitted') {
      return [];
    }

    return [
      {
        id: 'review-entry',
        nodeId: node.id,
        label: 'Review entry',
        why: withEntryContext(node, 'Entry is waiting for secretary review'),
        priority: 85,
        icon: ClipboardList,
        recommended: true,
        createsAttention: true,
        ...(node.dogEntryDisplay?.classId ? { classId: node.dogEntryDisplay.classId } : {}),
      },
    ];
  }

  if (node.type === 'entry') {
    const actions: ShowMapAction[] = [];
    const classId = sourceIdFromNodeId(node.parentId, 'class');
    if (node.status?.value === 'submitted') {
      actions.push({
        id: 'review-entry',
        nodeId: node.id,
        label: 'Review entry',
        why: withEntryContext(node, 'Entry is waiting for secretary review'),
        priority: 85,
        icon: ClipboardList,
        recommended: true,
        createsAttention: true,
      });
    }
    // Edit score deep-links into the paper-scoring screen at this entry's
    // row. Surfaces in two situations:
    // (a) The parent class is `active` → secretary can deep-link at any
    //     entry's position (currently-scoring, upcoming, or already scored).
    // (b) The entry itself is `complete` (scored) regardless of class status
    //     → post-hoc correction path that works even after the class is
    //     marked complete.
    const parentNode = node.parentId ? tree.nodesById[node.parentId] : undefined;
    const entryScored = node.status?.kind === 'complete';
    const classActive = parentNode?.status?.kind === 'active';
    const entryId = getNodeSourceId(node, 'entry');
    if ((entryScored || classActive) && classId && entryId) {
      actions.push({
        id: 'edit-score',
        nodeId: node.id,
        label: 'Edit score',
        why: withEntryContext(node, 'Open the scoring screen at this entry'),
        priority: 40,
        href: getPaperScoringEntryHref(classId, entryId),
        icon: Pencil,
        classId,
      });
    }
    if (canMarkEntryCheckedIn(node)) {
      actions.push({
        id: 'mark-checked-in',
        nodeId: node.id,
        label: 'Mark checked in',
        why: withEntryContext(node, 'Prepare this entry for the gate'),
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
          why: withEntryContext(node, 'Move this entry to the next eligible class'),
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
          why: withEntryContext(node, 'Mark this entry absent for ring flow'),
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
            why: withEntryContext(node, 'Contact the handler about this entry'),
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
    if (node.status?.kind === 'neutral' && classId && node.scoreHref) {
      actions.push({
        id: 'score-class',
        nodeId: node.id,
        label: 'Score Class',
        why: 'Open scoring without changing class status',
        priority: 34,
        href: node.scoreHref,
        icon: ClipboardCheck,
        classId,
        ...(trialId ? { trialId } : {}),
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
        ...(classId ? { classId } : {}),
        ...(trialId ? { trialId } : {}),
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

// INTENT: Show Desk is now the canonical (and only) operational surface, so
// the action set is always the unified merge of live-ops + wrap-up. Phase B5
// removed the Today and Wrap-up tabs that needed the filtered variants; B6
// drops the now-dead phase parameter. The dedup invariant stays as a
// safety net — it catches future contributors who accidentally emit the
// same action id from both branches for the same node.
function actionsForNode(node: ShowMapNode, tree: ShowMapTree): ShowMapAction[] {
  if (isSyntheticDisplayActionNode(node)) return [];

  const merged = [...liveOpsActionsForNode(node, tree), ...wrapUpActionsForNode(node, tree)];
  assertNoActionCollision(merged);
  return merged;
}

function assertNoActionCollision(actions: ShowMapAction[]): void {
  if (process.env.NODE_ENV === 'production') return;
  const seen = new Set<string>();
  for (const action of actions) {
    const key = `${action.id}::${action.nodeId}`;
    if (seen.has(key)) {
      throw new Error(
        `showMapActions: duplicate action id "${action.id}" on node "${action.nodeId}". ` +
          `Live-ops and wrap-up branches must not emit the same id for the same node.`
      );
    }
    seen.add(key);
  }
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
  // INTENT: node scope aggregates descendants for root/attention surfaces; row menus use direct helpers.
  return scopedNodes(scope, state.tree)
    .flatMap(node => actionsForNode(node, state.tree))
    .filter(action => isActionEligibleForScope(action, scope, state))
    .sort(compareShowMapActions);
}

export function getDirectActionsForNode(
  node: ShowMapNode,
  state: ShowMapActionState
): ShowMapAction[] {
  return actionsForNode(node, state.tree).sort(compareShowMapActions);
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

function addNodeAndAncestors(
  tree: ShowMapTree,
  nodeId: string,
  visit: (nodeId: string) => void
): void {
  let node: ShowMapNode | undefined = tree.nodesById[nodeId];
  while (node) {
    visit(node.id);
    node = node.parentId ? tree.nodesById[node.parentId] : undefined;
  }
}

function getMirroredDogEntryNodeId(tree: ShowMapTree, actionNodeId: string): string | undefined {
  const entryId = sourceIdFromNodeId(actionNodeId, 'entry');
  if (!entryId) return undefined;
  const dogEntryNodeId = `dog-entry:${entryId}`;
  return tree.nodesById[dogEntryNodeId] ? dogEntryNodeId : undefined;
}

function attentionSourceKey(nodeId: string): string {
  const entryId = sourceIdFromNodeId(nodeId, 'entry') ?? sourceIdFromNodeId(nodeId, 'dog-entry');
  return entryId ? `entry:${entryId}` : nodeId;
}

function isEntryReviewAttentionNode(node: ShowMapNode): boolean {
  return node.type === 'dog-entry' && node.status?.value === 'submitted';
}

function getDirectAttentionNodeIdsBySource(
  tree: ShowMapTree,
  state: Omit<ShowMapActionState, 'tree'>
): Map<string, Set<string>> {
  const nodeIdsBySource = new Map<string, Set<string>>();
  const addDirectNodeId = (nodeId: string): void => {
    const key = attentionSourceKey(nodeId);
    const nodeIds = nodeIdsBySource.get(key) ?? new Set<string>();
    nodeIds.add(nodeId);
    nodeIdsBySource.set(key, nodeIds);
  };

  for (const action of getAttentionActions('root', { tree, ...state })) {
    addDirectNodeId(action.nodeId);
  }

  for (const node of Object.values(tree.nodesById)) {
    if (isEntryReviewAttentionNode(node)) {
      addDirectNodeId(node.id);
    }
  }

  return nodeIdsBySource;
}

function collectAttentionNodeIdsForSource(
  tree: ShowMapTree,
  directNodeIds: Set<string>
): Set<string> {
  const nodeIds = new Set<string>();
  for (const directId of directNodeIds) {
    addNodeAndAncestors(tree, directId, nodeId => nodeIds.add(nodeId));
    const dogEntryNodeId = getMirroredDogEntryNodeId(tree, directId);
    if (dogEntryNodeId) {
      addNodeAndAncestors(tree, dogEntryNodeId, nodeId => nodeIds.add(nodeId));
    }
  }
  return nodeIds;
}

export function getAttentionNodeIds(
  tree: ShowMapTree,
  state: Omit<ShowMapActionState, 'tree'> = {}
): Set<string> {
  const nodeIds = new Set<string>();
  for (const directNodeIds of getDirectAttentionNodeIdsBySource(tree, state).values()) {
    for (const nodeId of collectAttentionNodeIdsForSource(tree, directNodeIds)) {
      nodeIds.add(nodeId);
    }
  }
  return nodeIds;
}

// Attention rollup keyed on nodeId. Each unique node that directly hosts an
// attention action contributes +1 to itself and to every ancestor. The static
// `node.attentionCount` baked into the tree is entry-only and cannot represent
// unified wrap-up work; this helper is the source of truth for any surface
// (summary tile, row badges) whose count must match the Attention filter.
export function getAttentionCountsByNodeId(
  tree: ShowMapTree,
  state: Omit<ShowMapActionState, 'tree'> = {}
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const directNodeIds of getDirectAttentionNodeIdsBySource(tree, state).values()) {
    for (const nodeId of collectAttentionNodeIdsForSource(tree, directNodeIds)) {
      counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
    }
  }
  return counts;
}

export function getPrimaryActionForNode(
  node: ShowMapNode | undefined,
  state: ShowMapActionState
): ShowMapAction | undefined {
  if (!node) return undefined;
  // INTENT: B2b — the highest-priority action wins regardless of whether it
  // navigates or fires a mutation. The previous href-only filter meant
  // `mark-class-started` (mutation, no href) could never be the primary
  // button on a neutral class, so the secretary saw "Print Check-In Sheet"
  // when the next operational step was actually to start the class. Pattern
  // 3: next step always visible.
  return getDirectActionsForNode(node, state)[0];
}
