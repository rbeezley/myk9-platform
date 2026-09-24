// Loads the entries a paid entry payment (payment link or Finish Payment
// recovery cart) must settle, and decides which row carries the money.
//
// Deno-free so it runs under vitest: the webhook passes a fetcher that wraps
// its service-role client, and every rule about which row settles lives here.
import { INACTIVE_ENTRY_STATUSES } from '../_shared/entryPaymentReconcile.ts';

export type PaymentReconciliationEntry = {
  id: string;
  payment_status: string | null;
  entry_status: string | null;
  deleted_at: string | null;
  moved_from_entry_id: string | null;
  stripe_payment_intent_id: string | null;
};

export const PAYMENT_RECONCILIATION_ENTRY_COLUMNS =
  'id, payment_status, entry_status, deleted_at, moved_from_entry_id, stripe_payment_intent_id';

type FetchError = { message: string } | null;

/** `select(PAYMENT_RECONCILIATION_ENTRY_COLUMNS).in(column, ids)` on `entries`. */
export type FetchReconciliationEntries = (
  column: 'id' | 'moved_from_entry_id',
  ids: string[]
) => Promise<{ data: PaymentReconciliationEntry[] | null; error: FetchError }>;

export type PaymentReconciliationLoad = {
  entries: PaymentReconciliationEntry[];
  reconciliationEntryIds: string[];
  duplicateEntryIds: string[];
  lifecycleEntryIdsByRoot: Record<string, string>;
  /** Moved money root -> the one live entry that now carries its run. */
  liveEntryIdByRoot: Record<string, string>;
  blockedEntryIds: string[];
  error: FetchError;
};

/** Same cap as features/financial/moneyRoot.ts MONEY_ROOT_MAX_DEPTH. */
const MAX_MOVE_CHAIN_HOPS = 16;

type EntryIndex = Map<string, PaymentReconciliationEntry>;

type MoveTree = {
  entriesById: EntryIndex;
  childIdsByParent: Map<string, string[]>;
  /** Rows whose children were loaded; anything else past the hop cap is unknown. */
  expandedIds: Set<string>;
};

const isMoved = (entry: PaymentReconciliationEntry | undefined) => entry?.entry_status === 'moved';

/** Not deleted, not superseded, and still in the show. */
function isLiveEntry(entry: PaymentReconciliationEntry): boolean {
  return (
    !entry.deleted_at && !isMoved(entry) && !INACTIVE_ENTRY_STATUSES.has(entry.entry_status ?? '')
  );
}

/** Load the requested rows and every ancestor on their moved_from_entry_id chains. */
async function loadAncestors(
  entryIds: string[],
  fetchEntries: FetchReconciliationEntries,
  entriesById: EntryIndex
): Promise<FetchError> {
  let lookupIds = [...new Set(entryIds)];
  for (let hop = 0; hop <= MAX_MOVE_CHAIN_HOPS && lookupIds.length > 0; hop += 1) {
    const response = await fetchEntries('id', lookupIds);
    if (response.error) return response.error;
    const rows = response.data ?? [];
    for (const row of rows) entriesById.set(row.id, row);
    const parentIds = rows
      .map(row => row.moved_from_entry_id)
      .filter((id): id is string => Boolean(id) && !entriesById.has(id as string));
    lookupIds = [...new Set(parentIds)];
  }
  return null;
}

/** Load every row that moved out of the given roots, level by level. */
async function loadDescendants(
  rootIds: Iterable<string>,
  fetchEntries: FetchReconciliationEntries,
  tree: MoveTree
): Promise<FetchError> {
  let frontier = [...rootIds];
  for (let hop = 0; hop <= MAX_MOVE_CHAIN_HOPS && frontier.length > 0; hop += 1) {
    for (const id of frontier) tree.expandedIds.add(id);
    const response = await fetchEntries('moved_from_entry_id', frontier);
    if (response.error) return response.error;
    const next = new Set<string>();
    for (const child of response.data ?? []) {
      const parentId = child.moved_from_entry_id;
      if (!parentId) continue;
      if (!tree.entriesById.has(child.id)) tree.entriesById.set(child.id, child);
      const siblings = tree.childIdsByParent.get(parentId) ?? [];
      if (!siblings.includes(child.id)) siblings.push(child.id);
      tree.childIdsByParent.set(parentId, siblings);
      if (isMoved(child) && !child.deleted_at && !tree.expandedIds.has(child.id)) {
        next.add(child.id);
      }
    }
    frontier = [...next];
  }
  return null;
}

/** Follow moved_from_entry_id up from an entry to the row holding its money. */
function resolveUpward(
  entriesById: EntryIndex,
  entryId: string
): { rootId: string; blocked: boolean } {
  const blocked = { rootId: entryId, blocked: true };
  let currentId = entryId;
  const seen = new Set<string>();
  for (;;) {
    if (seen.has(currentId)) return blocked;
    seen.add(currentId);
    const parentId = entriesById.get(currentId)?.moved_from_entry_id;
    if (!parentId) break;
    const parent = entriesById.get(parentId);
    if (!parent || parent.deleted_at) return blocked;
    currentId = parentId;
  }
  const resolvedRoot = entriesById.get(currentId);
  if (currentId !== entryId && INACTIVE_ENTRY_STATUSES.has(resolvedRoot?.entry_status ?? '')) {
    return blocked;
  }
  return { rootId: currentId, blocked: false };
}

/**
 * The live entries a moved root's run now sits in, or null when the tree is
 * unsafe to read: a cycle, or a moved row past the hop cap whose children were
 * never loaded.
 */
function liveDescendantIds(tree: MoveTree, rootId: string): string[] | null {
  const seen = new Set([rootId]);
  const live: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (!tree.expandedIds.has(id)) return null;
    for (const childId of tree.childIdsByParent.get(id) ?? []) {
      if (seen.has(childId)) return null;
      seen.add(childId);
      const child = tree.entriesById.get(childId)!;
      if (isMoved(child) && !child.deleted_at) stack.push(childId);
      else if (isLiveEntry(child)) live.push(childId);
    }
  }
  return live;
}

/**
 * The one live descendant of a moved root whose chain leads back to exactly
 * that root; null for a stale, forked, cyclic or broken tree.
 */
function soleLiveDescendant(tree: MoveTree, rootId: string): string | null {
  const live = liveDescendantIds(tree, rootId);
  if (!live || live.length !== 1) return null;
  const { rootId: resolved, blocked } = resolveUpward(tree.entriesById, live[0]);
  return !blocked && resolved === rootId ? live[0] : null;
}

/** The rows whose descendants decide whether a moved root may settle. */
function movedRootsToDescend(entriesById: EntryIndex, entryIds: string[]): Set<string> {
  const roots = new Set<string>();
  for (const entryId of entryIds) {
    if (isMoved(entriesById.get(entryId))) {
      roots.add(entryId);
      continue;
    }
    const { rootId, blocked } = resolveUpward(entriesById, entryId);
    if (!blocked && rootId !== entryId && isMoved(entriesById.get(rootId))) roots.add(rootId);
  }
  return roots;
}

/**
 * The row that settles one requested entry, or null when it must stay blocked.
 * Records the live entry carrying a moved root's run in `liveEntryIdByRoot`.
 */
function resolveSettlementRow(
  tree: MoveTree,
  entryId: string,
  liveEntryIdByRoot: Record<string, string>
): string | null {
  const entry = tree.entriesById.get(entryId);
  if (entry?.deleted_at) return null;
  if (isMoved(entry)) {
    // MYK9-639: a moved row IS the money root that the balance summary and the
    // recovery cart send. It settles when exactly one live entry carries its
    // run; that live entry holds no charge of its own.
    const liveId = soleLiveDescendant(tree, entryId);
    if (!liveId) return null;
    liveEntryIdByRoot[entryId] = liveId;
    return entryId;
  }
  if (INACTIVE_ENTRY_STATUSES.has(entry?.entry_status ?? '')) return entryId;
  const { rootId, blocked } = resolveUpward(tree.entriesById, entryId);
  if (blocked) return null;
  if (rootId !== entryId && isMoved(tree.entriesById.get(rootId))) {
    // The same rule seen from the destination: a forked root is ambiguous.
    if (soleLiveDescendant(tree, rootId) !== entryId) return null;
    liveEntryIdByRoot[rootId] = entryId;
  }
  return rootId;
}

function collectLifecycleEntryIds(
  entriesById: EntryIndex,
  entryIds: string[],
  reconciliationEntryIds: string[],
  liveEntryIdByRoot: Record<string, string>,
  blockedIds: Set<string>
): Record<string, string> {
  const lifecycleEntryIdsByRoot: Record<string, string> = {};
  for (const [index, entryId] of entryIds.entries()) {
    const rootId = reconciliationEntryIds[index];
    if (entriesById.get(entryId)?.entry_status === 'pending-payment' && rootId !== entryId) {
      lifecycleEntryIdsByRoot[rootId] = entryId;
    }
  }
  // A root paid directly still advances the live entry it moved into.
  for (const [rootId, liveId] of Object.entries(liveEntryIdByRoot)) {
    const advances = entriesById.get(liveId)?.entry_status === 'pending-payment';
    if (advances && !blockedIds.has(rootId) && !lifecycleEntryIdsByRoot[rootId]) {
      lifecycleEntryIdsByRoot[rootId] = liveId;
    }
  }
  return lifecycleEntryIdsByRoot;
}

function collectDuplicateEntryIds(entryIds: string[], reconciliationEntryIds: string[]): string[] {
  const indicesByRoot = new Map<string, number[]>();
  for (const [index, rootId] of reconciliationEntryIds.entries()) {
    const indices = indicesByRoot.get(rootId) ?? [];
    indices.push(index);
    indicesByRoot.set(rootId, indices);
  }
  const duplicateEntryIds: string[] = [];
  for (const [rootId, indices] of indicesByRoot) {
    const canonicalIndex = indices.find(index => entryIds[index] === rootId) ?? indices[0];
    for (const index of indices) {
      if (index !== canonicalIndex) duplicateEntryIds.push(entryIds[index]);
    }
  }
  return duplicateEntryIds;
}

export async function loadPaymentReconciliationEntries(
  entryIds: string[],
  fetchEntries: FetchReconciliationEntries
): Promise<PaymentReconciliationLoad> {
  const tree: MoveTree = {
    entriesById: new Map(),
    childIdsByParent: new Map(),
    expandedIds: new Set(),
  };
  let error = await loadAncestors(entryIds, fetchEntries, tree.entriesById);
  if (!error) {
    const roots = movedRootsToDescend(tree.entriesById, entryIds);
    error = await loadDescendants(roots, fetchEntries, tree);
  }

  const blockedIds = new Set<string>();
  const liveEntryIdByRoot: Record<string, string> = {};
  const reconciliationEntryIds = entryIds.map(entryId => {
    const settlementId = resolveSettlementRow(tree, entryId, liveEntryIdByRoot);
    if (settlementId === null) blockedIds.add(entryId);
    return settlementId ?? entryId;
  });
  // A payment link may redundantly contain both a moved money root and its
  // live destination. The root row is still the settlement target; only the
  // stale root checkout line is a duplicate. Keep the root eligible whenever
  // an unblocked destination already resolves to it.
  for (const [index, rootId] of reconciliationEntryIds.entries()) {
    if (rootId !== entryIds[index] && !blockedIds.has(entryIds[index])) {
      blockedIds.delete(rootId);
    }
  }

  return {
    entries: [...tree.entriesById.values()],
    reconciliationEntryIds,
    duplicateEntryIds: collectDuplicateEntryIds(entryIds, reconciliationEntryIds),
    lifecycleEntryIdsByRoot: collectLifecycleEntryIds(
      tree.entriesById,
      entryIds,
      reconciliationEntryIds,
      liveEntryIdByRoot,
      blockedIds
    ),
    liveEntryIdByRoot,
    blockedEntryIds: [...blockedIds],
    error,
  };
}
