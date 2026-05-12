import type {
  ShowMapFilter,
  ShowMapLayoutResult,
  ShowMapNode,
  ShowMapTree,
} from './showMapTypes';

export const SHOW_MAP_LAYOUT = {
  columnWidth: 300,
  rowHeight: 132,
  nodeWidth: 244,
} as const;

function nodeMatchesFilter(node: ShowMapNode, filter: ShowMapFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'needs-attention') return (node.attentionCount ?? 0) > 0 || node.status?.kind === 'attention';
  if (filter === 'complete') return node.status?.kind === 'complete';
  return node.status?.kind === 'active';
}

function descendantsMatch(tree: ShowMapTree, nodeId: string, filter: ShowMapFilter): boolean {
  const childIds = tree.childIdsByParentId[nodeId] ?? [];
  return childIds.some(childId => {
    const child = tree.nodesById[childId];
    return !!child && (nodeMatchesFilter(child, filter) || descendantsMatch(tree, childId, filter));
  });
}

export function getInitialExpandedNodeIds(tree: ShowMapTree): Set<string> {
  return new Set([tree.root.id, ...(tree.childIdsByParentId[tree.root.id] ?? [])]);
}

export function buildShowMapLayout(
  tree: ShowMapTree,
  expandedNodeIds: Set<string>,
  options: {
    filter?: ShowMapFilter;
    onToggle: (nodeId: string) => void;
    onNavigate?: (href: string) => void;
  }
): ShowMapLayoutResult {
  const filter = options.filter ?? 'all';
  const nodes: ShowMapLayoutResult['nodes'] = [];
  const edges: ShowMapLayoutResult['edges'] = [];
  let row = 0;

  function visit(nodeId: string, depth: number): void {
    const node = tree.nodesById[nodeId];
    if (!node) return;

    const matches = nodeMatchesFilter(node, filter);
    const hasMatchingDescendant = filter === 'all' ? false : descendantsMatch(tree, nodeId, filter);
    if (filter !== 'all' && !matches && !hasMatchingDescendant && node.type !== 'show') return;

    const childIds = tree.childIdsByParentId[nodeId] ?? [];
    nodes.push({
      id: node.id,
      type: 'showMapNode',
      position: {
        x: depth * SHOW_MAP_LAYOUT.columnWidth,
        y: row * SHOW_MAP_LAYOUT.rowHeight,
      },
      data: {
        node,
        isExpanded: expandedNodeIds.has(node.id),
        isFilteredOut: filter !== 'all' && !matches,
        hasChildren: childIds.length > 0,
        onToggle: options.onToggle,
        ...(options.onNavigate ? { onNavigate: options.onNavigate } : {}),
      },
    });
    row += 1;

    if (!expandedNodeIds.has(node.id)) return;
    for (const childId of childIds) {
      const beforeCount = nodes.length;
      visit(childId, depth + 1);
      if (nodes.length > beforeCount) {
        edges.push({
          id: `${node.id}->${childId}`,
          source: node.id,
          target: childId,
          type: 'smoothstep',
        });
      }
    }
  }

  visit(tree.root.id, 0);
  return { nodes, edges };
}
