import {
  getNodeDayBucket,
  isDimmedByDayScope,
  nodeMatchesCompletionScope,
  nodeMatchesDayScope,
} from './showMapTimeScope';
import type { ShowMapFilter, ShowMapNode, ShowMapScopeState, ShowMapTree } from './showMapTypes';

export function supportsTreeKeyboardActions(node: ShowMapNode): boolean {
  return (
    node.type === 'all-exhibitors' ||
    node.type === 'trial' ||
    node.type === 'class' ||
    node.type === 'dog' ||
    node.type === 'entry' ||
    node.type === 'dog-entry'
  );
}

function nodeMatchesFilter(
  node: ShowMapNode,
  filter: ShowMapFilter,
  attentionNodeIds: Set<string>
): boolean {
  if (filter === 'all') return true;
  if (filter === 'needs-attention') {
    return attentionNodeIds.has(node.id);
  }
  return node.status?.kind === 'active';
}

function nodeMatchesScopeAndFilter(
  tree: ShowMapTree,
  node: ShowMapNode,
  filter: ShowMapFilter,
  attentionNodeIds: Set<string>,
  scope: ShowMapScopeState,
  scopeNow: Date
): boolean {
  return (
    nodeMatchesDayScope(tree, node, scope.dayScope, scopeNow) &&
    nodeMatchesCompletionScope(node, scope.completionScope) &&
    nodeMatchesFilter(node, filter, attentionNodeIds)
  );
}

function nodeCanMatchDirectly(node: ShowMapNode): boolean {
  return node.type !== 'all-exhibitors' && node.type !== 'dog';
}

function descendantsMatch(
  tree: ShowMapTree,
  nodeId: string,
  filter: ShowMapFilter,
  attentionNodeIds: Set<string>,
  scope: ShowMapScopeState,
  scopeNow: Date
): boolean {
  const childIds = tree.childIdsByParentId[nodeId] ?? [];
  return childIds.some(childId => {
    const child = tree.nodesById[childId];
    return (
      !!child &&
      (nodeMatchesScopeAndFilter(tree, child, filter, attentionNodeIds, scope, scopeNow) ||
        descendantsMatch(tree, childId, filter, attentionNodeIds, scope, scopeNow))
    );
  });
}

export function shouldRenderShowMapNode(
  tree: ShowMapTree,
  node: ShowMapNode,
  filter: ShowMapFilter,
  attentionNodeIds: Set<string>,
  scope: ShowMapScopeState,
  scopeNow: Date
): boolean {
  return (
    node.type === 'show' ||
    (nodeCanMatchDirectly(node) &&
      nodeMatchesScopeAndFilter(tree, node, filter, attentionNodeIds, scope, scopeNow)) ||
    descendantsMatch(tree, node.id, filter, attentionNodeIds, scope, scopeNow)
  );
}

export function getShowMapNodeScopeAttrs(
  tree: ShowMapTree,
  node: ShowMapNode,
  scope: ShowMapScopeState,
  scopeNow: Date
) {
  return {
    'data-day-bucket': getNodeDayBucket(tree, node, scopeNow),
    'data-completion-view': scope.completionScope,
    isDimmed: isDimmedByDayScope(tree, node, scope, scopeNow),
  };
}

export function getVisibleKeyboardNodeIds({
  tree,
  expandedNodeIds,
  filter,
  attentionNodeIds,
  scope,
  scopeNow,
}: {
  tree: ShowMapTree;
  expandedNodeIds: Set<string>;
  filter: ShowMapFilter;
  attentionNodeIds: Set<string>;
  scope: ShowMapScopeState;
  scopeNow: Date;
}): string[] {
  const visibleNodeIds: string[] = [];

  const walk = (nodeId: string): void => {
    const node = tree.nodesById[nodeId];
    if (!node || !shouldRenderShowMapNode(tree, node, filter, attentionNodeIds, scope, scopeNow)) {
      return;
    }

    if (supportsTreeKeyboardActions(node)) {
      visibleNodeIds.push(node.id);
    }

    if (!expandedNodeIds.has(node.id)) {
      return;
    }

    for (const childId of tree.childIdsByParentId[node.id] ?? []) {
      walk(childId);
    }
  };

  for (const childId of tree.childIdsByParentId[tree.root.id] ?? []) {
    walk(childId);
  }

  return visibleNodeIds;
}

export function getFirstVisibleKeyboardChildNodeId(
  tree: ShowMapTree,
  visibleKeyboardNodeIds: string[],
  nodeId: string
): string | undefined {
  const visibleIds = new Set(visibleKeyboardNodeIds);
  return (tree.childIdsByParentId[nodeId] ?? []).find(childId => visibleIds.has(childId));
}

export function getParentKeyboardNodeId(
  tree: ShowMapTree,
  visibleKeyboardNodeIds: string[],
  node: ShowMapNode
): string | undefined {
  const visibleIds = new Set(visibleKeyboardNodeIds);
  let parentId = node.parentId;
  while (parentId) {
    const parent = tree.nodesById[parentId];
    if (!parent) return undefined;
    if (visibleIds.has(parent.id) && supportsTreeKeyboardActions(parent)) return parent.id;
    parentId = parent.parentId;
  }
  return undefined;
}
