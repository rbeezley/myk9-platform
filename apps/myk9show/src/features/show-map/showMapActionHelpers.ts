import type { ShowMapNode, ShowMapNodeType, ShowMapTree } from './showMapTypes';

const SYNTHETIC_DISPLAY_ACTION_NODE_TYPES = new Set<ShowMapNodeType>([
  'all-exhibitors',
  'dog',
  'more',
]);

export function isSyntheticDisplayActionNode(node: ShowMapNode): boolean {
  return SYNTHETIC_DISPLAY_ACTION_NODE_TYPES.has(node.type);
}

export function isClassReadyToScore(node: ShowMapNode): boolean {
  return node.type === 'class' && node.status?.kind === 'active' && Boolean(node.scoreHref);
}

export function canMarkClassStarted(node: ShowMapNode): boolean {
  return node.type === 'class' && node.status?.kind === 'neutral';
}

export function canMarkClassComplete(node: ShowMapNode): boolean {
  if (node.type !== 'class' || node.status?.kind !== 'active') return false;
  // No progress data means an empty class; let the secretary close it out.
  if (!node.progress) return true;
  return node.progress.completed >= node.progress.total;
}

export function canMarkEntryCheckedIn(node: ShowMapNode): boolean {
  if (node.type !== 'entry') return false;
  if (node.status?.kind === 'complete' || node.status?.kind === 'muted') return false;
  return !['checked-in', 'completed', 'pulled'].includes(node.checkInStatus?.value ?? '');
}

export function canMessageEntryHandler(node: ShowMapNode): boolean {
  return node.type === 'entry' && Boolean(node.entryDisplay?.handlerId);
}

export function sourceIdFromNodeId(
  nodeId: string | undefined,
  expectedType: string
): string | undefined {
  const prefix = `${expectedType}:`;
  if (!nodeId?.startsWith(prefix)) return undefined;
  const sourceId = nodeId.slice(prefix.length);
  return sourceId.length > 0 ? sourceId : undefined;
}

export function getNodeSourceId(node: ShowMapNode, expectedType: string): string | undefined {
  return sourceIdFromNodeId(node.id, expectedType);
}

export function getEntrySourceId(node: ShowMapNode): string | undefined {
  return getNodeSourceId(node, 'entry') ?? getNodeSourceId(node, 'dog-entry');
}

export function getParentSourceId(
  node: ShowMapNode,
  tree: ShowMapTree,
  expectedType: string
): string | undefined {
  const parent = node.parentId ? tree.nodesById[node.parentId] : undefined;
  return parent ? getNodeSourceId(parent, expectedType) : undefined;
}

export function getRootShowId(tree: ShowMapTree): string | undefined {
  return getNodeSourceId(tree.root, 'show');
}
