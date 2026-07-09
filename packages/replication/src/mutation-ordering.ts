import type { PendingMutation } from './types';

export interface MutationOrderingResult {
  sorted: PendingMutation[];
  circularCount: number;
}

/**
 * Total order for mutations otherwise unconstrained by dependencies.
 *
 * Primary key is the monotonic `sequenceNumber` assigned at queue time — this
 * is what makes two edits to the SAME row upload oldest-first even when their
 * `timestamp` collides to the millisecond (July 2026 audit finding H1: a stale
 * re-stamped payload could otherwise overwrite a correction). Falls back to
 * `timestamp` when either mutation predates sequence assignment (a queue
 * persisted before the upgrade, or a mid-rollback mix), so mixed queues stay
 * stable rather than sorting all unassigned rows ahead of assigned ones.
 */
export function compareMutationOrder(a: PendingMutation, b: PendingMutation): number {
  // Use ONE consistent key space so the comparator stays transitive even for a
  // mixed queue (some mutations pre-date sequence assignment). A missing
  // sequenceNumber sorts as -Infinity — i.e. oldest — which is correct: those
  // mutations were queued before the upgrade that started assigning sequences.
  // (Switching keys per-pair — seq for both-present, timestamp otherwise —
  // breaks transitivity and yields an engine-defined sort.)
  const seqA = a.sequenceNumber ?? -Infinity;
  const seqB = b.sequenceNumber ?? -Infinity;
  if (seqA !== seqB) return seqA - seqB;
  return a.timestamp - b.timestamp;
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

  roots.sort(compareMutationOrder);
  for (const mutation of roots) {
    queue.push(mutation.id);
  }

  // Priority-ordered topological walk: among all currently-ready (in-degree 0)
  // mutations, always take the one that comes first by compareMutationOrder, so
  // sequence order holds within the dependency constraint (not just among the
  // initial roots).
  while (queue.length > 0) {
    queue.sort((a, b) => compareMutationOrder(mutationMap.get(a)!, mutationMap.get(b)!));
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

    remaining.sort(compareMutationOrder);

    sorted.push(...remaining);
  }

  return { sorted, circularCount };
}
