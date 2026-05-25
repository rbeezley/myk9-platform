import { sourceIdFromShowMapNodeId } from './showMapActionMutations';
import type { ShowMapNode, ShowMapTree } from './showMapTypes';

export interface ReviewQueueDogGroup {
  // Stable group key — `dog:${dogId}` when known, else `node:${entryNodeId}`
  // for entries with no dogId (each becomes its own size-1 group).
  key: string;
  dogId?: string;
  dogName: string;
  handler?: string;
  // Source-of-truth entry UUIDs for the bulk mutation.
  entryIds: string[];
  // ShowMapNode ids for rendering/expansion.
  entryNodeIds: string[];
  count: number;
}

function isSubmittedEntry(node: ShowMapNode): boolean {
  return node.type === 'entry' && node.status?.value === 'submitted';
}

export function buildReviewQueue(tree: ShowMapTree): ReviewQueueDogGroup[] {
  const byKey = new Map<string, ReviewQueueDogGroup>();
  const order: string[] = [];

  for (const node of Object.values(tree.nodesById)) {
    if (!isSubmittedEntry(node)) continue;
    const entryId = sourceIdFromShowMapNodeId(node.id, 'entry');
    if (!entryId) continue;
    const dogId = node.entryDisplay?.dogId;
    const key = dogId ? `dog:${dogId}` : `node:${node.id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.entryIds.push(entryId);
      existing.entryNodeIds.push(node.id);
      existing.count = existing.entryIds.length;
    } else {
      const group: ReviewQueueDogGroup = {
        key,
        dogName: node.entryDisplay?.dogName ?? 'Unknown',
        entryIds: [entryId],
        entryNodeIds: [node.id],
        count: 1,
        ...(dogId ? { dogId } : {}),
        ...(node.entryDisplay?.handler ? { handler: node.entryDisplay.handler } : {}),
      };
      byKey.set(key, group);
      order.push(key);
    }
  }

  return order.map(key => byKey.get(key)!);
}

export function reviewQueueTotalCount(groups: readonly ReviewQueueDogGroup[]): number {
  return groups.reduce((sum, group) => sum + group.count, 0);
}
