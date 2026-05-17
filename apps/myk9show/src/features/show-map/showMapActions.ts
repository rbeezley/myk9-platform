import {
  ArrowUpCircle,
  Ban,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FileText,
  FolderOpen,
  MessageSquare,
  UserCheck,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { ShowMapNode, ShowMapTree } from './showMapTypes';

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
  'open-schedule',
  'print-trial-reports',
  'mark-checked-in',
  'move-up-entry',
  'scratch-entry',
  'message-handler',
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
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  recommended?: boolean;
  createsAttention?: boolean;
}

export interface ShowMapActionState {
  tree: ShowMapTree;
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

function actionsForNode(node: ShowMapNode, tree: ShowMapTree): ShowMapAction[] {
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
        node.href
      )
    );
    return actions;
  }

  if (node.type === 'trial') {
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
        node.href
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
        node.href
      ),
    ];
  }

  return [];
}

export function getRankedActions(
  scope: ShowMapActionScope,
  state: ShowMapActionState
): ShowMapAction[] {
  return scopedNodes(scope, state.tree)
    .flatMap(node => actionsForNode(node, state.tree))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.label.localeCompare(b.label);
    });
}

export function getRecommendedActions(
  scope: ShowMapActionScope,
  state: ShowMapActionState,
  limit = 2
): ShowMapAction[] {
  return getRankedActions(scope, state)
    .filter(action => action.recommended)
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

export function getAttentionNodeIds(tree: ShowMapTree): Set<string> {
  const nodeIds = new Set<string>();
  for (const action of getAttentionActions('root', { tree })) {
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
  const actions = getRankedActions(node, state).filter(action => action.href);
  return actions[0];
}
