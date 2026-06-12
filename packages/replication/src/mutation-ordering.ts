import type { PendingMutation } from './types';

export interface MutationOrderingResult {
  sorted: PendingMutation[];
  circularCount: number;
}

/**
 * Sort pending mutations so dependencies upload before dependents.
 *
 * Missing dependencies are assumed to have uploaded in an earlier batch and do
 * not block the current mutation. Cycles cannot be resolved safely, so the
 * remaining mutations are appended in stable sequence/timestamp order to match
 * the legacy MutationManager behavior.
 */
export function sortMutationsByDependencies(
  mutations: PendingMutation[]
): MutationOrderingResult {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const mutationMap = new Map<string, PendingMutation>();

  for (const mutation of mutations) {
    mutationMap.set(mutation.id, mutation);
    graph.set(mutation.id, []);
    inDegree.set(mutation.id, 0);
  }

  for (const mutation of mutations) {
    if (!mutation.dependsOn || mutation.dependsOn.length === 0) continue;

    for (const depId of mutation.dependsOn) {
      if (mutationMap.has(depId)) {
        graph.get(depId)!.push(mutation.id);
        inDegree.set(mutation.id, (inDegree.get(mutation.id) || 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  const sorted: PendingMutation[] = [];
  const roots: PendingMutation[] = [];

  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      roots.push(mutationMap.get(id)!);
    }
  }

  roots.sort((a, b) => a.timestamp - b.timestamp);
  for (const mutation of roots) {
    queue.push(mutation.id);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const mutation = mutationMap.get(id)!;
    sorted.push(mutation);

    const dependents = graph.get(id) || [];
    for (const depId of dependents) {
      const newDegree = (inDegree.get(depId) || 0) - 1;
      inDegree.set(depId, newDegree);

      if (newDegree === 0) {
        queue.push(depId);
      }
    }
  }

  const circularCount = mutations.length - sorted.length;

  if (circularCount > 0) {
    const sortedIds = new Set(sorted.map(m => m.id));
    const remaining = mutations.filter(m => !sortedIds.has(m.id));

    remaining.sort((a, b) => {
      if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
        return a.sequenceNumber - b.sequenceNumber;
      }
      return a.timestamp - b.timestamp;
    });

    sorted.push(...remaining);
  }

  return { sorted, circularCount };
}
