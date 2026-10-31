import { listRegistries } from '@/features/registries';
import { getScentWorkSport } from '@/features/registries/scentWork';

/**
 * One element rank and one level rank for every scent-work registry at once.
 *
 * The Entry Forms page has no registry id in hand, but a show never mixes registries, so a rank
 * merged from all of them orders any one show the way its own registry does. The merge is
 * derived from the registry config (never hand-listed) and throws if two registries order a pair
 * of labels differently, so a conflict cannot pass unnoticed.
 */

/** Merge ordered lists into one list that keeps every list's order. Throws on a conflict. */
export function mergeOrderedLists(lists: readonly (readonly string[])[]): string[] {
  const nodes: string[] = [];
  const after = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const list of lists) {
    for (const label of list) {
      if (!after.has(label)) {
        nodes.push(label);
        after.set(label, new Set());
        indegree.set(label, 0);
      }
    }
    for (let i = 1; i < list.length; i += 1) {
      const from = list[i - 1]!;
      const to = list[i]!;
      if (!after.get(from)!.has(to)) {
        after.get(from)!.add(to);
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
      }
    }
  }
  const out: string[] = [];
  const remaining = new Set(nodes);
  while (remaining.size > 0) {
    const next = nodes.find(label => remaining.has(label) && indegree.get(label) === 0);
    if (next === undefined) throw new Error('Registries order scent-work labels inconsistently');
    remaining.delete(next);
    out.push(next);
    for (const to of after.get(next)!) indegree.set(to, (indegree.get(to) ?? 0) - 1);
  }
  return out;
}

function registryOrders() {
  const sports = listRegistries().map(id => getScentWorkSport(id));
  return {
    elements: sports.map(sport => sport.elements.map(element => element.label)),
    levels: sports.map(sport =>
      [...sport.levels].sort((a, b) => a.order - b.order).map(level => level.label)
    ),
  };
}

let ranks: { elements: Map<string, number>; levels: Map<string, number> } | null = null;

function loadRanks() {
  if (ranks) return ranks;
  const orders = registryOrders();
  const toRanks = (labels: string[]) =>
    new Map(labels.map((label, index) => [label.toLowerCase(), index]));
  ranks = {
    elements: toRanks(mergeOrderedLists(orders.elements)),
    levels: toRanks(mergeOrderedLists(orders.levels)),
  };
  return ranks;
}

/** Rank of a stored `classes.element`; null when unknown. Tolerates case and a plural. */
export function elementRank(value: string | null | undefined): number | null {
  const key = (value ?? '').trim().toLowerCase();
  const map = loadRanks().elements;
  return map.get(key) ?? map.get(key.replace(/s$/, '')) ?? null;
}

/** Rank of a stored `classes.level`; null when unknown. 'Masters' is AKC's legacy 'Master'. */
export function levelRank(value: string | null | undefined): number | null {
  const key = (value ?? '').trim().toLowerCase();
  return loadRanks().levels.get(key === 'masters' ? 'master' : key) ?? null;
}
